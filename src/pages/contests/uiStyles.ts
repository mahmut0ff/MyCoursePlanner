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
  return (e as any)?.message || 'Не удалось выполнить действие';
}

/** Единое имя категории везде: «A · 12–15 лет». */
export const categoryLabel = (c: { code: string; ageFrom: number; ageTo: number }) => `${c.code} · ${c.ageFrom}–${c.ageTo} лет`;
