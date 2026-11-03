import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import LanguageSwitcher from '../LanguageSwitcher';
import { APP_LOGIN_URL, TELEGRAM_LINK, isPlaceholder } from './ctaLinks';
import { GUIDE_PATH, SOLUTIONS } from './solutions';

/* ──────────────────────────────────────────────────────────────
   Marketing kit shared by the home page, /features and /login:
   nav, footer, the single call to action and scroll reveal. Built
   on the app shell's own tokens (Inter, slate neutrals, violet
   primary, radii ≤ 12px); sections are grouped by whitespace and
   tints rather than outlined boxes.
   ────────────────────────────────────────────────────────────── */

export const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';

export const h2Cls =
  'text-balance text-[clamp(24px,2.6vw,34px)] font-semibold leading-[1.18] tracking-[-0.025em]';
export const leadCls = 'text-pretty text-[16px] leading-[1.65] text-slate-600 dark:text-slate-400 sm:text-[17px]';

/* The app scrolls #root, not the window (index.css), so window scroll events never
   fire here. Page scroll is caught on document in the capture phase instead, ignoring
   inner scrollers (a horizontal tab strip, a chat feed). */
const isPageScroller = (t: EventTarget | null) =>
  !(t instanceof Element) || t === document.documentElement || t === document.body || t.id === 'root';

export const pageScrollTop = () =>
  Math.max(window.scrollY, document.documentElement.scrollTop, document.getElementById('root')?.scrollTop ?? 0);

export function subscribePageScroll(cb: () => void) {
  const onScroll = (e: Event) => { if (isPageScroller(e.target)) cb(); };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', cb);
  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', cb);
  };
}

/** True once the page has scrolled past `px`; re-renders only when that flips. */
export function useScrolledPast(px: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const read = () => setPast(pageScrollTop() > px);
    read();
    return subscribePageScroll(read);
  }, [px]);
  return past;
}

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

/* The app's .btn-primary / .btn-secondary at marketing size: same 6px corners and
   flat fill, 44px tall for touch. Hover changes the fill only. */
export const primaryBtn = `inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary-600 px-5 text-[15px] font-medium text-white transition-colors hover:bg-primary-700 active:bg-primary-800 ${focusRing}`;
export const secondaryBtn = `inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-5 text-[15px] font-medium text-slate-900 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 ${focusRing}`;

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
      className={`flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${focusRing}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

const loginTo = () => (isPlaceholder(APP_LOGIN_URL) ? '/login' : APP_LOGIN_URL);

export const Logo: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <>
    <img src="/icons/logo.png" alt="" className={size === 'md' ? 'h-7 w-7 rounded-md' : 'h-6 w-6 rounded-md'} />
    <span className={`font-semibold tracking-[-0.01em] ${size === 'md' ? 'text-[15px]' : 'text-[14px]'}`}>SabakHub</span>
  </>
);

export type NavAnchor = { href: string; label: string };

/** Sticky marketing nav, drawn like the app's topbar. `anchors` are in-page (#…) or route (/…) links. */
export const MktNav: React.FC<{ anchors: NavAnchor[]; onDemo: () => void }> = ({ anchors, onDemo }) => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [open, setOpen] = useState(false);
  // The hairline under the nav appears only once the page moves under it.
  const scrolled = useScrolledPast(4);

  const NavLink: React.FC<{ a: NavAnchor; className: string }> = ({ a, className }) =>
    a.href.startsWith('/') && !a.href.includes('#') ? (
      <Link to={a.href} onClick={() => setOpen(false)} className={className}>{a.label}</Link>
    ) : (
      <a href={a.href} onClick={() => setOpen(false)} className={className}>{a.label}</a>
    );

  const navBtn = `inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-3.5 text-[14px] font-medium transition-colors ${focusRing}`;

  return (
    <nav className={`sticky top-0 z-50 border-b bg-white transition-colors duration-300 dark:bg-slate-900 ${scrolled || open ? 'border-slate-200 dark:border-slate-700' : 'border-transparent'}`}>
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-8">
        <Link to="/" aria-label="SabakHub" className={`flex items-center gap-2.5 rounded-md ${focusRing}`}>
          <Logo />
        </Link>

        <div className="hidden flex-1 items-center gap-0.5 ps-6 lg:flex">
          {anchors.map((a) => (
            <NavLink
              key={a.href}
              a={a}
              className={`inline-flex h-8 items-center whitespace-nowrap rounded-md px-3 text-[14px] text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${focusRing}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="hidden items-center gap-0.5 border-e border-slate-200 pe-1.5 me-0.5 sm:flex dark:border-slate-700">
            <ThemeToggle />
            <LanguageSwitcher compact />
          </div>
          {user ? (
            /* The neutral button is the way into the product for someone who already
               has an account — not a second call to action. */
            <Link
              to={isPlaceholder(APP_LOGIN_URL) ? '/dashboard' : APP_LOGIN_URL}
              className={`${navBtn} bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white`}
            >
              {t('home.navLogin')}
            </Link>
          ) : (
            <>
              <Link
                to={loginTo()}
                className={`${navBtn} hidden text-slate-700 hover:bg-slate-100 sm:inline-flex dark:text-slate-300 dark:hover:bg-slate-800`}
              >
                {t('home.navLogin')}
              </Link>
              <Cta onFallback={onDemo} className={`${navBtn} bg-primary-600 text-white hover:bg-primary-700`}>
                {t('mkt.navDemo')}
              </Cta>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={t('landing.menu')}
            className={`-me-1 flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800 ${focusRing}`}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200 px-4 py-2 lg:hidden dark:border-slate-700">
          {anchors.map((a) => (
            <NavLink
              key={a.href}
              a={a}
              className="flex h-11 items-center rounded-md px-2 text-[15px] text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            />
          ))}
          {!user && (
            <Link
              to={loginTo()}
              onClick={() => setOpen(false)}
              className="flex h-11 items-center rounded-md px-2 text-[15px] text-slate-700 hover:bg-slate-100 sm:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('home.navLogin')}
            </Link>
          )}
          <div className="mt-1 flex items-center gap-1 border-t border-slate-200 pt-2 sm:hidden dark:border-slate-700">
            <LanguageSwitcher compact />
            <ThemeToggle />
          </div>
        </div>
      )}
    </nav>
  );
};

