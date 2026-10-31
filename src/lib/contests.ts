/**
 * Конкурсы (олимпиады, конкурсы проектов, соревнования) — общая модель и чистая
 * логика, которую одинаково используют сервер (netlify/functions/api-contest*.ts)
 * и экраны. Здесь нет ни Firestore, ни React: только типы и вычисления, чтобы
 * рейтинг, который видит админ, и рейтинг, который утверждает сервер, считались
 * ОДНИМ кодом и не могли разойтись.
 *
 * Модель данных (все коллекции верхнего уровня, у каждого документа
 * organizationId + contestId; составных индексов не требуется):
 *   contests/{id}                      — сам конкурс + категории + критерии
 *   contestParticipants/{id}           — проект (участник или команда авторов)
 *   contestJury/{contestId}_{uid}      — член жюри в конкретном конкурсе
 *   contestScores/{contestId}_{participantId}_{uid} — оценка одного жюри за один проект
 *   contestScoreLog/{auto}             — история всех изменений оценок
 *   contestResults/{contestId}_{categoryId} — ручные решения по ничьим + утверждённые итоги
 *   contestLive/{contestId}            — «живой» документ для onSnapshot: какая
 *                                        категория открыта, какой проект вызван
 *                                        ведущим, ревизия данных. Без оценок.
 *
 * Задел на будущее (в этой версии не реализовано): участник несёт `source`
 * ('admin' сейчас, 'public' для онлайн-регистрации); утверждённые итоги
 * (contestResults.approved) — готовая основа для дипломов; зрительское
 * голосование ляжет отдельной коллекцией и в итоговый балл жюри не вмешивается.
 */

import { localizeField, localizeMap } from './trLabel';

export type ContestKind = 'olympiad' | 'project_contest' | 'competition' | 'other';
/**
 * Как жюри ходит по проектам.
 *  host — проекты защищаются на сцене по очереди: ведущий вызывает проект с
 *         мониторинга, у жюри он открывается сам; список проектов вторичен.
 *  free — жюри ходят по столам сами: главное — список и поиск по номеру,
 *         автопереходов нет, ведущего на мониторинге нет.
 */
export type JudgingMode = 'host' | 'free';
export type ContestStatus = 'draft' | 'registration' | 'judging' | 'finished';
/** pending — ещё не начинали; open — жюри оценивает; closed — пауза/закрыто; approved — итоги утверждены. */
export type CategoryJudging = 'pending' | 'open' | 'closed' | 'approved';
export type ParticipantStatus = 'registered' | 'arrived' | 'withdrawn';

export interface ContestPrize {
  place: number;
  /** Свободный текст: «Кубок, диплом I степени». */
  title: string;
  /** Денежная часть приза; 0 — без денег. */
  amount: number;
}

export interface ContestCategory {
  id: string;
  /** Буквенный код: A, B, C… — префикс номера проекта. */
  code: string;
  name: string;
  ageFrom: number;
  ageTo: number;
  prizes: ContestPrize[];
  judging: CategoryJudging;
  /** Счётчик номеров. Только растёт — номер удалённого проекта не переиспользуется. */
  nextSeq: number;
  /** Проект, который ведущий сейчас вызвал на оценку. */
  currentParticipantId: string | null;
  currentSetAt: string | null;
}

export interface ContestCriterion {
  id: string;
  name: string;
  /** Что именно оценивать — жюри видит это на экране оценки. */
  description: string;
  maxScore: number;
}

