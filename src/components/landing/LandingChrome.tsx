import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import LanguageSwitcher from '../LanguageSwitcher';
import { Menu, X, MessageCircle, Mail, Phone, MapPin, ArrowRight } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────
   Shared chrome + primitives for every marketing / public page.
   One source of truth for the navbar, footer and section rhythm.
   ────────────────────────────────────────────────────────────── */

export const Eyebrow: React.FC<{ children: React.ReactNode; tone?: 'light' | 'dark' }> = ({ children, tone = 'light' }) => (
  <p className={`text-[0.8rem] font-semibold uppercase tracking-[0.18em] ${tone === 'dark' ? 'text-primary-300' : 'text-primary-600'}`}>
    {children}
  </p>
);

export const SectionHead: React.FC<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
  tone?: 'light' | 'dark';
  align?: 'left' | 'center';
}> = ({ eyebrow, title, subtitle, tone = 'light', align = 'center' }) => (
  <div className={`max-w-2xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
    {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
    <h2 className={`mt-3 text-3xl sm:text-4xl font-bold tracking-tight ${tone === 'dark' ? 'text-white' : 'text-slate-900'}`}>
      {title}
    </h2>
    {subtitle && (
      <p className={`mt-4 text-lg leading-relaxed ${tone === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
        {subtitle}
      </p>
    )}
  </div>
);

type NavItem = { label: string; to?: string; href?: string };