/** FAQPage structured data: search engines and AI answers read the same Q&A the page shows. */
export const FaqJsonLd: React.FC<{ items: { q: string; a: string }[] }> = ({ items }) => (
  <script
    type="application/ld+json"
    // Data block, not executed: CSP doesn't apply. `<` escaped so text can't close the tag.
    dangerouslySetInnerHTML={{
      __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      }).replace(/</g, '\\u003c'),
    }}
  />
);

export const MktFooter: React.FC = () => {
  const { t } = useTranslation();
  const cols = [
    {
      title: t('sol.common.nav'),
      links: [
        ...SOLUTIONS.map((s) => ({ to: s.path, label: t(`sol.${s.id}.nav`) })),
        { to: GUIDE_PATH, label: t('sol.common.guide') },
      ],
    },
    {
      title: t('mkt.footerProduct'),
      links: [
        { to: '/features', label: t('landing.navFeatures') },
        { to: '/#pricing', label: t('home.navPricing') },
        { to: '/docs', label: t('landing.navDocs') },
        { to: '/vibecoder', label: t('landing.footerVibecoder') },
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
  const linkCls = `rounded-sm text-[14px] text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 ${focusRing}`;
  const headCls = 'text-[13px] font-medium text-slate-900 dark:text-slate-100';
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-4 pb-8 pt-12 sm:px-8 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="mx-auto grid max-w-[1200px] gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.1fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo size="sm" />
          </div>
          <p className="mt-3 max-w-[34ch] text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{t('mkt.footerTagline')}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className={headCls}>{c.title}</p>
            <ul className="mt-3 space-y-2">
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
          <p className={headCls}>{t('mkt.footerContact')}</p>
          <ul className="mt-3 space-y-2 text-[14px] text-slate-600 dark:text-slate-400">
            <li><a href="mailto:hello@sabakhub.kg" className={linkCls}>hello@sabakhub.kg</a></li>
            <li><a href="tel:+996550308078" className={`whitespace-nowrap tabular-nums ${linkCls}`}>+996 550 308 078</a></li>
            <li><a href="https://t.me/sabakhub_bot" target="_blank" rel="noopener noreferrer" className={linkCls}>Telegram</a></li>
            <li>{t('home.footerCity')}</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-[1200px] flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5 dark:border-slate-700">
        <p className="text-[13px] text-slate-500 dark:text-slate-400">© {new Date().getFullYear()} SabakHub</p>
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <LanguageSwitcher compact />
        </div>
      </div>
    </footer>
  );
};
