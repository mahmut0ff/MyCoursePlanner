import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import LanguageSwitcher from '../LanguageSwitcher';
import { APP_LOGIN_URL, TELEGRAM_LINK, isPlaceholder } from './ctaLinks';
import { intlLocale } from '../../lib/locale';

/* ──────────────────────────────────────────────────────────────
   Paper/ink marketing kit shared by the home page and /features:
   nav, footer, the single call to action, scroll reveal and the
   product mock used in the hero and on /login.
   ────────────────────────────────────────────────────────────── */

export const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-paper';
export const focusRingNight =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-night';

export const eyebrowCls = 'text-sm font-semibold uppercase tracking-[0.14em] text-primary-600 dark:text-primary-400';
export const h2Cls = 'mt-[18px] text-balance font-marketing-display text-[clamp(26px,3vw,42px)] font-bold leading-[1.15]';

/* The landing has exactly one target action; every button renders through
   this so the destination can never drift apart between sections. */
export const Cta: React.FC<{ className: string; onFallback: () => void; children: React.ReactNode }> = ({
  className,
  onFallback,
  children,
}) =>
  isPlaceholder(TELEGRAM_LINK) ? (
    <button type="button" onClick={onFallback} className={className}>
      {children}
    </button>
  ) : (
    <a href={TELEGRAM_LINK} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );

export const primaryBtn = `inline-flex items-center justify-center gap-2.5 rounded-full bg-primary-600 px-8 py-4 text-[17px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(79,70,229,0.45)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-8px_rgba(79,70,229,0.55)] active:scale-[0.98] ${focusRing}`;

/** Fades a block in the first time it scrolls into view. */
export const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({
  children,
  className = '',
  delay = 0,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'hidden' | 'shown'>('idle');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Already on screen at mount (or a tall headless viewport) — never hide it.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState('hidden');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState('shown');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`${state === 'idle' ? '' : 'mkt-reveal'} ${className}`}
      data-shown={state === 'shown' ? '' : undefined}
      style={delay && state !== 'idle' ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};

export const ThemeToggle: React.FC = () => {
  const { t } = useTranslation();
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('mkt.themeToggle')}
      title={t('mkt.themeToggle')}
      className={`rounded-lg p-2 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink ${focusRing}`}
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
};

const loginTo = () => (isPlaceholder(APP_LOGIN_URL) ? '/login' : APP_LOGIN_URL);

export const Logo: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <>
    <img
      src="/icons/logo.png"
      alt=""
      className={size === 'md' ? 'h-[34px] w-[34px] rounded-[9px]' : 'h-7 w-7 rounded-[7px]'}
    />
    <span className={`font-marketing-display font-semibold ${size === 'md' ? 'text-[17px]' : 'text-[15px]'}`}>SabakHub</span>
  </>
);

export type NavAnchor = { href: string; label: string };

/** Sticky marketing nav. `anchors` are in-page (#…) or route (/…) links. */
export const MktNav: React.FC<{ anchors: NavAnchor[]; onDemo: () => void }> = ({ anchors, onDemo }) => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [open, setOpen] = useState(false);

  const NavLink: React.FC<{ a: NavAnchor; className: string }> = ({ a, className }) =>
    a.href.startsWith('/') && !a.href.includes('#') ? (
      <Link to={a.href} onClick={() => setOpen(false)} className={className}>{a.label}</Link>
    ) : (
      <a href={a.href} onClick={() => setOpen(false)} className={className}>{a.label}</a>
    );

  return (
    <nav className="sticky top-0 z-50 border-b border-ink/[0.08] bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-3 px-5 sm:px-8">
        <Link to="/" aria-label="SabakHub" className={`flex items-center gap-3 rounded-lg ${focusRing}`}>
          <Logo />
        </Link>

        <div className="hidden items-center gap-7 text-[15px] lg:flex">
          {anchors.map((a) => (
            <NavLink key={a.href} a={a} className={`whitespace-nowrap rounded-lg text-ink/65 transition-colors hover:text-ink ${focusRing}`} />
          ))}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1 sm:flex">
            <ThemeToggle />
            <LanguageSwitcher compact />
          </div>
          {user ? (
            /* The dark button is the way into the product for someone who already
               has an account — not a second call to action. */
            <Link
              to={isPlaceholder(APP_LOGIN_URL) ? '/dashboard' : APP_LOGIN_URL}
              className={`whitespace-nowrap rounded-full bg-ink px-5 py-3 text-[15px] font-semibold text-paper transition-transform hover:scale-[1.03] ${focusRing}`}
            >
              {t('home.navLogin')}
            </Link>
          ) : (
            <>
              <Link
                to={loginTo()}
                className={`hidden whitespace-nowrap rounded-lg px-3.5 py-2.5 text-[15px] text-ink/70 transition-colors hover:text-ink sm:block ${focusRing}`}
              >
                {t('home.navLogin')}
              </Link>
              <Cta
                onFallback={onDemo}
                className={`whitespace-nowrap rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-transform hover:scale-[1.03] sm:px-[22px] sm:py-3 sm:text-[15px] ${focusRing}`}
              >
                {t('mkt.navDemo')}
              </Cta>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={t('landing.menu')}
            className={`-mr-1 rounded-lg p-2 text-ink lg:hidden ${focusRing}`}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink/[0.08] bg-paper px-5 py-4 lg:hidden">
          {anchors.map((a) => (
            <NavLink key={a.href} a={a} className="block py-2.5 text-[15px] font-medium text-ink/70" />
          ))}
          {!user && (
            <Link to={loginTo()} onClick={() => setOpen(false)} className="block py-2.5 text-[15px] font-medium text-ink/70 sm:hidden">
              {t('home.navLogin')}
            </Link>
          )}
          <div className="flex items-center gap-2 pt-3 sm:hidden">
            <LanguageSwitcher compact />
            <ThemeToggle />
          </div>
        </div>
      )}
    </nav>
  );
};