export interface Contest {
  id: string;
  organizationId: string;
  title: string;
  season: string;
  kind: ContestKind;
  theme: string;
  eventDate: string;
  venue: string;
  prizeFund: number;
  description: string;
  status: ContestStatus;
  categories: ContestCategory[];
  /** Порядок массива = порядок показа жюри. */
  criteria: ContestCriterion[];
  /** Критерии для разрешения ничьей, в порядке приоритета. */
  tieBreakCriterionIds: string[];
  judgingMode: JudgingMode;
  /** Растёт на каждом изменении — по нему мониторинг понимает, что пора перечитать. */
  rev: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContestAuthor {
  name: string;
  age: number | null;
}

export interface ContestParticipant {
  id: string;
  organizationId: string;
  contestId: string;
  /** Первый — основной автор (капитан); остальные — соавторы. */
  authors: ContestAuthor[];
  phone: string;
  city: string;
  projectTitle: string;
  projectDescription: string;
  categoryId: string;
  /** Категорию выбрали руками, а не по возрасту. */
  categoryManual: boolean;
  /** «A-01». Присваивается один раз и не меняется (кроме перевода в другую категорию до первых оценок). */
  number: string;
  seq: number;
  status: ParticipantStatus;
  source: 'admin' | 'public';
  createdAt: string;
  updatedAt: string;
}

export interface ContestJuryMember {
  id: string;
  organizationId: string;
  contestId: string;
  uid: string;
  name: string;
  email: string;
  title: string;
  /** null — оценивает все категории. */
  categoryIds: string[] | null;
  /** jury — отдельная учётка «только оценивание», созданная этим конкурсом;
   *  staff — сотрудник этой организации; existing — уже существовавший аккаунт. */
  accountType: 'jury' | 'staff' | 'existing';
  createdAt: string;
}

export interface ContestScore {
  id: string;
  organizationId: string;
  contestId: string;
  categoryId: string;
  participantId: string;
  juryUid: string;
  scores: Record<string, number>;
  total: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  updatedByRole: 'jury' | 'admin';
}

export interface ContestScoreLogEntry {
  id: string;
  contestId: string;
  participantId: string;
  juryUid: string;
  before: { scores: Record<string, number>; total: number } | null;
  after: { scores: Record<string, number>; total: number };
  by: string;
  byName: string;
  byRole: 'jury' | 'admin';
  comment: string;
  at: string;
}

export interface TieResolution {
  /** Проекты одной ничьей в итоговом порядке (первый — выше). */
  participantIds: string[];
  comment: string;
  by: string;
  byName: string;
  at: string;
}

export interface ApprovedRow {
  participantId: string;
  number: string;
  projectTitle: string;
  authors: string;
  place: number;
  average: number | null;
  sum: number;
  juryCount: number;
  prize: string;
}

export interface ContestCategoryResults {
  id: string;
  contestId: string;
  categoryId: string;
  tieResolutions: TieResolution[];
  approved: { at: string; by: string; byName: string; rows: ApprovedRow[] } | null;
}

/** Всё, что видит организатор на странице конкурса (api-contests ?action=get). */
export interface ContestBundle {
  contest: Contest;
  participants: ContestParticipant[];
  jury: ContestJuryMember[];
  scores: ContestScore[];
  results: ContestCategoryResults[];
}

/** Конкурс глазами жюри (api-contest-judge): без призов, возрастов, чужих оценок. */
export interface JudgeContest {
  id: string;
  title: string;
  season: string;
  kind: ContestKind;
  eventDate: string;
  venue: string;
  status: ContestStatus;
  organizationName: string;
  judgingMode: JudgingMode;
  criteria: ContestCriterion[];
  categories: { id: string; code: string; name: string; judging: CategoryJudging; currentParticipantId: string | null; currentSetAt: string | null }[];
}

export interface JudgeProject {
  id: string;
  number: string;
  projectTitle: string;
  projectDescription: string;
  authors: string[];
  city: string;
}

export interface JudgeBoard {
  category: { id: string; code: string; name: string; judging: CategoryJudging; currentParticipantId: string | null };
  projects: JudgeProject[];
  mine: Record<string, { scores: Record<string, number>; total: number; updatedAt: string; updatedByRole: string }>;
}

// ─── Подписи ───
// Геттеры (lib/trLabel): на экране — язык интерфейса, на сервере — русский фолбэк.

export const CONTEST_KIND_LABELS: Record<ContestKind, string> = localizeMap({
  olympiad: 'Олимпиада',
  project_contest: 'Конкурс проектов',
  competition: 'Соревнование',
  other: 'Мероприятие',
}, 'contestLabels.kind');

export const CONTEST_STATUS_LABELS: Record<ContestStatus, string> = localizeMap({
  draft: 'Черновик',
  registration: 'Регистрация',
  judging: 'Оценивание',
  finished: 'Завершён',
}, 'contestLabels.status');

export const CONTEST_STATUS_ORDER: ContestStatus[] = ['draft', 'registration', 'judging', 'finished'];

export const JUDGING_MODE_LABELS: Record<JudgingMode, { title: string; hint: string }> = {
  host: { title: 'Ведущий вызывает проекты', hint: 'Защита на сцене по очереди. Ведущий открывает проект с мониторинга — у жюри он появляется сам.' },
  free: { title: 'Жюри ходят по столам', hint: 'Каждый член жюри сам выбирает порядок: открывает проект из списка или по номеру.' },
};
(Object.keys(JUDGING_MODE_LABELS) as JudgingMode[]).forEach(m => {
  localizeField(JUDGING_MODE_LABELS[m], 'title', `contestLabels.judgingMode.${m}.title`);
  localizeField(JUDGING_MODE_LABELS[m], 'hint', `contestLabels.judgingMode.${m}.hint`);
});

export const JUDGING_LABELS: Record<CategoryJudging, string> = localizeMap({
  pending: 'Не начато',
  open: 'Идёт оценивание',
  closed: 'Закрыто',
  approved: 'Итоги утверждены',
}, 'contestLabels.judging');

export const PARTICIPANT_STATUS_LABELS: Record<ParticipantStatus, string> = localizeMap({
  registered: 'Зарегистрирован',
  arrived: 'Пришёл',
  withdrawn: 'Снят с конкурса',
}, 'contestLabels.participantStatus');

// ─── Номера, категории, критерии, призы ───

/** «A», 1 → «A-01»; после 99 номер просто становится длиннее: «A-100». */
export function formatProjectNumber(code: string, seq: number): string {
  return `${code}-${String(seq).padStart(2, '0')}`;
}

/**
 * Нормализует ввод номера с телефона: «b3», «B 3», «в-03» (кириллица) → «B-03».
 * Возвращает null, если в строке нет ни буквы, ни цифры.
 */
export function normalizeProjectNumber(input: string): string | null {
  const CYR_TO_LAT: Record<string, string> = { А: 'A', В: 'B', С: 'C', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', Т: 'T', Х: 'X' };
  const s = String(input || '').trim().toUpperCase().replace(/[АВСЕКМНОРТХ]/g, (ch) => CYR_TO_LAT[ch] || ch);
  const m = s.match(/^([A-Z]+)\s*[-–—]?\s*(\d+)$/);
  if (m) return formatProjectNumber(m[1], Number(m[2]));
  const digits = s.match(/^(\d+)$/);
  if (digits) return String(Number(digits[1]));
  return null;
}

/** Самый старший автор определяет категорию команды. */
export function participantAge(authors: ContestAuthor[]): number | null {
  const ages = authors.map((a) => a.age).filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
  return ages.length ? Math.max(...ages) : null;
}

/** Категория по возрасту. Если подходят несколько (диапазоны пересекаются) — первая по порядку. */
export function categoryForAge(categories: Pick<ContestCategory, 'id' | 'ageFrom' | 'ageTo'>[], age: number | null): string | null {
  if (age == null) return null;
  const hit = categories.find((c) => age >= c.ageFrom && age <= c.ageTo);
  return hit ? hit.id : null;
}

export interface CategoryOverlap {
  a: string;
  b: string;
}

/** Пары категорий, чьи возрастные диапазоны пересекаются (границы включительно). */
export function findAgeOverlaps(categories: Pick<ContestCategory, 'id' | 'code' | 'ageFrom' | 'ageTo'>[]): CategoryOverlap[] {
  const out: CategoryOverlap[] = [];
  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const x = categories[i];
      const y = categories[j];
      if (x.ageFrom <= y.ageTo && y.ageFrom <= x.ageTo) out.push({ a: x.id, b: y.id });
    }
  }
  return out;
}