export const LandingNav: React.FC<{ variant?: 'home' | 'page' }> = ({ variant = 'page' }) => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const items: NavItem[] = [
    { label: t('landing.navFeatures'), to: '/features' },
    ...(variant === 'home' ? [{ label: t('landing.navPricing'), href: '#pricing' }] : []),
    { label: t('landing.navDocs'), to: '/docs' },
    { label: t('landing.navAbout'), to: '/about' },
    { label: t('landing.navContact'), to: '/contact' },
    ...(variant === 'home' ? [{ label: t('landing.navFaq'), href: '#faq' }] : []),
  ];

  // A subpage isn't transparent at the top — only the home hero needs that.
  const solid = scrolled || variant !== 'home';

  const linkClass = (active: boolean) =>
    `px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
      active ? 'text-slate-900 bg-slate-100/80' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
    }`;

  return (
    <nav className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? 'bg-white/80 backdrop-blur-xl border-b border-slate-200/70' : 'bg-transparent border-b border-transparent'}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/icons/logo.png" alt="SabakHub" className="h-8 w-8 rounded-lg" />
          <span className="font-semibold text-lg tracking-tight">SabakHub</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {items.map((item) =>
            item.to ? (
              <Link key={item.to} to={item.to} className={linkClass(pathname === item.to)}>{item.label}</Link>
            ) : (
              <a key={item.href} href={item.href} className={linkClass(false)}>{item.label}</a>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <Link to="/dashboard" className="hidden sm:inline-flex items-center text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors">{t('nav.dashboard') || 'Dashboard'}</Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 transition-colors">{t('auth.login')}</Link>
              <Link to="/register" className="hidden sm:inline-flex items-center text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors">{t('landing.heroCta')}</Link>
            </>
          )}
          <button onClick={() => setOpen(!open)} className="md:hidden p-2 -mr-2 text-slate-700" aria-label="Menu">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-slate-200 px-6 py-4 space-y-1">
          {items.map((item) =>
            item.to ? (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="block text-sm font-medium text-slate-600 py-2.5">{item.label}</Link>
            ) : (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="block text-sm font-medium text-slate-600 py-2.5">{item.label}</a>
            ),
          )}
          <div className="flex gap-3 pt-3">
            {user ? (
              <Link to="/dashboard" onClick={() => setOpen(false)} className="flex-1 text-center text-sm font-semibold text-white bg-slate-900 rounded-lg py-2.5">{t('nav.dashboard') || 'Dashboard'}</Link>
            ) : (
              <>
                <Link to="/login" onClick={() => setOpen(false)} className="flex-1 text-center text-sm font-medium text-slate-700 border border-slate-200 rounded-lg py-2.5">{t('auth.login')}</Link>
                <Link to="/register" onClick={() => setOpen(false)} className="flex-1 text-center text-sm font-semibold text-white bg-slate-900 rounded-lg py-2.5">{t('landing.heroCta')}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

/** Consistent page header for subpages: fading grid backdrop + centered heading. */
export const PageHero: React.FC<{ eyebrow?: string; title: string; subtitle?: string }> = ({ eyebrow, title, subtitle }) => (
  <section className="relative overflow-hidden px-6 pt-36 pb-14 sm:pt-40 sm:pb-16">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#e2e8f01a_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01a_1px,transparent_1px)] bg-[size:56px_56px]"
      style={{ WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000 55%, transparent 100%)', maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000 55%, transparent 100%)' }}
    />
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-primary-200/30 blur-[120px]" />
    <SectionHead eyebrow={eyebrow} title={title} subtitle={subtitle} />
  </section>
);

/** Shared dark call-to-action band used across the public pages. */
export const LandingCTA: React.FC<{ title?: string; subtitle?: string }> = ({ title, subtitle }) => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  return (
    <section className="px-6 py-20">
      <div className="relative max-w-5xl mx-auto overflow-hidden rounded-3xl bg-slate-900 px-8 py-16 sm:px-16 sm:py-20 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.35),transparent_60%)]" />
        <div className="relative">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">{title || t('landing.ctaTitle')}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">{subtitle || t('landing.ctaSubtitle')}</p>
          <Link to={user ? '/dashboard' : '/register'} className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-100">
            {user ? (t('nav.dashboard') || 'Dashboard') : t('landing.ctaButton')}
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export type LegalSection = { id: string; heading: string; body: string[] };

/** Reusable layout for legal pages (privacy, terms): sticky TOC + numbered sections. */
export const LegalLayout: React.FC<{
  eyebrow: string;
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
}> = ({ eyebrow, title, updated, intro, sections }) => (
  <div className="min-h-screen bg-white text-slate-900 antialiased">
    <LandingNav />
    <main className="px-6 pt-32 pb-16">
      <div className="max-w-5xl mx-auto">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-3 text-sm text-slate-400">{updated}</p>
        {intro && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">{intro}</p>}

        <div className="mt-12 grid gap-12 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1">
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">{s.heading}</a>
              ))}
            </nav>
          </aside>

          <div className="max-w-2xl space-y-10">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="flex items-baseline gap-3 text-xl font-semibold text-slate-900">
                  <span className="text-sm font-semibold text-primary-600">{String(i + 1).padStart(2, '0')}</span>
                  {s.heading}
                </h2>
                <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-slate-600">
                  {s.body.map((p, j) => <p key={j}>{p}</p>)}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
    <LandingFooter />
  </div>
);

export const LandingFooter: React.FC = () => {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-slate-200 bg-white px-6 pt-16 pb-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <img src="/icons/logo.png" alt="SabakHub" className="h-8 w-8 rounded-lg" />
              <span className="font-semibold text-lg tracking-tight">SabakHub</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">{t('landing.footerDesc')}</p>
            <div className="mt-5 flex gap-2.5">
              <a href="https://t.me/sabakhub_bot" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600">
                <MessageCircle className="w-4 h-4" />
              </a>
              <a href="mailto:hello@sabakhub.kg" aria-label="Email" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600">
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{t('landing.footerProduct')}</h4>
            <ul className="mt-4 space-y-3">
              <li><Link to="/features" className="text-sm text-slate-500 transition-colors hover:text-slate-900">{t('landing.navFeatures')}</Link></li>
              <li><Link to="/#pricing" className="text-sm text-slate-500 transition-colors hover:text-slate-900">{t('landing.navPricing')}</Link></li>
              <li><Link to="/docs" className="text-sm text-slate-500 transition-colors hover:text-slate-900">{t('landing.navDocs')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{t('landing.footerCompany')}</h4>
            <ul className="mt-4 space-y-3">
              <li><Link to="/about" className="text-sm text-slate-500 transition-colors hover:text-slate-900">{t('landing.footerAbout')}</Link></li>
              <li><Link to="/contact" className="text-sm text-slate-500 transition-colors hover:text-slate-900">{t('landing.footerContactLink')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{t('landing.footerResources')}</h4>
            <ul className="mt-4 space-y-3">
              <li><Link to="/docs" className="text-sm text-slate-500 transition-colors hover:text-slate-900">{t('landing.navDocs')}</Link></li>
              <li><Link to="/vibecoder" className="text-sm text-slate-500 transition-colors hover:text-slate-900">{t('landing.footerVibecoder')}</Link></li>
              <li><Link to="/about" className="text-sm text-slate-500 transition-colors hover:text-slate-900">{t('landing.footerAbout')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{t('landing.footerContact')}</h4>
            <ul className="mt-4 space-y-3">
              <li className="flex items-center gap-2 text-sm text-slate-500"><Mail className="w-4 h-4 shrink-0 text-slate-400" /> hello@sabakhub.kg</li>
              <li className="flex items-center gap-2 text-sm text-slate-500"><Phone className="w-4 h-4 shrink-0 text-slate-400" /> +996 550 308 078</li>
              <li className="flex items-center gap-2 text-sm text-slate-500"><MapPin className="w-4 h-4 shrink-0 text-slate-400" /> {t('landing.footerCity')}</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-5 border-t border-slate-200 pt-6 md:flex-row">
          <p className="text-sm text-slate-400">&copy; {new Date().getFullYear()} SabakHub. {t('landing.rights')}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link to="/privacy" className="text-sm text-slate-400 transition-colors hover:text-slate-900">{t('landing.footerPrivacy')}</Link>
            <Link to="/terms" className="text-sm text-slate-400 transition-colors hover:text-slate-900">{t('landing.footerTerms')}</Link>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
};
