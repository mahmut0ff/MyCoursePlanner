import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { TELEGRAM_LINK, isPlaceholder } from './ctaLinks';
import { MktNav, MktFooter, focusRing, leadCls } from './LandingKit';

/* ──────────────────────────────────────────────────────────────
   Chrome for the public subpages (/about, /contact, /docs,
   /vibecoder, legal). Built on LandingKit so they share the home
   page's nav, footer and tone: whitespace and tints, no outlined
   boxes, the one approved call to action.
   ────────────────────────────────────────────────────────────── */

/* Every call to action on the public pages points at the same place. Until the
   owner supplies the Telegram link it keeps its previous destination — the demo
   request form — rather than a dead URL. */
export const ChromeCta: React.FC<{ className: string; onClick?: () => void; children: React.ReactNode }> = ({
  className,
  onClick,
  children,
}) =>
  isPlaceholder(TELEGRAM_LINK) ? (
    <Link to="/contact?demo=1" onClick={onClick} className={className}>
      {children}
    </Link>
  ) : (
    <a href={TELEGRAM_LINK} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
      {children}
    </a>
  );

export const LandingNav: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const anchors = [
    { href: '/features', label: t('landing.navFeatures') },
    { href: '/#pricing', label: t('landing.navPricing') },
    { href: '/docs', label: t('landing.navDocs') },
    { href: '/about', label: t('landing.navAbout') },
    { href: '/contact', label: t('landing.navContact') },
  ];
  return <MktNav anchors={anchors} onDemo={() => navigate('/contact?demo=1')} />;
};

export const LandingFooter = MktFooter;

/** Page heading for subpages: left-aligned, same rise as the home hero. */
export const PageHero: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <header className="mx-auto max-w-[1200px] px-4 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-20">
    <h1 className="hero-rise max-w-[20ch] text-balance text-[clamp(32px,4.2vw,52px)] font-semibold leading-[1.08] tracking-[-0.035em]">
      {title}
    </h1>
    {subtitle && (
      <p className={`hero-rise mt-5 max-w-[60ch] ${leadCls} sm:!text-[18px]`} style={{ animationDelay: '0.08s' }}>
        {subtitle}
      </p>
    )}
  </header>
);

/** The violet call-to-action band, with the home page's approved copy. */
export const LandingCTA: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-20 sm:px-8 sm:pb-24 sm:pt-28">
      <div className="grid gap-8 rounded-3xl bg-primary-600 p-7 text-white sm:p-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12 lg:p-14 dark:bg-primary-700">
        <div className="max-w-[56ch]">
          <h2 className="text-balance text-[clamp(26px,3vw,40px)] font-semibold leading-[1.12] tracking-[-0.03em]">
            {t('home.ctaTitle')}
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-white/85">{t('home.ctaDesc')}</p>
        </div>
        <ChromeCta className="inline-flex h-11 items-center gap-2 justify-self-start whitespace-nowrap rounded-md bg-white px-5 text-[15px] font-medium text-primary-700 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600">
          {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-4 w-4" />
        </ChromeCta>
      </div>
    </section>
  );
};

export type LegalSection = { id: string; heading: string; body: string[] };

/** Layout for legal pages (privacy, terms): sticky contents + numbered sections. */
export const LegalLayout: React.FC<{
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
}> = ({ title, updated, intro, sections }) => (
  <div className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-900 dark:text-slate-100">
    <LandingNav />
    <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-12 sm:px-8 sm:pt-20">
      <h1 className="text-[clamp(30px,3.6vw,44px)] font-semibold leading-[1.1] tracking-[-0.03em]">{title}</h1>
      <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400">{updated}</p>
      {intro && <p className={`mt-6 max-w-[64ch] ${leadCls}`}>{intro}</p>}

      <div className="mt-12 grid gap-12 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-0.5">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`block rounded-md px-3 py-2 text-[14px] text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${focusRing}`}
              >
                {s.heading}
              </a>
            ))}
          </nav>
        </aside>

        <div className="max-w-[68ch] space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              <h2 className="flex items-baseline gap-3 text-[20px] font-semibold tracking-[-0.01em]">
                <span className="text-[13px] font-medium tabular-nums text-primary-600 dark:text-primary-400">{String(i + 1).padStart(2, '0')}</span>
                {s.heading}
              </h2>
              <div className="mt-3 space-y-3 text-[15px] leading-[1.65] text-slate-600 dark:text-slate-400">
                {s.body.map((p, j) => <p key={j}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
    <LandingFooter />
  </div>
);
