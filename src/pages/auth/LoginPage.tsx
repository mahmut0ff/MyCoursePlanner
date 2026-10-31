import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signIn } from '../../services/auth.service';
import { useAuth } from '../../contexts/AuthContext';
import { apiResolveUsername } from '../../lib/api';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { Logo, ProductMock, ThemeToggle, focusRing } from '../../components/landing/LandingKit';

/* ──────────────────────────────────────────────────────────────
   Login — warm editorial "paper/ink" surface, matching the
   SabakHub landing (Unbounded + Golos Text, paper/ink/amber),
   deliberately distinct from the cool slate of the app itself.
   ────────────────────────────────────────────────────────────── */

const focusRingNight =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-night';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();
  const { firebaseUser, loading: authLoading } = useAuth();

  React.useEffect(() => {
    // Prevent auto-redirect if we are actively submitting the login form (loading=true)
    if (!authLoading && firebaseUser && !loading) {
      // Always go to dashboard — ProtectedRoute handles incomplete profiles
      navigate('/dashboard');
    }
  }, [firebaseUser, authLoading, navigate, loading]);

  const authError = (err: any): string => {
    const code: string = err?.code || '';
    if (err?.message === 'User not found') return t('auth.userNotFound');
    if (code === 'auth/too-many-requests') return t('auth.tooManyAttempts');
    if (code === 'auth/user-disabled') return t('auth.userDisabled');
    if (code === 'auth/network-request-failed') return t('auth.networkError');
    if (/invalid|wrong-password|user-not-found/.test(code) || err?.message?.includes('invalid')) return t('auth.invalidCreds');
    return t('auth.loginFailed');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identity || !password) { setError(t('auth.fillAllFields')); return; }
    setLoading(true);
    try {
      let loginEmail = identity;
      if (!identity.includes('@')) {
        try {
          const res = await apiResolveUsername(identity);
          loginEmail = res.email;
        } catch {
          throw new Error('User not found');
        }
      }
      await signIn(loginEmail, password, remember);
      navigate('/dashboard');
    } catch (err: any) {
      setError(authError(err));
    } finally {
      setLoading(false);
    }
  };

  // Split the brand line so the last word carries the landing's amber
  // highlight mark — the signature move from the hero headline. The left
  // panel is a brand statement; the greeting lives on the form column so it
  // stays visible on mobile (where this panel is hidden).
  const titleWords = t('auth.loginBrandLine').split(' ');
  const titleLast = titleWords.length > 1 ? titleWords.pop() : '';
  const titleHead = titleWords.join(' ');

  const inputBase =
    'w-full rounded-2xl border-[1.5px] border-ink/15 bg-card py-3.5 pl-11 pr-4 text-[15px] text-ink placeholder:text-ink/45 transition-colors focus:border-primary-600 focus:outline-none focus:ring-4 focus:ring-primary-600/10';
  const submitCls = `group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 py-4 text-[16px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(79,70,229,0.45)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-8px_rgba(79,70,229,0.55)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${focusRing}`;
  const linkBtn = `rounded text-[13px] font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 ${focusRing}`;

  const identityField = (
    <div>
      <label htmlFor="login-identity" className="mb-1.5 block text-[13px] font-semibold text-ink/70">
        {t('auth.emailOrUsername')}
      </label>
      <div className="relative">
        <Mail aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink/40" />
        <input
          id="login-identity"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identity}
          onChange={(e) => setIdentity(e.target.value.toLowerCase().replace(/\s/g, ''))}
          className={inputBase}
          placeholder="aibek@example.kg · aibek_t"
        />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-paper font-marketing text-ink antialiased selection:bg-primary-600 selection:text-white">
      {/* ═══ Left — night editorial panel ═══ */}
      <aside className="relative hidden w-[52%] flex-col justify-between overflow-hidden bg-night px-14 py-12 text-cream lg:flex xl:px-16">
        {/* soft brand glows, echoing the landing CTA band */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-primary-600/25 blur-[10px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-[300px] w-[300px] rounded-full bg-amber-500/15" />

        <div className="relative hero-rise">
          <Link to="/" aria-label="SabakHub" className={`inline-flex items-center gap-3 rounded-lg ${focusRingNight}`}>
            <Logo />
          </Link>
        </div>

        <div className="relative">
          <h1
            className="hero-rise max-w-[15ch] text-balance font-marketing-display text-[clamp(32px,3.2vw,50px)] font-bold leading-[1.1] tracking-[-0.01em]"
            style={{ animationDelay: '0.06s' }}
          >
            {titleHead}{titleLast ? ' ' : ''}
            {titleLast && <span className="shadow-[inset_0_-0.3em_0_rgba(245,158,11,0.55)]">{titleLast}</span>}
          </h1>
          <p className="hero-rise mt-6 max-w-[42ch] text-[17px] leading-[1.6] text-cream/70" style={{ animationDelay: '0.12s' }}>
            {t('auth.loginBrandSub')}
          </p>
          {/* decorative product preview — the same screen the landing hero shows */}
          <div aria-hidden className="hero-rise pointer-events-none mt-12 hidden max-w-[440px] -rotate-[1.5deg] select-none xl:block" style={{ animationDelay: '0.18s' }}>
            <ProductMock compact />
          </div>
        </div>

        <p className="hero-rise relative text-sm text-cream/55" style={{ animationDelay: '0.24s' }}>
          © {new Date().getFullYear()} SabakHub · {t('home.footerCity')}
        </p>
      </aside>

      {/* ═══ Right — form ═══ */}
      <main className="relative flex flex-1 flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" aria-label="SabakHub" className={`inline-flex items-center gap-2.5 rounded-lg lg:invisible ${focusRing}`}>
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageSwitcher compact />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="hero-rise w-full max-w-[400px]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-primary-600 dark:text-primary-400">
              {t('auth.loginEyebrow')}
            </p>
            <h2 className="mt-2.5 font-marketing-display text-[clamp(26px,3vw,34px)] font-bold leading-[1.12] tracking-[-0.01em]">
              {t('auth.loginTitle')}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink/65">{t('auth.loginSubtitle')}</p>

            {error && (
              <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
              {identityField}

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="block text-[13px] font-semibold text-ink/70">
                    {t('auth.password')}
                  </label>
                  <button type="button" onClick={() => setShowForgot((v) => !v)} aria-expanded={showForgot} className={linkBtn}>
                    {t('auth.forgotPassword')}
                  </button>
                </div>
                {/* Accounts are provisioned by the center (no self sign-up) and many log in with a
                    username without a mailbox — the administrator resets the password. */}
                {showForgot && (
                  <p className="mb-2 rounded-xl bg-primary-600/5 px-3 py-2 text-[13px] leading-snug text-ink/70">
                    {t('auth.forgotPasswordHint')}
                  </p>
                )}
                <div className="relative">
                  <Lock aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink/40" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputBase} pr-12`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    aria-pressed={showPassword}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink/40 transition-colors hover:text-ink ${focusRing}`}
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              <label htmlFor="login-remember" className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/70">
                <input
                  id="login-remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-ink/25 text-primary-600 accent-primary-600 focus:ring-primary-500"
                />
                {t('auth.rememberMe')}
              </label>

              <button type="submit" disabled={loading} className={submitCls}>
                {loading ? t('auth.signingIn') : (
                  <>
                    {t('auth.login')}
                    <ArrowRight aria-hidden className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-[13px] leading-relaxed text-ink/60">{t('auth.provisionedAccountHint')}</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
