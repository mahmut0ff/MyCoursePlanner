/**
 * API: Конкурсы и олимпиады — сторона организатора.
 *
 * Право `contests` (read / write / delete). Жюри сюда не попадает вообще:
 * verifyAuth без allowJury отказывает учётке «Жюри», а сотрудник, назначенный
 * в жюри, без права `contests` получит 403 — свои проекты он оценивает через
 * api-contest-judge и чужих оценок не видит.
 *
 * Модель данных и чистая логика (рейтинг, ничьи, номера) — src/lib/contests.ts.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from './utils/firebase-admin';
import {
  verifyAuth, can, getMembershipData,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';
import {
  COL, now, juryDocId, scoreDocId, resultsDocId,
  normalizeContest, loadContest, loadParticipants, loadJury, loadScores, loadResults,
  hasAnyScores, publishLive, bumpRev, sanitizeMeta, mergeCategories, sanitizeCriteria, criteriaLocked,
} from './utils/contests';
import {
  rankCategory, blockingTies, validateScores, categoryForAge, participantAge,
  formatProjectNumber, juryForCategory, prizeLabel, authorsLabel,
  type Contest, type ContestParticipant, type ContestJuryMember, type ContestScore,
  type ContestCategoryResults, type ContestStatus, type ContestAuthor, type ApprovedRow, type TieResolution,
} from '../../src/lib/contests';
import { formatMoney } from '../../src/lib/money';

const conflict = (msg: string, extra?: Record<string, unknown>) => jsonResponse(409, { error: msg, ...(extra || {}) });

function sanitizeAuthors(input: any): { ok: true; authors: ContestAuthor[] } | { ok: false; error: string } {
  const list = Array.isArray(input) ? input : [];
  const authors: ContestAuthor[] = [];
  for (const a of list.slice(0, 10)) {
    const name = String(a?.name ?? '').trim().slice(0, 150);
    if (!name) continue;
    const ageNum = Number(a?.age);
    const age = a?.age === '' || a?.age === null || a?.age === undefined || !Number.isFinite(ageNum)
      ? null : Math.round(ageNum);
    if (age !== null && (age < 3 || age > 120)) return { ok: false, error: `Некорректный возраст: ${name}` };
    authors.push({ name, age });
  }
  if (!authors.length) return { ok: false, error: 'Укажите ФИО участника' };
  return { ok: true, authors };
}

/** Рейтинг категории по данным с сервера — тот же код, что рисует экран. */
function rankFor(contest: Contest, categoryId: string, participants: ContestParticipant[], jury: ContestJuryMember[], scores: ContestScore[], results: ContestCategoryResults | undefined) {
  const inCat = participants.filter((p) => p.categoryId === categoryId && p.status === 'arrived');
  const ids = new Set(inCat.map((p) => p.id));
  return rankCategory({
    participants: inCat,
    scores: scores.filter((s) => ids.has(s.participantId)),
    assignedJuryUids: juryForCategory(jury, categoryId).map((j) => j.uid),
    criteria: contest.criteria,
    tieBreakCriterionIds: contest.tieBreakCriterionIds,
    tieResolutions: results?.tieResolutions || [],
  });
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized(event);
  if (!user.organizationId) return forbidden();
  const orgId = user.organizationId;

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const isGet = event.httpMethod === 'GET';

  if (isGet && !can(user, 'contests', 'read')) return forbidden('Недостаточно прав для этого действия');
  if (!isGet) {
    const needs = ['delete', 'deleteParticipant'].includes(action) ? 'delete' : 'write';
    if (!can(user, 'contests', needs)) return forbidden('Недостаточно прав для этого действия');
  }

  let body: any = {};
  if (!isGet) {
    try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
  }

  /** Конкурс этой организации или ответ-ошибка. */
  const ownContest = async (id: string | undefined): Promise<Contest | ReturnType<typeof notFound>> => {
    const c = await loadContest(String(id || ''));
    if (!c || c.organizationId !== orgId) return notFound('Конкурс не найден');
    return c;
  };
  const isResp = (x: any): x is ReturnType<typeof notFound> => x && typeof x.statusCode === 'number';
  const editable = (c: Contest) => (c.status === 'finished' ? conflict('Конкурс завершён — доступен только просмотр') : null);

  try {
    // ═══ ЧТЕНИЕ ═══
    if (isGet && action === 'list') {
      const snap = await adminDb.collection(COL.contests).where('organizationId', '==', orgId).get();
      const list = snap.docs.map((d: any) => normalizeContest(d.id, d.data()))
        .sort((a, b) => String(b.eventDate || b.createdAt).localeCompare(String(a.eventDate || a.createdAt)));
      return ok(list);
    }

    if (isGet && action === 'get') {
      const c = await ownContest(params.id);
      if (isResp(c)) return c;
      const [participants, jury, scores, results] = await Promise.all([
        loadParticipants(c.id), loadJury(c.id), loadScores(c.id), loadResults(c.id),
      ]);
      return ok({ contest: c, participants, jury, scores, results });
    }

    if (isGet && action === 'log') {
      const c = await ownContest(params.id);
      if (isResp(c)) return c;
      if (!params.participantId) return badRequest('participantId required');
      const snap = await adminDb.collection(COL.log).where('participantId', '==', params.participantId).get();
      const entries = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
        .filter((e: any) => e.contestId === c.id)
        .sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)));
      return ok(entries);
    }

    if (isGet) return badRequest('Unknown action');

    // ═══ КОНКУРС ═══
    if (action === 'create') {
      const meta = sanitizeMeta(body);
      if (!meta.title) return badRequest('Укажите название');
      const ref = adminDb.collection(COL.contests).doc();
      const doc = {
        organizationId: orgId,
        title: meta.title,
        season: meta.season || '',
        kind: meta.kind || 'olympiad',
        theme: meta.theme || '',
        eventDate: meta.eventDate || '',
        venue: meta.venue || '',
        prizeFund: meta.prizeFund || 0,
        description: meta.description || '',
        status: 'draft' as ContestStatus,
        categories: [],
        criteria: [],
        tieBreakCriterionIds: [],
        judgingMode: meta.judgingMode || 'host',
        rev: 0,
        createdAt: now(),
        createdBy: user.uid,
        updatedAt: now(),
      };
      await ref.set(doc);
      const contest = normalizeContest(ref.id, doc);
      await publishLive(contest, []);
      return ok(contest);
    }

    if (action === 'update') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const meta = sanitizeMeta(body);
      if (meta.title === '') return badRequest('Укажите название');
      await adminDb.collection(COL.contests).doc(c.id).update({ ...meta, rev: FieldValue.increment(1), updatedAt: now() });
      return ok({ ...c, ...meta });
    }

    if (action === 'setStatus') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const order: ContestStatus[] = ['draft', 'registration', 'judging', 'finished'];
      const to = body.status as ContestStatus;
      if (!order.includes(to)) return badRequest('Некорректный статус');
      if (c.status === 'finished') return conflict('Завершённый конкурс нельзя вернуть в работу');
      const from = order.indexOf(c.status);
      const target = order.indexOf(to);
      if (target === from) return ok(c);
      if (target > from + 1) return conflict('Статусы меняются по порядку: Черновик → Регистрация → Оценивание → Завершён');
      if (target < from) {
        if (target !== from - 1) return conflict('Назад можно вернуться только на один шаг');
        if (c.categories.some((cat) => cat.judging !== 'pending') || await hasAnyScores(c.id)) {
          return conflict('Оценивание уже началось — вернуться назад нельзя');
        }
      }
      if (to === 'judging') {
        if (!c.categories.length) return conflict('Добавьте хотя бы одну категорию');
        if (!c.criteria.length) return conflict('Добавьте критерии оценки');
      }
      const categories = to === 'finished'
        ? c.categories.map((cat) => ({ ...cat, judging: cat.judging === 'open' ? 'closed' as const : cat.judging, currentParticipantId: null, currentSetAt: null }))
        : c.categories;
      await adminDb.collection(COL.contests).doc(c.id).update({ status: to, categories, rev: FieldValue.increment(1), updatedAt: now() });
      const next = { ...c, status: to, categories };
      await publishLive(next);
      return ok(next);
    }

    if (action === 'delete') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      if (await hasAnyScores(c.id)) return conflict('В конкурсе уже есть оценки — его можно только завершить, но не удалить');
      const [participants, jury, results] = await Promise.all([loadParticipants(c.id), loadJury(c.id), loadResults(c.id)]);
      const batch = adminDb.batch();
      participants.forEach((p) => batch.delete(adminDb.collection(COL.participants).doc(p.id)));
      jury.forEach((j) => {
        batch.delete(adminDb.collection(COL.jury).doc(j.id));
        batch.set(adminDb.collection('users').doc(j.uid), { judgingContestIds: FieldValue.arrayRemove(c.id) }, { merge: true });
      });
      results.forEach((r) => batch.delete(adminDb.collection(COL.results).doc(r.id)));
      batch.delete(adminDb.collection(COL.live).doc(c.id));
      batch.delete(adminDb.collection(COL.contests).doc(c.id));
      await batch.commit();
      return ok({ deleted: true });
    }

    // ═══ КАТЕГОРИИ, КРИТЕРИИ ═══
    if (action === 'saveCategories') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const participants = await loadParticipants(c.id);
      const ref = adminDb.collection(COL.contests).doc(c.id);
      const result = await adminDb.runTransaction(async (tx) => {
        const fresh = normalizeContest(c.id, (await tx.get(ref)).data());
        const merged = mergeCategories(body.categories, fresh.categories);
        if (!merged.ok) return merged;
        const keep = new Set(merged.categories.map((x) => x.id));
        const removed = fresh.categories.filter((x) => !keep.has(x.id));
        for (const r of removed) {
          if (participants.some((p) => p.categoryId === r.id)) {
            return { ok: false as const, error: `В категории «${r.code}» есть участники — сначала переведите или удалите их` };
          }
          if (r.judging !== 'pending') return { ok: false as const, error: `Категорию «${r.code}» уже оценивали — удалить её нельзя` };
        }
        tx.update(ref, { categories: merged.categories, rev: FieldValue.increment(1), updatedAt: now() });
        return { ok: true as const, contest: { ...fresh, categories: merged.categories } };
      });
      if (!result.ok) return badRequest(result.error);
      await publishLive(result.contest);
      return ok(result.contest);
    }

    if (action === 'saveCriteria') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      if (criteriaLocked(c) || await hasAnyScores(c.id)) {
        return conflict('Оценивание уже началось — критерии менять нельзя, чтобы не испортить выставленные оценки');
      }
      const res = sanitizeCriteria(body.criteria, c.criteria);
      if (!res.ok) return badRequest(res.error);
      const ids = new Set(res.criteria.map((x) => x.id));
      const tieBreak = (Array.isArray(body.tieBreakCriterionIds) ? body.tieBreakCriterionIds : c.tieBreakCriterionIds)
        .filter((id: string) => ids.has(id));
      await adminDb.collection(COL.contests).doc(c.id).update({
        criteria: res.criteria, tieBreakCriterionIds: tieBreak, rev: FieldValue.increment(1), updatedAt: now(),
      });
      return ok({ ...c, criteria: res.criteria, tieBreakCriterionIds: tieBreak });
    }

    // Порядок критериев ничьей влияет только на рейтинг, не на баллы — его можно
    // поправить и во время оценивания, пока ни одна категория не утверждена.
    if (action === 'saveTieBreak') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      if (c.categories.some((cat) => cat.judging === 'approved')) return conflict('Итоги уже утверждены — порядок разрешения ничьей зафиксирован');
      const ids = new Set(c.criteria.map((x) => x.id));
      const tieBreak = [...new Set((Array.isArray(body.tieBreakCriterionIds) ? body.tieBreakCriterionIds : []) as string[])].filter((id) => ids.has(id));
      await adminDb.collection(COL.contests).doc(c.id).update({ tieBreakCriterionIds: tieBreak, rev: FieldValue.increment(1), updatedAt: now() });
      await bumpRev(c.id, orgId);
      return ok({ ...c, tieBreakCriterionIds: tieBreak });
    }

    // ═══ УЧАСТНИКИ ═══
    if (action === 'addParticipant' || action === 'updateParticipant') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      if (!c.categories.length) return conflict('Сначала добавьте возрастные категории');
      const a = sanitizeAuthors(body.authors);
      if (!a.ok) return badRequest(a.error);
      const autoCat = categoryForAge(c.categories, participantAge(a.authors));
      const requestedCat = body.categoryId ? String(body.categoryId) : null;
      if (requestedCat && !c.categories.some((x) => x.id === requestedCat)) return badRequest('Категория не найдена');

      const fields = {
        authors: a.authors,
        phone: String(body.phone ?? '').trim().slice(0, 50),
        city: String(body.city ?? '').trim().slice(0, 150),
        projectTitle: String(body.projectTitle ?? '').trim().slice(0, 300),
        projectDescription: String(body.projectDescription ?? '').trim().slice(0, 3000),
      };
      const contestRef = adminDb.collection(COL.contests).doc(c.id);

      if (action === 'addParticipant') {
        const categoryId = requestedCat || autoCat;
        if (!categoryId) return badRequest('Возраст не подходит ни под одну категорию — выберите категорию вручную');
        const pRef = adminDb.collection(COL.participants).doc();
        const created = await adminDb.runTransaction(async (tx) => {
          const fresh = normalizeContest(c.id, (await tx.get(contestRef)).data());
          const cat = fresh.categories.find((x) => x.id === categoryId)!;
          const seq = cat.nextSeq;
          const categories = fresh.categories.map((x) => (x.id === categoryId ? { ...x, nextSeq: seq + 1 } : x));
          const doc = {
            organizationId: orgId, contestId: c.id, ...fields,
            categoryId, categoryManual: !!requestedCat && requestedCat !== autoCat,
            number: formatProjectNumber(cat.code, seq), seq,
            status: 'registered', source: 'admin',
            createdAt: now(), updatedAt: now(), createdBy: user.uid,
          };
          tx.update(contestRef, { categories, rev: FieldValue.increment(1), updatedAt: now() });
          tx.set(pRef, doc);
          return { id: pRef.id, ...doc };
        });
        await bumpRev(c.id, orgId);
        return ok(created);
      }

      // update
      const pRef = adminDb.collection(COL.participants).doc(String(body.participantId || ''));
      const pSnap = await pRef.get();
      if (!pSnap.exists || pSnap.data()!.contestId !== c.id) return notFound('Участник не найден');
      const prev = { id: pSnap.id, ...pSnap.data() } as ContestParticipant;
      // Ручной выбор держится, пока его не сбросят явно (categoryId: '' → снова по возрасту).
      const manual = body.categoryId === '' ? false : (requestedCat ? requestedCat !== autoCat : prev.categoryManual);
      const targetCat = requestedCat || (manual ? prev.categoryId : autoCat);
      if (!targetCat) return badRequest('Возраст не подходит ни под одну категорию — выберите категорию вручную');

      if (targetCat === prev.categoryId) {
        await pRef.update({ ...fields, categoryManual: manual, updatedAt: now() });
        await bumpRev(c.id, orgId);
        return ok({ ...prev, ...fields, categoryManual: manual });
      }
      // Перевод в другую категорию = новый номер в ней. Только пока проект не оценивали.
      if (await hasAnyScores(c.id, { participantId: prev.id })) {
        return conflict('Проект уже оценивали — перевести его в другую категорию нельзя');
      }
      const moved = await adminDb.runTransaction(async (tx) => {
        const fresh = normalizeContest(c.id, (await tx.get(contestRef)).data());
        const cat = fresh.categories.find((x) => x.id === targetCat)!;
        const seq = cat.nextSeq;
        const categories = fresh.categories.map((x) => (x.id === targetCat ? { ...x, nextSeq: seq + 1 } : x));
        const patch = { ...fields, categoryId: targetCat, categoryManual: manual, number: formatProjectNumber(cat.code, seq), seq, updatedAt: now() };
        tx.update(contestRef, { categories, rev: FieldValue.increment(1), updatedAt: now() });
        tx.update(pRef, patch);
        return { ...prev, ...patch };
      });
      await bumpRev(c.id, orgId);
      return ok(moved);
    }

    if (action === 'setParticipantStatus') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const status = body.status;
      if (!['registered', 'arrived', 'withdrawn'].includes(status)) return badRequest('Некорректный статус');
      const ids: string[] = Array.isArray(body.participantIds) ? body.participantIds.slice(0, 500) : [String(body.participantId || '')];
      const batch = adminDb.batch();
      const snaps = await Promise.all(ids.map((id) => adminDb.collection(COL.participants).doc(id).get()));
      for (const s of snaps) {
        if (!s.exists || s.data()!.contestId !== c.id) return notFound('Участник не найден');
        const cat = c.categories.find((x) => x.id === s.data()!.categoryId);
        if (cat?.judging === 'approved') return conflict(`Итоги категории ${cat.code} утверждены — статус участника не меняется`);
        batch.update(s.ref, { status, updatedAt: now() });
      }
      await batch.commit();
      await bumpRev(c.id, orgId);
      return ok({ updated: ids.length });
    }

    if (action === 'deleteParticipant') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const pRef = adminDb.collection(COL.participants).doc(String(body.participantId || ''));
      const pSnap = await pRef.get();
      if (!pSnap.exists || pSnap.data()!.contestId !== c.id) return notFound('Участник не найден');
      if (await hasAnyScores(c.id, { participantId: pSnap.id })) {
        return conflict('У проекта уже есть оценки — удалить нельзя, снимите его с конкурса');
      }
      // Номер не освобождается: счётчик категории не откатываем.
      await pRef.delete();
      await bumpRev(c.id, orgId);
      return ok({ deleted: true });
    }

    // ═══ ЖЮРИ ═══
    if (action === 'addJury') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim().slice(0, 150);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('Укажите корректный email');
      const categoryIds = Array.isArray(body.categoryIds) && body.categoryIds.length
        ? body.categoryIds.filter((id: string) => c.categories.some((x) => x.id === id)) : null;

      let authUser: { uid: string; displayName?: string; disabled?: boolean } | null = null;
      try { authUser = await adminAuth.getUserByEmail(email); } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') throw e;
      }

      if (authUser && (await adminDb.collection(COL.jury).doc(juryDocId(c.id, authUser.uid)).get()).exists) {
        return conflict('Этот человек уже в жюри конкурса');
      }

      let uid: string;
      let accountType: ContestJuryMember['accountType'];
      let passwordIgnored = false;
      if (!authUser) {
        if (!name) return badRequest('Укажите имя');
        if (typeof body.password !== 'string' || body.password.length < 6) return badRequest('Пароль минимум 6 символов');
        const created = await adminAuth.createUser({ email, password: body.password, displayName: name });
        uid = created.uid;
        accountType = 'jury';
        // Ни organizationId, ни activeOrgId, ни членства: учётке жюри организация
        // не нужна, а её отсутствие — дополнительная стена (правила, verifyAuth).
        await adminDb.collection('users').doc(uid).set({
          displayName: name, email, role: 'jury', activeRole: 'jury',
          judgingContestIds: [c.id], juryCreatedByOrg: orgId,
          hasLogin: true, createdAt: now(), updatedAt: now(),
        });
      } else {
        uid = authUser.uid;
        const uSnap = await adminDb.collection('users').doc(uid).get();
        const u = uSnap.data() || {};
        if (u.role === 'jury') {
          accountType = 'jury';
          // Чужую учётку жюри (созданную другой организацией) не трогаем.
          if (u.juryCreatedByOrg === orgId) {
            if (typeof body.password === 'string' && body.password.length >= 6) {
              await adminAuth.updateUser(uid, { password: body.password, disabled: false });
            } else if (authUser.disabled) {
              await adminAuth.updateUser(uid, { disabled: false });
            }
          } else if (body.password) passwordIgnored = true;
        } else {
          const membership = await getMembershipData(uid, orgId);
          accountType = membership && membership.status === 'active' ? 'staff' : 'existing';
          if (body.password) passwordIgnored = true; // пароль сотрудника жюри-форма не меняет
        }
        await adminDb.collection('users').doc(uid).set({ judgingContestIds: FieldValue.arrayUnion(c.id) }, { merge: true });
      }

      const jRef = adminDb.collection(COL.jury).doc(juryDocId(c.id, uid));
      const doc = {
        organizationId: orgId, contestId: c.id, uid,
        name: name || authUser?.displayName || email,
        email, title: String(body.title || '').trim().slice(0, 200),
        categoryIds, accountType, createdAt: now(), createdBy: user.uid,
      };
      await jRef.set(doc);
      const jury = await loadJury(c.id);
      await publishLive(c, jury.map((j) => j.uid));
      return ok({ id: jRef.id, ...doc, passwordIgnored, existingAccount: !!authUser });
    }

    if (action === 'updateJury') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const jRef = adminDb.collection(COL.jury).doc(String(body.juryId || ''));
      const jSnap = await jRef.get();
      if (!jSnap.exists || jSnap.data()!.contestId !== c.id) return notFound('Член жюри не найден');
      const patch: Record<string, any> = {};
      if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 150) || jSnap.data()!.name;
      if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 200);
      if (body.categoryIds !== undefined) {
        patch.categoryIds = Array.isArray(body.categoryIds) && body.categoryIds.length
          ? body.categoryIds.filter((id: string) => c.categories.some((x) => x.id === id)) : null;
      }
      await jRef.update(patch);
      await bumpRev(c.id, orgId);
      return ok({ id: jSnap.id, ...jSnap.data(), ...patch });
    }

    if (action === 'resetJuryPassword') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const jSnap = await adminDb.collection(COL.jury).doc(String(body.juryId || '')).get();
      if (!jSnap.exists || jSnap.data()!.contestId !== c.id) return notFound('Член жюри не найден');
      const uid = jSnap.data()!.uid;
      const u = (await adminDb.collection('users').doc(uid).get()).data() || {};
      if (u.role !== 'jury' || u.juryCreatedByOrg !== orgId) {
        return forbidden('Пароль можно задать только учётке жюри, созданной вашей организацией. Сотрудник входит своим паролем.');
      }
      if (typeof body.password !== 'string' || body.password.length < 6) return badRequest('Пароль минимум 6 символов');
      await adminAuth.updateUser(uid, { password: body.password, disabled: false });
      return ok({ updated: true });
    }

    if (action === 'removeJury') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const jRef = adminDb.collection(COL.jury).doc(String(body.juryId || ''));
      const jSnap = await jRef.get();
      if (!jSnap.exists || jSnap.data()!.contestId !== c.id) return notFound('Член жюри не найден');
      const uid = jSnap.data()!.uid;
      if (await hasAnyScores(c.id, { juryUid: uid })) return conflict('Этот член жюри уже выставлял оценки — убрать его нельзя');
      await jRef.delete();
      const uRef = adminDb.collection('users').doc(uid);
      await uRef.set({ judgingContestIds: FieldValue.arrayRemove(c.id) }, { merge: true });
      // Учётку «только жюри», созданную нами и больше нигде не нужную, выключаем.
      const u = (await uRef.get()).data() || {};
      if (u.role === 'jury' && u.juryCreatedByOrg === orgId && !(u.judgingContestIds || []).length) {
        await adminAuth.updateUser(uid, { disabled: true }).catch(() => {});
      }
      const jury = await loadJury(c.id);
      await publishLive(c, jury.map((j) => j.uid));
      return ok({ deleted: true });
    }

    // ═══ ПРОВЕДЕНИЕ: открыть/закрыть категорию, ведущий ═══
    if (action === 'setJudging') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const state = body.state;
      if (!['open', 'closed'].includes(state)) return badRequest('state: open | closed');
      if (state === 'open' && c.status !== 'judging') return conflict('Сначала переведите конкурс в статус «Оценивание»');
      if (state === 'open' && !c.criteria.length) return conflict('Нет критериев оценки');
      const ref = adminDb.collection(COL.contests).doc(c.id);
      const next = await adminDb.runTransaction(async (tx) => {
        const fresh = normalizeContest(c.id, (await tx.get(ref)).data());
        const cat = fresh.categories.find((x) => x.id === body.categoryId);
        if (!cat) return { error: 'Категория не найдена' };
        if (cat.judging === 'approved') return { error: 'Итоги категории утверждены — оценивание закрыто навсегда' };
        // Закрыли категорию — вызванный проект снимается: иначе жюри и
        // мониторинг продолжали бы показывать «сейчас на оценке».
        const categories = fresh.categories.map((x) => (x.id === cat.id
          ? { ...x, judging: state, ...(state === 'closed' ? { currentParticipantId: null, currentSetAt: null } : {}) }
          : x));
        tx.update(ref, { categories, rev: FieldValue.increment(1), updatedAt: now() });
        return { contest: { ...fresh, categories } };
      });
      if ('error' in next) return conflict(next.error!);
      await publishLive(next.contest!);
      return ok(next.contest);
    }

    if (action === 'setCurrent') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const participantId: string | null = body.participantId || null;
      if (participantId) {
        const p = await adminDb.collection(COL.participants).doc(participantId).get();
        if (!p.exists || p.data()!.contestId !== c.id || p.data()!.categoryId !== body.categoryId) return notFound('Проект не найден в этой категории');
        if (p.data()!.status !== 'arrived') return conflict('Вызвать на оценку можно только пришедшего участника');
      }
      const ref = adminDb.collection(COL.contests).doc(c.id);
      const next = await adminDb.runTransaction(async (tx) => {
        const fresh = normalizeContest(c.id, (await tx.get(ref)).data());
        const cat = fresh.categories.find((x) => x.id === body.categoryId);
        if (!cat) return { error: 'Категория не найдена' };
        const categories = fresh.categories.map((x) => (x.id === cat.id
          ? { ...x, currentParticipantId: participantId, currentSetAt: participantId ? now() : null } : x));
        tx.update(ref, { categories, updatedAt: now() });
        return { contest: { ...fresh, categories } };
      });
      if ('error' in next) return conflict(next.error!);
      await publishLive(next.contest!);
      return ok(next.contest);
    }

    // ═══ ПРАВКА ОЦЕНКИ ЗА ЖЮРИ (с обязательным комментарием) ═══
    if (action === 'adminScore') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const comment = String(body.comment || '').trim().slice(0, 1000);
      if (!comment) return badRequest('Комментарий обязателен: почему оценка исправлена');
      const pSnap = await adminDb.collection(COL.participants).doc(String(body.participantId || '')).get();
      if (!pSnap.exists || pSnap.data()!.contestId !== c.id) return notFound('Проект не найден');
      const p = { id: pSnap.id, ...pSnap.data() } as ContestParticipant;
      if (p.status !== 'arrived') return conflict('Оценивается только пришедший участник');
      const cat = c.categories.find((x) => x.id === p.categoryId);
      if (!cat) return notFound('Категория не найдена');
      if (cat.judging === 'approved') return conflict('Итоги утверждены — оценки не меняются');
      const juryUid = String(body.juryUid || '');
      const jSnap = await adminDb.collection(COL.jury).doc(juryDocId(c.id, juryUid)).get();
      if (!jSnap.exists) return notFound('Член жюри не найден');
      const j = jSnap.data() as ContestJuryMember;
      if (!juryForCategory([j], cat.id).length) return conflict('Этот член жюри не оценивает эту категорию');
      const v = validateScores(c.criteria, body.scores || {});
      if (!v.ok) return badRequest(v.error);

      const sRef = adminDb.collection(COL.scores).doc(scoreDocId(c.id, p.id, juryUid));
      const logRef = adminDb.collection(COL.log).doc();
      await adminDb.runTransaction(async (tx) => {
        const prev = await tx.get(sRef);
        const before = prev.exists ? { scores: prev.data()!.scores, total: prev.data()!.total } : null;
        tx.set(sRef, {
          organizationId: orgId, contestId: c.id, categoryId: cat.id, participantId: p.id, juryUid,
          scores: v.scores, total: v.total,
          createdAt: prev.exists ? prev.data()!.createdAt : now(),
          updatedAt: now(), updatedBy: user.uid, updatedByRole: 'admin',
        });
        tx.set(logRef, {
          organizationId: orgId, contestId: c.id, participantId: p.id, juryUid,
          before, after: { scores: v.scores, total: v.total },
          by: user.uid, byName: user.displayName || user.email, byRole: 'admin', comment, at: now(),
        });
      });
      await bumpRev(c.id, orgId);
      return ok({ saved: true, total: v.total });
    }

    // ═══ НИЧЬЯ: ручной порядок ═══
    if (action === 'resolveTie') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const cat = c.categories.find((x) => x.id === body.categoryId);
      if (!cat) return notFound('Категория не найдена');
      if (cat.judging === 'approved') return conflict('Итоги утверждены');
      const comment = String(body.comment || '').trim().slice(0, 2000);
      if (!comment) return badRequest('Опишите решение жюри в комментарии');
      const order: string[] = Array.isArray(body.participantIds) ? [...new Set(body.participantIds as string[])] : [];
      if (order.length < 2) return badRequest('Нужно минимум два проекта');

      const [participants, jury, scores, results] = await Promise.all([loadParticipants(c.id), loadJury(c.id), loadScores(c.id), loadResults(c.id)]);
      const res = results.find((r) => r.categoryId === cat.id);
      // Проверяем по рейтингу БЕЗ ручных решений: набор обязан быть настоящей ничьей.
      const raw = rankFor(c, cat.id, participants, jury, scores, res ? { ...res, tieResolutions: [] } : undefined);
      const group = raw.find((r) => r.participantId === order[0])?.tieGroup;
      const members = raw.filter((r) => r.tieGroup !== null && r.tieGroup === group).map((r) => r.participantId);
      if (group == null || members.length !== order.length || !members.every((id) => order.includes(id))) {
        return conflict('Эти проекты не находятся в ничьей — обновите страницу');
      }
      const resolution: TieResolution = { participantIds: order, comment, by: user.uid, byName: user.displayName || user.email, at: now() };
      const keep = (res?.tieResolutions || []).filter((r) => !r.participantIds.some((id) => order.includes(id)));
      await adminDb.collection(COL.results).doc(resultsDocId(c.id, cat.id)).set({
        organizationId: orgId, contestId: c.id, categoryId: cat.id,
        tieResolutions: [...keep, resolution], approved: res?.approved || null,
      }, { merge: true });
      await bumpRev(c.id, orgId);
      return ok(resolution);
    }

    // ═══ УТВЕРЖДЕНИЕ ИТОГОВ ═══
    if (action === 'approve') {
      const c = await ownContest(body.id);
      if (isResp(c)) return c;
      const locked = editable(c); if (locked) return locked;
      const cat = c.categories.find((x) => x.id === body.categoryId);
      if (!cat) return notFound('Категория не найдена');
      if (cat.judging === 'approved') return conflict('Итоги уже утверждены');
      if (cat.judging !== 'closed') return conflict('Сначала закройте оценивание категории');
      const [participants, jury, scores, results] = await Promise.all([loadParticipants(c.id), loadJury(c.id), loadScores(c.id), loadResults(c.id)]);
      const res = results.find((r) => r.categoryId === cat.id);
      const rows = rankFor(c, cat.id, participants, jury, scores, res);
      const blocking = blockingTies(rows, cat.prizes.length);
      if (blocking.length) {
        return conflict('Есть ничья на призовых местах — требуется решение жюри', { blocking: blocking.map((r) => r.number) });
      }
      const pById = new Map(participants.map((p) => [p.id, p]));
      const approvedRows: ApprovedRow[] = rows.filter((r) => r.place !== null).map((r) => ({
        participantId: r.participantId,
        number: r.number,
        projectTitle: r.projectTitle,
        authors: authorsLabel(pById.get(r.participantId)?.authors || []),
        place: r.place!,
        average: r.average,
        sum: r.sum,
        juryCount: r.juryCount,
        prize: prizeLabel(cat.prizes[r.place! - 1], formatMoney),
      }));
      const approved = { at: now(), by: user.uid, byName: user.displayName || user.email, rows: approvedRows };
      const ref = adminDb.collection(COL.contests).doc(c.id);
      const next = await adminDb.runTransaction(async (tx) => {
        const fresh = normalizeContest(c.id, (await tx.get(ref)).data());
        const categories = fresh.categories.map((x) => (x.id === cat.id ? { ...x, judging: 'approved' as const, currentParticipantId: null, currentSetAt: null } : x));
        tx.update(ref, { categories, rev: FieldValue.increment(1), updatedAt: now() });
        tx.set(adminDb.collection(COL.results).doc(resultsDocId(c.id, cat.id)), {
          organizationId: orgId, contestId: c.id, categoryId: cat.id,
          tieResolutions: res?.tieResolutions || [], approved,
        }, { merge: true });
        return { ...fresh, categories };
      });
      await publishLive(next);
      return ok({ contest: next, approved });
    }

    return badRequest('Unknown action');
  } catch (e: any) {
    console.error('[api-contests]', action, e);
    return jsonResponse(500, { error: e?.message || 'Internal error' });
  }
};

export { handler };
