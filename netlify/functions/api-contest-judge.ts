/**
 * API: экран оценивания для жюри.
 *
 * ЕДИНСТВЕННАЯ ручка, которая пускает учётку с ролью «Жюри» (verifyAuth с
 * allowJury). Права здесь — не RBAC, а назначение: человек должен числиться в
 * contestJury этого конкурса (doc id = `${contestId}_${uid}`), а для категории —
 * быть на неё назначен. Так же оценивает и сотрудник, которого добавили в жюри.
 *
 * Что жюри НЕ получает отсюда никогда: чужие оценки, суммы других проектов,
 * рейтинг, телефоны участников.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { COL, now, juryDocId, scoreDocId, loadContest, bumpRev } from './utils/contests';
import {
  validateScores, juryForCategory,
  type Contest, type ContestJuryMember, type ContestParticipant,
} from '../../src/lib/contests';

const conflict = (msg: string, code?: string) => jsonResponse(409, { error: msg, code });

/** Что жюри видит о конкурсе: без призов, возрастов и прочей кухни организатора. */
function juryView(c: Contest, j: ContestJuryMember, orgName: string) {
  const cats = c.categories.filter((cat) => juryForCategory([j], cat.id).length > 0);
  return {
    id: c.id,
    title: c.title,
    season: c.season,
    kind: c.kind,
    eventDate: c.eventDate,
    venue: c.venue,
    status: c.status,
    organizationName: orgName,
    criteria: c.criteria,
    categories: cats.map((cat) => ({
      id: cat.id, code: cat.code, name: cat.name, judging: cat.judging,
      currentParticipantId: cat.currentParticipantId, currentSetAt: cat.currentSetAt,
    })),
  };
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event, { allowJury: true });
  if (!user) return unauthorized(event);

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  /** Назначение этого пользователя в конкурс или ответ-ошибка. */
  const assignment = async (contestId: string) => {
    if (!contestId) return { ok: false as const, error: badRequest('contestId required') };
    const [jSnap, contest] = await Promise.all([
      adminDb.collection(COL.jury).doc(juryDocId(contestId, user.uid)).get(),
      loadContest(contestId),
    ]);
    if (!jSnap.exists || !contest) return { ok: false as const, error: forbidden('Вы не входите в жюри этого конкурса') };
    return { ok: true as const, jury: { id: jSnap.id, ...jSnap.data() } as ContestJuryMember, contest };
  };

  try {
    // Мои конкурсы.
    if (action === 'my' && event.httpMethod === 'GET') {
      const snap = await adminDb.collection(COL.jury).where('uid', '==', user.uid).get();
      const assignments = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as ContestJuryMember);
      const contests = await Promise.all(assignments.map((j) => loadContest(j.contestId)));
      const orgIds = [...new Set(contests.filter(Boolean).map((c) => c!.organizationId))];
      const orgNames = new Map<string, string>();
      await Promise.all(orgIds.map(async (id) => {
        const o = await adminDb.collection('organizations').doc(id).get();
        orgNames.set(id, (o.data()?.name as string) || '');
      }));
      const list = assignments
        .map((j, i) => (contests[i] && contests[i]!.status !== 'draft' ? juryView(contests[i]!, j, orgNames.get(contests[i]!.organizationId) || '') : null))
        .filter(Boolean)
        .sort((a: any, b: any) => String(b.eventDate).localeCompare(String(a.eventDate)));
      return ok({ displayName: user.displayName, contests: list });
    }

    // Резервный опрос состояния, если подписка на contestLive недоступна.
    if (action === 'live' && event.httpMethod === 'GET') {
      const a = await assignment(String(params.contestId || ''));
      if (!a.ok) return a.error;
      return ok(juryView(a.contest, a.jury, ''));
    }

    // Проекты категории + мои оценки.
    if (action === 'board' && event.httpMethod === 'GET') {
      const a = await assignment(String(params.contestId || ''));
      if (!a.ok) return a.error;
      const categoryId = String(params.categoryId || '');
      const cat = a.contest.categories.find((c) => c.id === categoryId);
      if (!cat || !juryForCategory([a.jury], categoryId).length) return forbidden('Эта категория вам не назначена');

      const [pSnap, sSnap] = await Promise.all([
        adminDb.collection(COL.participants).where('contestId', '==', a.contest.id).get(),
        adminDb.collection(COL.scores).where('juryUid', '==', user.uid).get(),
      ]);
      const projects = pSnap.docs
        .map((d: any) => ({ id: d.id, ...d.data() }) as ContestParticipant)
        .filter((p) => p.categoryId === categoryId && p.status === 'arrived')
        .sort((x, y) => x.seq - y.seq)
        .map((p) => ({
          id: p.id, number: p.number, projectTitle: p.projectTitle, projectDescription: p.projectDescription,
          authors: (p.authors || []).map((au) => au.name), city: p.city,
        }));
      const mine: Record<string, { scores: Record<string, number>; total: number; updatedAt: string; updatedByRole: string }> = {};
      sSnap.docs.forEach((d: any) => {
        const s = d.data();
        if (s.contestId !== a.contest.id) return;
        mine[s.participantId] = { scores: s.scores, total: s.total, updatedAt: s.updatedAt, updatedByRole: s.updatedByRole };
      });
      return ok({ category: { id: cat.id, code: cat.code, name: cat.name, judging: cat.judging, currentParticipantId: cat.currentParticipantId }, projects, mine });
    }

    // Сохранить свою оценку.
    if (action === 'score' && event.httpMethod === 'POST') {
      let body: any;
      try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }
      const a = await assignment(String(body.contestId || ''));
      if (!a.ok) return a.error;
      const { contest, jury } = a;
      if (contest.status !== 'judging') return conflict('Оценивание конкурса не идёт', 'not_judging');

      const pSnap = await adminDb.collection(COL.participants).doc(String(body.participantId || '')).get();
      if (!pSnap.exists || pSnap.data()!.contestId !== contest.id) return notFound('Проект не найден');
      const p = { id: pSnap.id, ...pSnap.data() } as ContestParticipant;
      if (p.status !== 'arrived') return conflict('Этот проект сейчас не оценивается', 'not_arrived');
      const cat = contest.categories.find((c) => c.id === p.categoryId);
      if (!cat || !juryForCategory([jury], cat.id).length) return forbidden('Эта категория вам не назначена');
      if (cat.judging !== 'open') {
        return conflict(cat.judging === 'approved' ? 'Итоги категории утверждены — оценки не меняются' : 'Оценивание категории закрыто организатором', 'category_closed');
      }

      const v = validateScores(contest.criteria, body.scores || {});
      if (!v.ok) return badRequest(v.error);

      const sRef = adminDb.collection(COL.scores).doc(scoreDocId(contest.id, p.id, user.uid));
      const logRef = adminDb.collection(COL.log).doc();
      await adminDb.runTransaction(async (tx) => {
        const prev = await tx.get(sRef);
        const before = prev.exists ? { scores: prev.data()!.scores, total: prev.data()!.total } : null;
        tx.set(sRef, {
          organizationId: contest.organizationId, contestId: contest.id, categoryId: cat.id,
          participantId: p.id, juryUid: user.uid,
          scores: v.scores, total: v.total,
          createdAt: prev.exists ? prev.data()!.createdAt : now(),
          updatedAt: now(), updatedBy: user.uid, updatedByRole: 'jury',
        });
        tx.set(logRef, {
          organizationId: contest.organizationId, contestId: contest.id, participantId: p.id, juryUid: user.uid,
          before, after: { scores: v.scores, total: v.total },
          by: user.uid, byName: jury.name || user.displayName, byRole: 'jury', comment: '', at: now(),
        });
      });
      await bumpRev(contest.id, contest.organizationId);
      return ok({ saved: true, total: v.total, updatedAt: now() });
    }

    return badRequest('Unknown action');
  } catch (e: any) {
    console.error('[api-contest-judge]', action, e);
    return jsonResponse(500, { error: e?.message || 'Internal error' });
  }
};

export { handler };