export function maxTotal(criteria: Pick<ContestCriterion, 'maxScore'>[]): number {
  return criteria.reduce((s, c) => s + (Number(c.maxScore) || 0), 0);
}

export function prizeMoneyTotal(categories: Pick<ContestCategory, 'prizes'>[]): number {
  return categories.reduce((s, c) => s + (c.prizes || []).reduce((p, x) => p + (Number(x.amount) || 0), 0), 0);
}

export function prizeLabel(prize: ContestPrize | undefined, money: (n: number) => string): string {
  if (!prize) return '';
  const parts = [prize.title?.trim(), prize.amount ? money(prize.amount) : ''].filter(Boolean);
  return parts.join(' · ');
}

export function authorsLabel(authors: ContestAuthor[]): string {
  return authors.map((a) => a.name).filter(Boolean).join(', ');
}

/**
 * Проверка баллов одного жюри. Баллы — целые или с шагом 0,5, от 0 до максимума
 * критерия, по КАЖДОМУ критерию (частичная оценка не принимается: сумма из
 * трёх критериев из пяти исказила бы среднее).
 */
export function validateScores(
  criteria: ContestCriterion[],
  scores: Record<string, unknown>,
): { ok: true; scores: Record<string, number>; total: number } | { ok: false; error: string } {
  const clean: Record<string, number> = {};
  let total = 0;
  for (const c of criteria) {
    const raw = scores?.[c.id];
    if (raw === undefined || raw === null || raw === '') return { ok: false, error: `Не выставлен балл: «${c.name}»` };
    const v = Number(raw);
    if (!Number.isFinite(v)) return { ok: false, error: `Некорректный балл: «${c.name}»` };
    if (v < 0) return { ok: false, error: `Балл не может быть отрицательным: «${c.name}»` };
    if (v > c.maxScore) return { ok: false, error: `Больше максимума (${c.maxScore}): «${c.name}»` };
    if (Math.round(v * 2) !== v * 2) return { ok: false, error: `Шаг балла — 0,5: «${c.name}»` };
    clean[c.id] = v;
    total += v;
  }
  return { ok: true, scores: clean, total };
}

