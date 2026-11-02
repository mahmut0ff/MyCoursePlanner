import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signIn } from '../../services/auth.service';
import { useAuth } from '../../contexts/AuthContext';
import { apiResolveUsername } from '../../lib/api';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { Logo, ThemeToggle, focusRing } from '../../components/landing/LandingKit';
import { HeroChat } from '../../components/landing/HomeScenes';

/* ──────────────────────────────────────────────────────────────
   Login — the landing and the app shell share one look (Inter,
   slate neutrals, violet primary, flat bordered surfaces), so the
   step from the site into the product doesn't change worlds.
   ────────────────────────────────────────────────────────────── */

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

  // Filled fields: the tint marks the field, a ring appears only on focus — no resting outline.
  const inputBase =
    'h-11 w-full rounded-lg border border-transparent bg-slate-100 pl-9 pr-3 text-[14px] text-slate-900 placeholder:text-slate-500 transition-colors hover:bg-slate-200/70 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/25 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:hover:bg-slate-700/70 dark:focus:bg-slate-900';
  const submitCls = `group inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary-600 text-[14px] font-medium text-white transition-colors hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
  const linkBtn = `rounded text-[13px] font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 ${focusRing}`;
  const labelCls = 'block text-[13px] font-medium text-slate-700 dark:text-slate-300';

  const identityField = (
    <div>
      <label htmlFor="login-identity" className={`mb-1.5 ${labelCls}`}>
        {t('auth.emailOrUsername')}
      </label>
      <div className="relative">
        <Mail aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
    <div className="flex min-h-screen bg-white text-slate-900 antialiased selection:bg-primary-600 selection:text-white dark:bg-slate-900 dark:text-slate-100">
      {/* ═══ Left — brand panel, the shell's sidebar surface ═══ */}
      <aside className="relative hidden w-[52%] flex-col overflow-hidden bg-slate-50 px-12 py-10 lg:flex xl:px-16 dark:bg-slate-800/50">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 text-slate-300 dark:text-slate-700"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1.3px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(70% 60% at 70% 85%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(70% 60% at 70% 85%, black 20%, transparent 75%)',
          }}
        />
        <div className="hero-rise relative">
          <Link to="/" aria-label="SabakHub" className={`inline-flex items-center gap-2.5 rounded-md ${focusRing}`}>
            <Logo />
          </Link>
        </div>

        <div className="relative mt-16 xl:mt-20">
          <h1
            className="hero-rise max-w-[16ch] text-balance text-[clamp(30px,3vw,44px)] font-semibold leading-[1.1] tracking-[-0.03em]"
            style={{ animationDelay: '0.06s' }}
          >
            {t('auth.loginBrandLine')}
          </h1>
          <p className="hero-rise mt-4 max-w-[38ch] text-[16px] leading-[1.6] text-slate-600 dark:text-slate-400" style={{ animationDelay: '0.12s' }}>
            {t('auth.loginBrandSub')}
          </p>
        </div>

        {/* the same bot chat as the landing hero, rising from the panel's bottom edge */}
        <div className="hero-rise absolute -bottom-40 right-6 hidden xl:block" style={{ animationDelay: '0.2s' }}>
          <HeroChat chips={false} />
        </div>

        <p className="hero-rise relative mt-auto text-[13px] text-slate-500 dark:text-slate-400" style={{ animationDelay: '0.24s' }}>
          © {new Date().getFullYear()} SabakHub · {t('home.footerCity')}
        </p>
      </aside>

      {/* ═══ Right — form ═══ */}
      <main className="relative flex flex-1 flex-col px-4 py-4 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" aria-label="SabakHub" className={`inline-flex items-center gap-2.5 rounded-md lg:invisible ${focusRing}`}>
            <Logo />
          </Link>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <LanguageSwitcher compact />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="hero-rise w-full max-w-[360px]">
            <h2 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.02em]">
              {t('auth.loginTitle')}
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{t('auth.loginSubtitle')}</p>

            {error && (
              <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {identityField}

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className={labelCls}>
                    {t('auth.password')}
                  </label>
                  <button type="button" onClick={() => setShowForgot((v) => !v)} aria-expanded={showForgot} className={linkBtn}>
                    {t('auth.forgotPassword')}
                  </button>
                </div>
                {/* Accounts are provisioned by the center (no self sign-up) and many log in with a
                    username without a mailbox — the administrator resets the password. */}
                {showForgot && (
                  <p className="mb-2 rounded-lg bg-primary-50 px-3 py-2 text-[13px] leading-snug text-slate-700 dark:bg-primary-500/10 dark:text-slate-300">
                    {t('auth.forgotPasswordHint')}
                  </p>
                )}
                <div className="relative">
                  <Lock aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputBase} pr-10`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    aria-pressed={showPassword}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200 ${focusRing}`}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label htmlFor="login-remember" className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700 dark:text-slate-300">
                <input
                  id="login-remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 accent-primary-600 focus:ring-primary-500"
                />
                {t('auth.rememberMe')}
              </label>

              <button type="submit" disabled={loading} className={submitCls}>
                {loading ? t('auth.signingIn') : (
                  <>
                    {t('auth.login')}
                    <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{t('auth.provisionedAccountHint')}</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
