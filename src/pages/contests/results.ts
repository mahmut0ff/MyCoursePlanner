/**
 * Итоги категории для экранов «Итоги», печати протокола и CSV — поверх общего
 * rankCategory (src/lib/contests.ts), которым же пользуется сервер при
 * утверждении. Утверждённые итоги берутся из снимка, а не пересчитываются:
 * после утверждения места зафиксированы.
 */
import { buildCsv, downloadCsv } from '../../lib/csv';
import { formatMoney } from '../../lib/money';
import {
  rankCategory, juryForCategory, prizeLabel, round2,
  type ContestBundle, type RankedRow, type ContestCategory,
} from '../../lib/contests';

export interface CategoryRanking {
  category: ContestCategory;
  rows: RankedRow[];
  approved: ContestBundle['results'][number]['approved'];
  resolutions: ContestBundle['results'][number]['tieResolutions'];
  juryUids: string[];
}

export function categoryRanking(data: ContestBundle, categoryId: string): CategoryRanking | null {
  const category = data.contest.categories.find((c) => c.id === categoryId);
  if (!category) return null;
  const res = data.results.find((r) => r.categoryId === categoryId);
  const inCat = data.participants.filter((p) => p.categoryId === categoryId && p.status === 'arrived');
  const ids = new Set(inCat.map((p) => p.id));
  const juryUids = juryForCategory(data.jury, categoryId).map((j) => j.uid);
  const rows = rankCategory({
    participants: inCat,
    scores: data.scores.filter((s) => ids.has(s.participantId)),
    assignedJuryUids: juryUids,
    criteria: data.contest.criteria,
    tieBreakCriterionIds: data.contest.tieBreakCriterionIds,
    tieResolutions: res?.tieResolutions || [],
  });
  return { category, rows, approved: res?.approved || null, resolutions: res?.tieResolutions || [], juryUids };
}

export const prizeFor = (cat: ContestCategory, place: number | null) =>
  place ? prizeLabel(cat.prizes[place - 1], formatMoney) : '';

/** Итоговая таблица всех категорий: места, баллы, средние по критериям и суммы каждого жюри. */
export function exportResultsCsv(data: ContestBundle): void {
  const { contest, jury, scores } = data;
  const headers = [
    'Категория', 'Место', 'Номер', 'Проект', 'Авторы', 'Итоговый балл (среднее)', 'Сумма баллов', 'Оценили жюри',
    ...contest.criteria.map((c) => `Ср.: ${c.name}`),
    ...jury.map((j) => `Жюри: ${j.name}`),
    'Приз', 'Статус итогов', 'Примечание',
  ];
  const lines: unknown[][] = [];
  for (const cat of contest.categories) {
    const r = categoryRanking(data, cat.id);
    if (!r) continue;
    const approvedPlace = new Map((r.approved?.rows || []).map((x) => [x.participantId, x.place]));
    for (const row of r.rows) {
      const place = r.approved ? approvedPlace.get(row.participantId) ?? null : row.place;
      const note = [
        row.needsDecision ? 'требуется решение жюри' : '',
        row.resolvedManually ? 'место определено решением жюри' : '',
        row.tieBrokenBy ? `ничья разрешена по критерию «${row.tieBrokenBy}»` : '',
        row.missingJuryUids.length ? `не оценили: ${row.missingJuryUids.map((u) => jury.find((j) => j.uid === u)?.name || u).join(', ')}` : '',
      ].filter(Boolean).join('; ');
      lines.push([
        `${cat.code} (${cat.ageFrom}–${cat.ageTo})`, place ?? '', row.number, row.projectTitle, row.authors,
        round2(row.average), round2(row.sum), row.juryCount,
        ...contest.criteria.map((c) => round2(row.juryCount ? row.criterionAverages[c.id] : null)),
        ...jury.map((j) => {
          const s = scores.find((x) => x.participantId === row.participantId && x.juryUid === j.uid);
          return s ? round2(s.total) : '';
        }),
        prizeFor(cat, place), r.approved ? 'утверждены' : 'предварительные', note,
      ]);
    }
  }
  const safe = contest.title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
  downloadCsv(`${safe || 'contest'}_итоги.csv`, buildCsv(headers, lines));
}