/** Кто из жюри оценивает категорию (categoryIds = null — все категории). */
export function juryForCategory<T extends Pick<ContestJuryMember, 'uid' | 'categoryIds'>>(jury: T[], categoryId: string): T[] {
  return jury.filter((j) => !j.categoryIds || j.categoryIds.length === 0 || j.categoryIds.includes(categoryId));
}

// ─── Рейтинг ───

export interface RankedRow {
  participantId: string;
  number: string;
  projectTitle: string;
  authors: string;
  /** Среднее арифметическое сумм от тех жюри, кто оценил; null — никто не оценил. */
  average: number | null;
  /** Сумма сумм (для справки и протокола). */
  sum: number;
  juryCount: number;
  /** Назначенные на категорию жюри, которые этот проект ещё не оценили. */
  missingJuryUids: string[];
  /** Средний балл по каждому критерию. */
  criterionAverages: Record<string, number>;
  /** Место. У участников неразрешённой ничьей — одно общее (наименьшее). */
  place: number | null;
  /** Ничья, которую не развели ни баллы, ни критерии, ни решение жюри. */
  needsDecision: boolean;
  /** Ничья была, её развели критерии из tieBreak (для пояснения в протоколе). */
  tieBrokenBy: string | null;
  /** Ничью развело ручное решение жюри. */
  resolvedManually: boolean;
  /** Номер группы ничьей (одинаковый у участников одной ничьей). */
  tieGroup: number | null;
}

const EPS = 1e-9;
const cmpNum = (a: number, b: number) => (Math.abs(a - b) < EPS ? 0 : b - a); // по убыванию

/**
 * Итоговый рейтинг категории.
 *
 * 1. Итоговый балл = среднее арифметическое сумм от тех жюри, кто оценил.
 * 2. Равенство разрешается средними баллами критериев в порядке `tieBreakCriterionIds`.
 * 3. Если ничья осталась — группа помечается `needsDecision`, пока админ не
 *    сохранит ручной порядок (TieResolution с ровно этим набором проектов).
 * Проекты без единой оценки идут в конец без места.
 */
