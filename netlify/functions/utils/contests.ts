/**
 * Конкурсы — общие серверные помощники для api-contests (админ) и
 * api-contest-judge (жюри). Чистая логика (рейтинг, проверка баллов, номера)
 * живёт в src/lib/contests.ts и импортируется отсюда, чтобы сервер и экраны
 * считали одно и то же.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import type {
  Contest, ContestCategory, ContestCriterion, ContestParticipant, ContestJuryMember,
  ContestScore, ContestCategoryResults, ContestKind, ContestStatus, CategoryJudging,
} from '../../../src/lib/contests';

export const COL = {
  contests: 'contests',
  participants: 'contestParticipants',
  jury: 'contestJury',
  scores: 'contestScores',
  log: 'contestScoreLog',
  results: 'contestResults',
  live: 'contestLive',
} as const;

export const now = () => new Date().toISOString();
export const shortId = () => Math.random().toString(36).slice(2, 10);

export const juryDocId = (contestId: string, uid: string) => `${contestId}_${uid}`;
export const scoreDocId = (contestId: string, participantId: string, uid: string) => `${contestId}_${participantId}_${uid}`;
export const resultsDocId = (contestId: string, categoryId: string) => `${contestId}_${categoryId}`;

const KINDS: ContestKind[] = ['olympiad', 'project_contest', 'competition', 'other'];
const STATUSES: ContestStatus[] = ['draft', 'registration', 'judging', 'finished'];
const JUDGING: CategoryJudging[] = ['pending', 'open', 'closed', 'approved'];

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v: unknown, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/** Документ конкурса → полная модель с умолчаниями (старые/частичные документы не ломают экраны). */
export function normalizeContest(id: string, d: any): Contest {
  return {
    id,
    organizationId: d.organizationId,
    title: d.title || '',
    season: d.season || '',
    kind: KINDS.includes(d.kind) ? d.kind : 'other',
    theme: d.theme || '',
    eventDate: d.eventDate || '',
    venue: d.venue || '',
    prizeFund: num(d.prizeFund),
    description: d.description || '',
    status: STATUSES.includes(d.status) ? d.status : 'draft',
    categories: (Array.isArray(d.categories) ? d.categories : []).map((c: any): ContestCategory => ({
      id: c.id,
      code: c.code || '',
      name: c.name || '',
      ageFrom: num(c.ageFrom),
      ageTo: num(c.ageTo),
      prizes: (Array.isArray(c.prizes) ? c.prizes : []).map((p: any, i: number) => ({
        place: i + 1, title: p.title || '', amount: num(p.amount),
      })),
      judging: JUDGING.includes(c.judging) ? c.judging : 'pending',
      nextSeq: Math.max(1, num(c.nextSeq, 1)),
      currentParticipantId: c.currentParticipantId || null,
      currentSetAt: c.currentSetAt || null,
    })),
    criteria: (Array.isArray(d.criteria) ? d.criteria : []).map((c: any): ContestCriterion => ({
      id: c.id, name: c.name || '', description: c.description || '', maxScore: num(c.maxScore),
    })),
    tieBreakCriterionIds: Array.isArray(d.tieBreakCriterionIds) ? d.tieBreakCriterionIds : [],
    rev: num(d.rev),
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
  };
}

export async function loadContest(contestId: string): Promise<Contest | null> {
  if (!contestId) return null;
  const snap = await adminDb.collection(COL.contests).doc(contestId).get();
  if (!snap.exists) return null;
  return normalizeContest(snap.id, snap.data());
}

export async function loadParticipants(contestId: string): Promise<ContestParticipant[]> {
  const snap = await adminDb.collection(COL.participants).where('contestId', '==', contestId).get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as ContestParticipant)
    .sort((a, b) => String(a.number).localeCompare(String(b.number), 'ru', { numeric: true }));
}

export async function loadJury(contestId: string): Promise<ContestJuryMember[]> {
  const snap = await adminDb.collection(COL.jury).where('contestId', '==', contestId).get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as ContestJuryMember)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function loadScores(contestId: string): Promise<ContestScore[]> {
  const snap = await adminDb.collection(COL.scores).where('contestId', '==', contestId).get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as ContestScore);
}

export async function loadResults(contestId: string): Promise<ContestCategoryResults[]> {
  const snap = await adminDb.collection(COL.results).where('contestId', '==', contestId).get();
  return snap.docs.map((d: any) => ({
    id: d.id,
    contestId,
    categoryId: d.data().categoryId,
    tieResolutions: d.data().tieResolutions || [],
    approved: d.data().approved || null,
  }));
}

export async function hasAnyScores(contestId: string, field?: { participantId?: string; juryUid?: string }): Promise<boolean> {
  // Только одно равенство: второе поле фильтруем в памяти, чтобы запрос
  // гарантированно не потребовал составного индекса (они не деплоятся).
  const snap = await adminDb.collection(COL.scores).where('contestId', '==', contestId).get();
  return snap.docs.some((d: any) => {
    const s = d.data();
    if (field?.participantId && s.participantId !== field.participantId) return false;
    if (field?.juryUid && s.juryUid !== field.juryUid) return false;
    return true;
  });
}

/**
 * «Живой» документ (contestLive) — то, на что подписаны экраны жюри и
 * мониторинг. Только состояние категорий, вызванный проект, статус и ревизия;
 * оценок и рейтинга здесь нет и быть не должно (правила дают его читать жюри).
 */
