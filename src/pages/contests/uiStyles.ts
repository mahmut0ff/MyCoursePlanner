import i18n from '../../i18n';
import {
  CONTEST_KIND_LABELS, CONTEST_STATUS_LABELS, JUDGING_LABELS, JUDGING_MODE_LABELS, PARTICIPANT_STATUS_LABELS,
  type CategoryJudging, type ContestKind, type ContestStatus, type JudgingMode, type ParticipantStatus,
} from '../../lib/contests';

/** Классы кнопок и карточек модуля «Конкурсы» (в тон ClassroomsPage / FinancesPage). */
export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[13px] font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 shrink-0';
export const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-[13px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 shrink-0';
export const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white transition-colors disabled:opacity-50';
export const cardCls = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm';
export const inputCls = 'input bg-slate-50 dark:bg-slate-900/50';


export function errMessage(e: unknown): string {
  return (e as any)?.message || i18n.t('contests.actionFailed', 'Не удалось выполнить действие');
}

export const ageRangeLabel = (c: { ageFrom: number; ageTo: number }) => i18n.t('contests.ageRange', '{{from}}–{{to}} лет', { from: c.ageFrom, to: c.ageTo });
/** Единое имя категории везде: «A · 12–15 лет». */
export const categoryLabel = (c: { code: string; ageFrom: number; ageTo: number }) => `${c.code} · ${ageRangeLabel(c)}`;

// Подписи из lib/contests — фолбэк; перевод по ключу на момент рендера.
export const kindLabel = (k: ContestKind) => i18n.t(`contests.kinds.${k}`, CONTEST_KIND_LABELS[k]);
export const contestStatusLabel = (s: ContestStatus) => i18n.t(`contests.statuses.${s}`, CONTEST_STATUS_LABELS[s]);
export const judgingLabel = (s: CategoryJudging) => i18n.t(`contests.judging.${s}`, JUDGING_LABELS[s]);
export const participantStatusLabel = (s: ParticipantStatus) => i18n.t(`contests.participantStatuses.${s}`, PARTICIPANT_STATUS_LABELS[s]);
export const judgingModeLabel = (m: JudgingMode) => ({
  title: i18n.t(`contests.judgingModes.${m}.title`, JUDGING_MODE_LABELS[m].title),
  hint: i18n.t(`contests.judgingModes.${m}.hint`, JUDGING_MODE_LABELS[m].hint),
});
