/* Search-landing pages: one per institution type SabakHub really supports
   (center / school / language / academy modes, plus kids centers on the center
   mode). Copy lives in locales under `sol.<id>`; Russian meta in SeoHead.
   A new entry also needs: SeoHead PAGES, prerender ROUTES, sitemap.xml. */

export const SOLUTIONS = [
  { id: 'center', path: '/crm-dlya-uchebnogo-centra' },
  { id: 'language', path: '/crm-dlya-yazykovoy-shkoly' },
  { id: 'school', path: '/crm-dlya-chastnoy-shkoly' },
  { id: 'kids', path: '/crm-dlya-detskogo-centra' },
  { id: 'online', path: '/crm-dlya-onlayn-shkoly' },
] as const;

export type SolutionId = (typeof SOLUTIONS)[number]['id'];

export const GUIDE_PATH = '/kak-vybrat-crm';
