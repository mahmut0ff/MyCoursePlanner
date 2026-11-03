import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import { Cta, FaqJsonLd, MktFooter, MktNav, Reveal, h2Cls, leadCls, primaryBtn } from '../../components/landing/LandingKit';
import { SolutionLinks } from './SolutionPage';

/* ──────────────────────────────────────────────────────────────
   /kak-vybrat-crm — the buyer's checklist that ranking lists and
   AI answers quote: six criteria, then SabakHub vs spreadsheets vs a
   generic CRM, with no claims about named products beyond "generic
   CRMs usually need custom work for teaching". SabakHub is the
   second column so phones see it without scrolling the table.
   ────────────────────────────────────────────────────────────── */

const CRITERIA = [1, 2, 3, 4, 5, 6];
const ROWS = [1, 2, 3, 4, 5];

const GuidePage: React.FC = () => {
  const { t } = useTranslation();
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = () => setDemoOpen(true);

  const anchors = [
    { href: '/features', label: t('landing.navFeatures') },
    { href: '/#pricing', label: t('home.navPricing') },
    { href: '/contact', label: t('landing.navContact') },
  ];
  const faqs = [1, 2].map((n) => ({ q: t(`guide.q${n}`), a: t(`guide.a${n}`) }));
  const cell = 'px-4 py-3 align-top text-[15px] leading-snug';

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-slate-900 antialiased selection:bg-primary-600 selection:text-white dark:bg-slate-900 dark:text-slate-100">
      <MktNav anchors={anchors} onDemo={openDemo} />

      <header className="mx-auto max-w-[1200px] px-4 pb-12 pt-12 sm:px-8 sm:pt-20">
        <p className="hero-rise mb-4 text-[14px] font-medium text-primary-600 dark:text-primary-400">{t('guide.eyebrow')}</p>
        <h1 className="hero-rise max-w-[22ch] text-balance text-[clamp(32px,4.4vw,54px)] font-semibold leading-[1.08] tracking-[-0.035em]">
          {t('guide.title')}
        </h1>
        <p className={`hero-rise mt-5 max-w-[60ch] ${leadCls} sm:!text-[18px]`} style={{ animationDelay: '0.06s' }}>
          {t('guide.lead')}
        </p>
      </header>

      <main>
        <section className="bg-slate-50 py-14 sm:py-20 dark:bg-slate-800/40">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
            <h2 className={h2Cls}>{t('guide.crit')}</h2>
            <ol className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
              {CRITERIA.map((n, i) => (
                <li key={n}>
                  <Reveal delay={(i % 2) * 80} className="flex max-w-[52ch] gap-4">
                    <span aria-hidden className="mt-0.5 text-[15px] font-semibold tabular-nums text-primary-600 dark:text-primary-400">
                      {String(n).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="text-[17px] font-semibold">{t(`guide.c${n}t`)}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{t(`guide.c${n}d`)}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-14 sm:px-8 sm:py-20">
          <h2 className={h2Cls}>{t('guide.table')}</h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th scope="col" className={`${cell} font-medium text-slate-500 dark:text-slate-400`}>{t('guide.colFeature')}</th>
                  <th scope="col" className={`${cell} rounded-t-lg bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300`}>{t('guide.colC')}</th>
                  <th scope="col" className={`${cell} font-medium`}>{t('guide.colA')}</th>
                  <th scope="col" className={`${cell} font-medium`}>{t('guide.colB')}</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((n) => (
                  <tr key={n} className="border-b border-slate-200 dark:border-slate-700">
                    <th scope="row" className={`${cell} font-medium`}>{t(`guide.r${n}`)}</th>
                    <td className={`${cell} bg-primary-50 font-medium dark:bg-primary-900/30`}>{t(`guide.r${n}c`)}</td>
                    <td className={`${cell} text-slate-600 dark:text-slate-400`}>{t(`guide.r${n}a`)}</td>
                    <td className={`${cell} text-slate-600 dark:text-slate-400`}>{t(`guide.r${n}b`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 max-w-[72ch] text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">{t('guide.note')}</p>
          <div className="mt-8">
            <Cta onFallback={openDemo} className={primaryBtn}>
              {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-4 w-4" />
            </Cta>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 pb-14 sm:px-8 sm:pb-20">
          <h2 className={h2Cls}>{t('sol.common.faq')}</h2>
          <dl className="mt-8 grid max-w-[72ch] gap-8">
            {faqs.map((f) => (
              <div key={f.q}>
                <dt className="text-[17px] font-semibold">{f.q}</dt>
                <dd className={`mt-2 ${leadCls}`}>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <SolutionLinks current="guide" />
      </main>

      <MktFooter />
      <FaqJsonLd items={faqs} />
      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

export default GuidePage;
