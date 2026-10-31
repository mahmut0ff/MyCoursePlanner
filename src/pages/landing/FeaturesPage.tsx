import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, ClipboardCheck, CalendarDays, Network, Send, Sparkles, Check, ArrowRight } from 'lucide-react';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import {
  Cta, MktNav, MktFooter, Reveal, focusRing, eyebrowCls, h2Cls, primaryBtn,
} from '../../components/landing/LandingKit';

/* ──────────────────────────────────────────────────────────────
   /features — the module tour in the same paper/ink language as
   the home page: one section per area of the center, each with
   what it does in plain words.
   ────────────────────────────────────────────────────────────── */

const GROUPS = [
  { n: 1, id: 'money', icon: Wallet, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { n: 2, id: 'study', icon: ClipboardCheck, tone: 'bg-primary-600/10 text-primary-600 dark:text-primary-300' },
  { n: 3, id: 'schedule', icon: CalendarDays, tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  { n: 4, id: 'team', icon: Network, tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { n: 5, id: 'parents', icon: Send, tone: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  { n: 6, id: 'ai', icon: Sparkles, tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
];

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
    <div className="min-h-screen overflow-x-clip bg-paper font-marketing text-ink antialiased selection:bg-primary-600 selection:text-white">
      <MktNav anchors={anchors} onDemo={openDemo} />

      {/* ═══ Hero ═══ */}
      <header className="mx-auto max-w-[1240px] px-5 pb-10 pt-12 sm:px-8 sm:pt-16 lg:pt-[80px]">
        <p className={`hero-rise ${eyebrowCls}`}>{t('landing.navFeatures')}</p>
        <h1
          className="hero-rise mt-[22px] max-w-[20ch] text-balance font-marketing-display text-[clamp(32px,4.4vw,60px)] font-bold leading-[1.08] tracking-[-0.01em]"
          style={{ animationDelay: '0.06s' }}
        >
          {t('mkt.fpTitle')}
        </h1>
        <p className="hero-rise mt-6 max-w-[60ch] text-[17px] leading-[1.65] text-ink/70 sm:text-[19px]" style={{ animationDelay: '0.12s' }}>
          {t('mkt.fpSub')}
        </p>
        <div className="hero-rise mt-9 flex flex-wrap items-center gap-3.5" style={{ animationDelay: '0.18s' }}>
          <Cta onFallback={openDemo} className={primaryBtn}>
            {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-[18px] w-[18px]" />
          </Cta>
          <a
            href="/#pricing"
            className={`inline-flex items-center gap-2.5 rounded-full border-[1.5px] border-ink/20 px-[26px] py-4 text-[17px] font-semibold text-ink transition-colors hover:border-ink ${focusRing}`}
          >
            {t('mkt.fpPricing')}
          </a>
        </div>
      </header>

      {/* ═══ Section index — sticky under the nav, scrolls sideways on phones ═══ */}
      <nav
        aria-label={t('mkt.fpSections')}
        className="sticky top-[72px] z-40 border-y border-ink/[0.08] bg-paper/85 backdrop-blur-xl"
      >
        <ul className="mx-auto flex max-w-[1240px] gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden">
          {GROUPS.map(({ n, id, icon: Icon }) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                className={`inline-flex items-center gap-2 rounded-full border border-ink/10 bg-card px-4 py-2 text-sm font-semibold text-ink/75 transition-colors hover:border-ink/30 hover:text-ink ${focusRing}`}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {t(`mkt.g${n}Tab`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ═══ Module sections ═══ */}
      <main className="mx-auto max-w-[1240px] space-y-6 px-5 py-14 sm:px-8 sm:py-20">
        {GROUPS.map(({ n, id, icon: Icon, tone }, i) => (
          <section key={id} id={id} className="scroll-mt-[150px]">
            <Reveal>
              <div className="grid items-center gap-8 rounded-[28px] border border-ink/[0.06] bg-card p-6 sm:p-10 lg:grid-cols-2 lg:gap-14 lg:p-14">
                <div className={i % 2 ? 'lg:order-2' : ''}>
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
                    <Icon aria-hidden className="h-6 w-6" />
                  </span>
                  <p className={`mt-6 ${eyebrowCls}`}>{t(`mkt.g${n}Tab`)}</p>
                  <h2 className={`${h2Cls} !text-[clamp(24px,2.6vw,36px)]`}>{t(`mkt.g${n}Title`)}</h2>
                  <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.65] text-ink/70">{t(`mkt.g${n}Desc`)}</p>
                </div>
                <ul className="grid gap-3">
                  {[1, 2, 3, 4].map((b) => (
                    <li key={b} className="flex items-start gap-3.5 rounded-2xl bg-paper px-5 py-4">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
                        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <span className="text-[15px] font-medium leading-snug">{t(`mkt.g${n}B${b}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </section>
        ))}
      </main>

      {/* ═══ CTA ═══ */}
      <section className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-8 sm:pb-[104px]">
        <Reveal>
          <div className="relative overflow-hidden rounded-[28px] bg-primary-600 p-7 text-white sm:rounded-[36px] sm:px-16 sm:py-[72px]">
            <div aria-hidden className="absolute -right-20 -top-20 h-[340px] w-[340px] rounded-full bg-white/[0.08]" />
            <div aria-hidden className="absolute -bottom-[120px] right-[60px] h-[260px] w-[260px] rounded-full bg-amber-500/25" />
            <div className="relative max-w-[60ch]">
              <h2 className="text-balance font-marketing-display text-[clamp(26px,3.2vw,44px)] font-bold leading-[1.12]">
                {t('home.ctaTitle')}
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-white/80">{t('home.ctaDesc')}</p>
              <Cta
                onFallback={openDemo}
                className="mt-[34px] inline-flex items-center gap-2.5 rounded-full bg-white px-[30px] py-4 text-base font-bold text-[#16141f] transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
              >
                {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-[18px] w-[18px]" />
              </Cta>
            </div>
          </div>
        </Reveal>
      </section>

      <MktFooter />
      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

export default FeaturesPage;
