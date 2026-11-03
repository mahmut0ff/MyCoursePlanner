import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight, BellRing, CalendarDays, ClipboardCheck, Coins, FileCheck, Languages, MonitorPlay, School, Send,
  Sparkles, Trophy, Wallet, type LucideIcon,
} from 'lucide-react';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import {
  Cta, FaqJsonLd, MktFooter, MktNav, Reveal, focusRing, h2Cls, leadCls, primaryBtn, secondaryBtn,
} from '../../components/landing/LandingKit';
import { GUIDE_PATH, SOLUTIONS, type SolutionId } from '../../components/landing/solutions';

/* ──────────────────────────────────────────────────────────────
   /crm-dlya-* — one page per kind of institution, answering the
   query people actually type ("crm для языковой школы"): what
   changes for them, two honest FAQs, links to the other types.
   ────────────────────────────────────────────────────────────── */

const ICONS: Record<SolutionId, [LucideIcon, LucideIcon, LucideIcon]> = {
  center: [Wallet, ClipboardCheck, Coins],
  language: [Languages, FileCheck, Wallet],
  school: [School, Send, Wallet],
  kids: [Send, CalendarDays, BellRing],
  online: [MonitorPlay, Trophy, Sparkles],
};

const SolutionPage: React.FC<{ id: SolutionId }> = ({ id }) => {
  const { t } = useTranslation();
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = () => setDemoOpen(true);
  const k = (key: string) => t(`sol.${id}.${key}`);

  const anchors = [
    { href: '/features', label: t('landing.navFeatures') },
    { href: '/#pricing', label: t('home.navPricing') },
    { href: '/contact', label: t('landing.navContact') },
  ];
  const faqs = [1, 2].map((n) => ({ q: k(`q${n}`), a: k(`a${n}`) }));

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-slate-900 antialiased selection:bg-primary-600 selection:text-white dark:bg-slate-900 dark:text-slate-100">
      <MktNav anchors={anchors} onDemo={openDemo} />

      <header className="mx-auto max-w-[1200px] px-4 pb-12 pt-12 sm:px-8 sm:pt-20">
        <p className="hero-rise mb-4 text-[14px] font-medium text-primary-600 dark:text-primary-400">{k('eyebrow')}</p>
        <h1 className="hero-rise max-w-[22ch] text-balance text-[clamp(32px,4.4vw,54px)] font-semibold leading-[1.08] tracking-[-0.035em]">
          {k('title')}
        </h1>
        <p className={`hero-rise mt-5 max-w-[60ch] ${leadCls} sm:!text-[18px]`} style={{ animationDelay: '0.06s' }}>
          {k('lead')}
        </p>
        <div className="hero-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '0.12s' }}>
          <Cta onFallback={openDemo} className={primaryBtn}>
            {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-4 w-4" />
          </Cta>
          <a href="/#pricing" className={secondaryBtn}>{t('sol.common.pricing')}</a>
        </div>
      </header>

      <main>
        <section className="bg-slate-50 py-14 sm:py-20 dark:bg-slate-800/40">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
            <h2 className={h2Cls}>{t('sol.common.what')}</h2>
            <div className="mt-10 grid gap-x-10 gap-y-10 md:grid-cols-3">
              {ICONS[id].map((Icon, i) => (
                <Reveal key={i} delay={i * 80}>
                  <article className="max-w-[40ch]">
                    <Icon aria-hidden className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    <h3 className="mt-4 text-[17px] font-semibold">{k(`b${i + 1}t`)}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{k(`b${i + 1}d`)}</p>
                  </article>
                </Reveal>
              ))}
            </div>
            <Link to="/features" className={`mt-10 inline-flex items-center gap-1.5 rounded-sm text-[15px] font-medium text-primary-700 hover:text-primary-800 dark:text-primary-400 ${focusRing}`}>
              {t('sol.common.allFeatures')} <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-14 sm:px-8 sm:py-20">
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

        <SolutionLinks current={id} />
      </main>

      <MktFooter />
      <FaqJsonLd items={faqs} />
      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

/** Cross-links between the solution pages and the guide — crawl paths and next reads. */
export const SolutionLinks: React.FC<{ current?: SolutionId | 'guide' }> = ({ current }) => {
  const { t } = useTranslation();
  const linkCls = `inline-flex h-10 items-center rounded-md bg-slate-100 px-4 text-[15px] text-slate-800 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${focusRing}`;
  return (
    <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8 sm:pb-24">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t('sol.common.more')}</h2>
      <ul className="mt-5 flex flex-wrap gap-2">
        {SOLUTIONS.filter((s) => s.id !== current).map((s) => (
          <li key={s.id}><Link to={s.path} className={linkCls}>{t(`sol.${s.id}.eyebrow`)}</Link></li>
        ))}
        {current !== 'guide' && <li><Link to={GUIDE_PATH} className={linkCls}>{t('sol.common.guide')}</Link></li>}
      </ul>
    </section>
  );
};

export default SolutionPage;