export const MktFooter: React.FC = () => {
  const { t } = useTranslation();
  const cols = [
    {
      title: t('mkt.footerProduct'),
      links: [
        { to: '/features', label: t('landing.navFeatures') },
        { to: '/#pricing', label: t('home.navPricing') },
        { to: '/docs', label: t('landing.navDocs') },
        { to: loginTo(), label: t('home.navLogin') },
      ],
    },
    {
      title: t('mkt.footerCompany'),
      links: [
        { to: '/about', label: t('landing.navAbout') },
        { to: '/contact', label: t('landing.navContact') },
        { to: '/privacy', label: t('landing.footerPrivacy') },
        { to: '/terms', label: t('landing.footerTerms') },
      ],
    },
  ];
  const linkCls = 'text-sm text-ink/65 transition-colors hover:text-ink';
  return (
    <footer className="border-t border-ink/10 px-5 pb-10 pt-14 sm:px-8">
      <div className="mx-auto grid max-w-[1240px] gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo size="sm" />
          </div>
          <p className="mt-4 max-w-[32ch] text-sm leading-relaxed text-ink/65">{t('mkt.footerTagline')}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink/50">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.to}>
                  {l.to.startsWith('/#') ? (
                    <a href={l.to} className={linkCls}>{l.label}</a>
                  ) : (
                    <Link to={l.to} className={linkCls}>{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink/50">{t('mkt.footerContact')}</p>
          <ul className="mt-4 space-y-2.5 text-sm text-ink/65">
            <li><a href="mailto:hello@sabakhub.kg" className={linkCls}>hello@sabakhub.kg</a></li>
            <li><a href="tel:+996550308078" className={`whitespace-nowrap ${linkCls}`}>+996 550 308 078</a></li>
            <li><a href="https://t.me/sabakhub_bot" target="_blank" rel="noopener noreferrer" className={linkCls}>Telegram</a></li>
            <li>{t('home.footerCity')}</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-[1240px] flex-wrap items-center justify-between gap-4 border-t border-ink/[0.06] pt-6">
        <p className="text-sm text-ink/60">© {new Date().getFullYear()} SabakHub</p>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LanguageSwitcher compact />
        </div>
      </div>
    </footer>
  );
};

/* ── Product mock: the director's morning screen, drawn in HTML so it
   follows the language and theme (decorative, fabricated data) ── */
export const ProductMock: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { t, i18n } = useTranslation();
  const som = (n: number) => t('mkt.mockSum', { n: n.toLocaleString(intlLocale(i18n.language)) });
  const kpis = [
    { label: t('mkt.mockKpi1'), value: t('mkt.mockKpi1Value'), tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: t('home.visDirRow1Label'), value: t('home.visDirRow1Value'), tone: 'text-rose-600 dark:text-rose-400' },
    { label: t('mkt.mockKpi3'), value: '92%', tone: 'text-ink' },
  ];
  const debtors = [
    { init: t('home.visInit1'), name: t('home.visStudent1'), sum: som(4000), late: true, tone: 'bg-primary-600/10 text-primary-600 dark:text-primary-300' },
    { init: t('home.visInit2'), name: t('home.visStudent2'), sum: som(3500), late: true, tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
    { init: t('home.visInit3'), name: t('home.visStudent3'), sum: som(3000), late: false, tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' },
  ];
  const bars = [38, 52, 46, 64, 58, 72, 81];
  return (
    <div className="overflow-hidden rounded-[22px] border border-ink/10 bg-card text-ink shadow-[0_40px_80px_-32px_rgba(22,20,31,0.35)]">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-ink/[0.07] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ms-3 truncate text-xs font-medium text-ink/45">{t('home.visDirTitle')}</span>
      </div>
      <div className={compact ? 'p-5' : 'p-5 sm:p-6'}>
        <div className="grid grid-cols-3 gap-2.5">
          {kpis.map((k) => (
            <div key={k.label} className="min-w-0 rounded-2xl bg-paper px-3 py-3 sm:px-3.5">
              <p className="truncate text-[11px] text-ink/55 sm:text-xs">{k.label}</p>
              <p className={`mt-1 whitespace-nowrap font-marketing-display text-[13px] font-bold sm:text-[16px] lg:text-[clamp(12px,1.15vw,17px)] ${k.tone}`}>{k.value}</p>
            </div>
          ))}
        </div>
        {!compact && (
          <div className="mt-4 flex h-[72px] items-end gap-2 rounded-2xl bg-paper px-4 pb-3 pt-4">
            {bars.map((h, i) => (
              <span
                key={i}
                className={`flex-1 rounded-md ${i === bars.length - 1 ? 'bg-primary-600' : 'bg-primary-600/25'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        )}
        <p className="mt-5 text-[13px] font-semibold">{t('mkt.mockCallToday')}</p>
        <div className="mt-2.5 flex flex-col gap-2">
          {debtors.map((d) => (
            <div key={d.name} className="flex items-center gap-3 rounded-xl px-1 py-1">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${d.tone}`}>{d.init}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
              {d.late && (
                <span className="hidden rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 min-[420px]:inline dark:text-rose-300">
                  {t('mkt.mockLate')}
                </span>
              )}
              <span className="whitespace-nowrap text-sm font-bold">{d.sum}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
