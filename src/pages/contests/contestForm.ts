import type { ContestKind, JudgingMode } from '../../lib/contests';

/** Поля «паспорта» конкурса в форме (числа — строками, как в input). */
export const emptyMetaForm = {
  title: '', season: String(new Date().getFullYear()), kind: 'olympiad' as ContestKind,
  theme: '', eventDate: '', venue: '', prizeFund: '', description: '',
  judgingMode: 'host' as JudgingMode,
};
export type MetaForm = typeof emptyMetaForm;