export async function publishLive(contest: Contest, juryUids?: string[]): Promise<void> {
  const categories: Record<string, any> = {};
  for (const c of contest.categories) {
    categories[c.id] = {
      code: c.code, name: c.name, judging: c.judging,
      currentParticipantId: c.currentParticipantId, currentSetAt: c.currentSetAt,
    };
  }
  const data: Record<string, any> = {
    organizationId: contest.organizationId,
    contestId: contest.id,
    status: contest.status,
    categories,
    rev: FieldValue.increment(1),
    updatedAt: now(),
  };
  if (juryUids) data.juryUids = juryUids;
  await adminDb.collection(COL.live).doc(contest.id).set(data, { merge: true });
}

/** Отметить «данные поменялись» — мониторинг перечитает. Дёшево: два инкремента. */
export async function bumpRev(contestId: string, orgId: string): Promise<void> {
  await Promise.all([
    adminDb.collection(COL.contests).doc(contestId).update({ rev: FieldValue.increment(1), updatedAt: now() }),
    adminDb.collection(COL.live).doc(contestId).set({ organizationId: orgId, contestId, rev: FieldValue.increment(1) }, { merge: true }),
  ]);
}

// ─── Санитайзеры ввода ───

export function sanitizeMeta(body: any): Partial<Contest> {
  const out: Partial<Contest> = {};
  if (body.title !== undefined) out.title = str(body.title, 200);
  if (body.season !== undefined) out.season = str(body.season, 50);
  if (body.kind !== undefined) out.kind = KINDS.includes(body.kind) ? body.kind : 'other';
  if (body.theme !== undefined) out.theme = str(body.theme, 300);
  if (body.eventDate !== undefined) out.eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.eventDate)) ? String(body.eventDate) : '';
  if (body.venue !== undefined) out.venue = str(body.venue, 300);
  if (body.prizeFund !== undefined) out.prizeFund = Math.max(0, num(body.prizeFund));
  if (body.description !== undefined) out.description = str(body.description, 5000);
  return out;
}

/**
 * Новые категории из формы поверх сохранённых. С клиента берём только
 * редактируемые поля; состояние оценивания, счётчик номеров и вызванный проект
 * — всегда из базы, иначе устаревшая вкладка затёрла бы их.
 */
export function mergeCategories(input: any, existing: ContestCategory[]): { ok: true; categories: ContestCategory[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'categories required' };
  if (input.length > 26) return { ok: false, error: 'Слишком много категорий' };
  const byId = new Map(existing.map((c) => [c.id, c]));
  const codes = new Set<string>();
  const out: ContestCategory[] = [];
  for (const raw of input) {
    const prev = raw?.id ? byId.get(raw.id) : undefined;
    const code = str(raw?.code, 3).toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(code)) return { ok: false, error: 'Код категории — латинские буквы (A, B, C…)' };
    if (codes.has(code)) return { ok: false, error: `Код «${code}» повторяется` };
    codes.add(code);
    if (prev && prev.code !== code && prev.nextSeq > 1) {
      return { ok: false, error: `Нельзя сменить код категории «${prev.code}»: номера проектов уже присвоены` };
    }
    const ageFrom = Math.round(num(raw?.ageFrom, -1));
    const ageTo = Math.round(num(raw?.ageTo, -1));
    if (ageFrom < 0 || ageTo < 0 || ageFrom > 120 || ageTo > 120) return { ok: false, error: `Категория ${code}: укажите возраст от и до` };
    if (ageFrom > ageTo) return { ok: false, error: `Категория ${code}: «от» больше «до»` };
    const prizes = (Array.isArray(raw?.prizes) ? raw.prizes : []).slice(0, 50).map((p: any, i: number) => ({
      place: i + 1, title: str(p?.title, 200), amount: Math.max(0, num(p?.amount)),
    }));
    out.push({
      id: prev?.id || shortId(),
      code,
      name: str(raw?.name, 100) || `Категория ${code}`,
      ageFrom, ageTo, prizes,
      judging: prev?.judging || 'pending',
      nextSeq: prev?.nextSeq || 1,
      currentParticipantId: prev?.currentParticipantId || null,
      currentSetAt: prev?.currentSetAt || null,
    });
  }
  return { ok: true, categories: out };
}

export function sanitizeCriteria(input: any, existing: ContestCriterion[]): { ok: true; criteria: ContestCriterion[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'criteria required' };
  if (input.length > 30) return { ok: false, error: 'Слишком много критериев' };
  const known = new Set(existing.map((c) => c.id));
  const out: ContestCriterion[] = [];
  for (const raw of input) {
    const name = str(raw?.name, 150);
    if (!name) return { ok: false, error: 'У каждого критерия должно быть название' };
    const maxScore = num(raw?.maxScore);
    if (!(maxScore > 0) || maxScore > 1000) return { ok: false, error: `«${name}»: максимальный балл от 1 до 1000` };
    out.push({
      id: raw?.id && known.has(raw.id) ? raw.id : shortId(),
      name,
      description: str(raw?.description, 1000),
      maxScore: Math.round(maxScore * 2) / 2,
    });
  }
  return { ok: true, criteria: out };
}

/** Критерии фиксируются, как только хоть одна категория вышла из «Не начато». */
export function criteriaLocked(contest: Contest): boolean {
  return contest.categories.some((c) => c.judging !== 'pending');
}