export function rankCategory(args: {
  participants: Pick<ContestParticipant, 'id' | 'number' | 'seq' | 'projectTitle' | 'authors'>[];
  scores: Pick<ContestScore, 'participantId' | 'juryUid' | 'scores' | 'total'>[];
  assignedJuryUids: string[];
  criteria: Pick<ContestCriterion, 'id' | 'name'>[];
  tieBreakCriterionIds: string[];
  tieResolutions?: Pick<TieResolution, 'participantIds'>[];
}): RankedRow[] {
  const { participants, scores, assignedJuryUids, criteria, tieBreakCriterionIds } = args;
  const resolutions = args.tieResolutions || [];
  const criterionName = new Map(criteria.map((c) => [c.id, c.name]));
  const validTieBreak = tieBreakCriterionIds.filter((id) => criterionName.has(id));

  const rows: RankedRow[] = participants.map((p) => {
    const own = scores.filter((s) => s.participantId === p.id);
    const sum = own.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    const criterionAverages: Record<string, number> = {};
    for (const c of criteria) {
      const vals = own.map((s) => Number(s.scores?.[c.id])).filter((v) => Number.isFinite(v));
      criterionAverages[c.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    const scoredBy = new Set(own.map((s) => s.juryUid));
    return {
      participantId: p.id,
      number: p.number,
      projectTitle: p.projectTitle,
      authors: authorsLabel(p.authors || []),
      average: own.length ? sum / own.length : null,
      sum,
      juryCount: own.length,
      missingJuryUids: assignedJuryUids.filter((u) => !scoredBy.has(u)),
      criterionAverages,
      place: null,
      needsDecision: false,
      tieBrokenBy: null,
      resolvedManually: false,
      tieGroup: null,
    };
  });

  const seqOf = new Map(participants.map((p) => [p.id, p.seq]));
  const scored = rows.filter((r) => r.average !== null);
  const unscored = rows.filter((r) => r.average === null).sort((a, b) => (seqOf.get(a.participantId)! - seqOf.get(b.participantId)!));

  // Сравнение «по баллам + критериям ничьей». 0 — неразличимы.
  const cmpScore = (a: RankedRow, b: RankedRow): number => {
    const d = cmpNum(a.average!, b.average!);
    if (d !== 0) return d;
    for (const cid of validTieBreak) {
      const dc = cmpNum(a.criterionAverages[cid], b.criterionAverages[cid]);
      if (dc !== 0) return dc;
    }
    return 0;
  };

  // Стабильная база — номер проекта, чтобы порядок внутри ничьей был детерминированным.
  scored.sort((a, b) => cmpScore(a, b) || (seqOf.get(a.participantId)! - seqOf.get(b.participantId)!));

  // Кто кого развёл критерием: пометку получает только тот, кто оказался ВЫШЕ
  // соперника с тем же средним (cmpScore < 0 — «a раньше b»).
  for (let i = 0; i < scored.length; i++) {
    for (let j = 0; j < scored.length; j++) {
      if (i === j) continue;
      const a = scored[i];
      const b = scored[j];
      if (cmpNum(a.average!, b.average!) !== 0 || cmpScore(a, b) >= 0) continue;
      const decisive = validTieBreak.find((cid) => cmpNum(a.criterionAverages[cid], b.criterionAverages[cid]) !== 0);
      if (decisive && !a.tieBrokenBy) a.tieBrokenBy = criterionName.get(decisive) || null;
    }
  }

  // Группы полной ничьей и места.
  const ordered: RankedRow[] = [];
  let groupNo = 0;
  let i = 0;
  while (i < scored.length) {
    let j = i + 1;
    while (j < scored.length && cmpScore(scored[i], scored[j]) === 0) j++;
    let group = scored.slice(i, j);
    const startPlace = ordered.length + 1;
    if (group.length === 1) {
      group[0].place = startPlace;
    } else {
      groupNo += 1;
      const ids = new Set(group.map((r) => r.participantId));
      const resolution = resolutions.find((r) =>
        r.participantIds.length === ids.size && r.participantIds.every((id) => ids.has(id)));
      if (resolution) {
        const pos = new Map(resolution.participantIds.map((id, k) => [id, k]));
        group = [...group].sort((a, b) => pos.get(a.participantId)! - pos.get(b.participantId)!);
        group.forEach((r, k) => { r.place = startPlace + k; r.resolvedManually = true; r.tieGroup = groupNo; });
      } else {
        group.forEach((r) => { r.place = startPlace; r.needsDecision = true; r.tieGroup = groupNo; });
      }
    }
    ordered.push(...group);
    i = j;
  }

  return [...ordered, ...unscored];
}

/** Можно ли утверждать: никакая неразрешённая ничья не задевает призовые места. */
export function blockingTies(rows: RankedRow[], prizePlaces: number): RankedRow[] {
  return rows.filter((r) => r.needsDecision && r.place !== null && r.place <= Math.max(prizePlaces, 1));
}

/** «2026-05-14» → «14 мая 2026 г.» */
export function formatContestDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function round2(n: number | null): string {
  if (n === null) return '—';
  return (Math.round(n * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
