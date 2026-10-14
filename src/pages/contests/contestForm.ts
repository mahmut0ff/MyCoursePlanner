import type { ContestKind } from '../../lib/contests';

/** Поля «паспорта» конкурса в форме (числа — строками, как в input). */
export const emptyMetaForm = {
  title: '', season: String(new Date().getFullYear()), kind: 'olympiad' as ContestKind,
  theme: '', eventDate: '', venue: '', prizeFund: '', description: '',
};
export type MetaForm = typeof emptyMetaForm;
