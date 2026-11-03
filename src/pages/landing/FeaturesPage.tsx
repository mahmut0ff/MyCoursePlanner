import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, ClipboardCheck, CalendarDays, Network, Send, Sparkles, Check, ArrowRight } from 'lucide-react';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import {
  Cta, MktNav, MktFooter, Reveal, focusRing, h2Cls, leadCls, primaryBtn, secondaryBtn,
} from '../../components/landing/LandingKit';

/* ──────────────────────────────────────────────────────────────
   /features — the module tour in the app shell's language: one
   section per area of the center, what it does in plain words on
   the left and a settings-style checklist on the right.
   ────────────────────────────────────────────────────────────── */

const GROUPS = [
  { n: 1, id: 'money', icon: Wallet },
  { n: 2, id: 'study', icon: ClipboardCheck },
  { n: 3, id: 'schedule', icon: CalendarDays },
  { n: 4, id: 'team', icon: Network },
  { n: 5, id: 'parents', icon: Send },
  { n: 6, id: 'ai', icon: Sparkles },
];

const hairline = 'border-slate-200 dark:border-slate-700';

const FeaturesPage: React.FC = () => {
  const { t } = useTranslation();
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = () => setDemoOpen(true);

  const anchors = [
    { href: '/#pricing', label: t('home.navPricing') },
    { href: '/#faq', label: t('home.navFaq') },
    { href: '/contact', label: t('landing.navContact') },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-slate-900 antialiased selection:bg-primary-600 selection:text-white dark:bg-slate-900 dark:text-slate-100">
      <MktNav anchors={anchors} onDemo={openDemo} />

      {/* ═══ Hero ═══ */}
      <header className="mx-auto max-w-[1200px] px-4 pb-12 pt-12 sm:px-8 sm:pt-20">
        <p className="hero-rise mb-4 text-[14px] font-medium text-primary-600 dark:text-primary-400">{t('mkt.fpEyebrow')}</p>
        <h1
          className="hero-rise max-w-[20ch] text-balance text-[clamp(34px,4.6vw,56px)] font-semibold leading-[1.06] tracking-[-0.035em]"
        >
          {t('mkt.fpTitle')}
        </h1>
        <p className={`hero-rise mt-5 max-w-[60ch] ${leadCls} sm:!text-[18px]`} style={{ animationDelay: '0.06s' }}>
          {t('mkt.fpSub')}
        </p>
        <div className="hero-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '0.12s' }}>
          <Cta onFallback={openDemo} className={primaryBtn}>
            {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-4 w-4" />
          </Cta>
          <a href="/#pricing" className={secondaryBtn}>
            {t('mkt.fpPricing')}
          </a>
        </div>
      </header>

      {/* ═══ Section index — sticky under the nav, scrolls sideways on phones ═══ */}
      <nav aria-label={t('mkt.fpSections')} className={`sticky top-14 z-40 border-y bg-white dark:bg-slate-900 ${hairline}`}>
        <ul className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden">
          {GROUPS.map(({ n, id, icon: Icon }) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-[14px] text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${focusRing}`}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {t(`mkt.g${n}Tab`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ═══ Module sections, separated by hairlines rather than boxed ═══ */}
      <main className="mx-auto max-w-[1200px] px-4 sm:px-8">
        {GROUPS.map(({ n, id, icon: Icon }, i) => (
          <section key={id} id={id} className={`scroll-mt-[120px] py-12 sm:py-16 ${i ? `border-t ${hairline}` : ''}`}>
            <Reveal>
              <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-16">
                <div>
                  <p className="flex items-center gap-2 text-[14px] font-medium text-primary-600 dark:text-primary-400">
                    <Icon aria-hidden className="h-4 w-4" />
                    {t(`mkt.g${n}Tab`)}
                  </p>
                  <h2 className={`mt-3 ${h2Cls} !text-[clamp(24px,2.6vw,32px)]`}>{t(`mkt.g${n}Title`)}</h2>
                  <p className={`mt-4 max-w-[52ch] ${leadCls}`}>{t(`mkt.g${n}Desc`)}</p>
                </div>
                <ul className={`divide-y overflow-hidden rounded-lg border ${hairline} divide-slate-200 dark:divide-slate-700`}>
                  {[1, 2, 3, 4].map((b) => (
                    <li key={b} className="flex items-start gap-3 px-4 py-3.5">
                      <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" strokeWidth={2.5} />
                      <span className="text-[15px] leading-snug">{t(`mkt.g${n}B${b}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </section>
        ))}
      </main>

      {/* ═══ CTA ═══ */}
      <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-4 sm:px-8 sm:pb-24">
        <Reveal>
          <div className="grid gap-8 rounded-3xl bg-primary-600 p-7 text-white sm:p-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12 lg:p-14 dark:bg-primary-700">
            <div className="max-w-[56ch]">
              <h2 className="text-balance text-[clamp(26px,3vw,40px)] font-semibold leading-[1.12] tracking-[-0.03em]">
                {t('home.ctaTitle')}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-white/85">{t('home.ctaDesc')}</p>
            </div>
            <Cta
              onFallback={openDemo}
              className="inline-flex h-11 items-center gap-2 justify-self-start whitespace-nowrap rounded-md bg-white px-5 text-[15px] font-medium text-primary-700 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
            >
              {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-4 w-4" />
            </Cta>
          </div>
        </Reveal>
      </section>

      <MktFooter />
      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

export default FeaturesPage;
