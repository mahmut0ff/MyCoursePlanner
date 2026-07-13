import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signIn } from '../../services/auth.service';
import { useAuth } from '../../contexts/AuthContext';
import { apiResolveUsername } from '../../lib/api';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

/* ──────────────────────────────────────────────────────────────
   Login — warm editorial "paper/ink" surface, matching the
   SabakHub landing (Unbounded + Golos Text, paper/ink/amber),
   deliberately distinct from the cool slate of the app itself.
   ────────────────────────────────────────────────────────────── */

const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-paper';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { firebaseUser, loading: authLoading } = useAuth();

  React.useEffect(() => {
    // Prevent auto-redirect if we are actively submitting the login form (loading=true)
    if (!authLoading && firebaseUser && !loading) {
      // Always go to dashboard — ProtectedRoute handles incomplete profiles
      navigate('/dashboard');
    }
  }, [firebaseUser, authLoading, navigate, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identity || !password) { setError(t('auth.fillAllFields', 'Пожалуйста, заполните все поля')); return; }
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
      await signIn(loginEmail, password);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.message === 'User not found') setError(t('auth.userNotFound', 'Пользователь с таким никнеймом не найден'));
      else setError(err.message?.includes('invalid') ? t('auth.invalidCreds', 'Неверные данные для входа') : t('auth.loginFailed', 'Ошибка входа'));
    } finally {
      setLoading(false);
    }
  };

  // Split the marketing title so the last word carries the landing's amber
  // highlight mark — the signature move from the hero headline.
  const titleWords = t('auth.loginTitle', 'Обучение начинается здесь').split(' ');
  const titleLast = titleWords.length > 1 ? titleWords.pop() : '';
  const titleHead = titleWords.join(' ');

  const inputBase =
    'w-full rounded-2xl border-[1.5px] border-ink/15 bg-white py-3.5 pl-11 pr-4 text-[15px] text-ink placeholder:text-ink/60 transition-colors focus:border-primary-600 focus:outline-none focus:ring-4 focus:ring-primary-600/10';

  return (
    <div className="flex min-h-screen bg-paper font-marketing text-ink antialiased selection:bg-primary-600 selection:text-white">
      {/* ═══ Left — ink editorial panel ═══ */}
      <aside className="relative hidden w-[55%] flex-col justify-between overflow-hidden bg-ink px-14 py-12 text-paper lg:flex xl:px-16">
        {/* soft brand glows, echoing the landing CTA band */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-primary-600/25 blur-[10px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-[300px] w-[300px] rounded-full bg-amber-500/15" />

        {/* wordmark */}
        <div className="relative hero-rise">
          <a href="/" className={`inline-flex items-center gap-3 rounded-lg ${focusRing} focus-visible:ring-offset-ink`}>
            <img src="/icons/logo.png" alt="SabakHub" className="h-9 w-9 rounded-[9px]" />
            <span className="font-marketing-display text-lg font-semibold">SabakHub</span>
          </a>
        </div>

        {/* headline + decorative roster card */}
        <div className="relative">
          <h1
            className="hero-rise max-w-[15ch] text-balance font-marketing-display text-[clamp(32px,3.4vw,52px)] font-bold leading-[1.1] tracking-[-0.01em]"
            style={{ animationDelay: '0.06s' }}
          >
            {titleHead}{titleLast ? ' ' : ''}
            {titleLast && <span className="shadow-[inset_0_-0.3em_0_rgba(245,158,11,0.55)]">{titleLast}</span>}
          </h1>
          <p className="hero-rise mt-6 max-w-[42ch] text-[17px] leading-[1.6] text-paper/70" style={{ animationDelay: '0.12s' }}>
            {t('auth.registerSubtitle', 'Откройте для себя новые знания')}
          </p>

          <LoginVisual />
        </div>

        {/* footer note */}
        <p className="hero-rise relative text-sm text-paper/55" style={{ animationDelay: '0.24s' }}>
          © {new Date().getFullYear()} SabakHub · {t('landing.footerCity', 'Бишкек, Кыргызстан')}
        </p>
      </aside>

      {/* ═══ Right — form ═══ */}
      <main className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="absolute right-5 top-5">
          <LanguageSwitcher compact />
        </div>

        <div className="hero-rise w-full max-w-[400px]">
          {/* logo (mobile) */}
          <a href="/" className={`mb-8 inline-flex items-center gap-2.5 rounded-lg lg:hidden ${focusRing}`}>
            <img src="/icons/logo.png" alt="SabakHub" className="h-9 w-9 rounded-[9px]" />
            <span className="font-marketing-display text-lg font-semibold">SabakHub</span>
          </a>

          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-primary-600">
            {t('auth.loginEyebrow', 'Вход')}
          </p>
          <h2 className="mt-2.5 font-marketing-display text-[clamp(26px,3vw,34px)] font-bold leading-[1.12] tracking-[-0.01em]">
            {t('auth.welcomeBack', 'С возвращением')}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink/65">
            {t('auth.loginSubtitle', 'Войдите в свой аккаунт SabakHub')}
          </p>

          {error && (
            <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="login-identity" className="mb-1.5 block text-[13px] font-semibold text-ink/70">
                {t('auth.emailOrUsername', 'Email или Никнейм')}
              </label>
              <div className="relative">
                <Mail aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink/40" />
                <input
                  id="login-identity"
                  type="text"
                  autoComplete="username"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  className={inputBase}
                  placeholder="aibek@example.kg · aibek_t"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="login-password" className="block text-[13px] font-semibold text-ink/70">
                  {t('auth.password', 'Пароль')}
                </label>
                <a href="#" className={`rounded text-[13px] font-medium text-primary-600 transition-colors hover:text-primary-700 ${focusRing}`}>
                  {t('auth.forgotPassword', 'Забыли пароль?')}
                </a>
              </div>
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
                  aria-label={showPassword ? t('auth.hidePassword', 'Скрыть пароль') : t('auth.showPassword', 'Показать пароль')}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink/40 transition-colors hover:text-ink ${focusRing}`}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/70">
              <input type="checkbox" className="h-4 w-4 rounded border-ink/25 text-primary-600 accent-primary-600 focus:ring-primary-500" />
              {t('auth.rememberMe', 'Запомнить меня')}
            </label>

            <button
              type="submit"
              disabled={loading}
              className={`group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 py-4 text-[16px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(79,70,229,0.45)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-8px_rgba(79,70,229,0.55)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${focusRing}`}
            >
              {loading ? t('auth.signingIn', 'Вход...') : (
                <>
                  {t('auth.login', 'Войти')}
                  <ArrowRight aria-hidden className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-[13px] leading-relaxed text-ink/60">
            {t('auth.provisionedAccountHint', 'Доступ к платформе выдаёт администратор вашего учебного центра.')}
          </p>
        </div>
      </main>
    </div>
  );
};

/* ── Decorative roster card cluster (fabricated data; mirrors the landing hero) ── */
const LoginVisual: React.FC = () => {
  const { t } = useTranslation();
  const students = [
    { init: t('home.visInit1', 'А'), name: t('home.visStudent1', 'Айсулуу Б.'), grade: '5', tone: 'bg-primary-50 text-primary-600' },
    { init: t('home.visInit2', 'Н'), name: t('home.visStudent2', 'Нурлан К.'), grade: '4', tone: 'bg-amber-100 text-amber-700' },
    { init: t('home.visInit3', 'Э'), name: t('home.visStudent3', 'Эмир Т.'), grade: null, tone: 'bg-violet-100 text-violet-600' },
  ];
  return (
    <div aria-hidden className="hero-rise pointer-events-none relative mt-12 hidden h-[168px] max-w-[420px] select-none xl:block" style={{ animationDelay: '0.18s' }}>
      {/* roster card */}
      <div className="absolute left-0 right-8 top-0 -rotate-[1.5deg] rounded-3xl bg-white p-6 text-ink shadow-[0_30px_60px_-24px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold">{t('home.visGroupTitle', 'Английский · B1')}</span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {t('home.visLessonLive', 'Урок идёт')}
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {students.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className={`flex h-[32px] w-[32px] items-center justify-center rounded-full text-[13px] font-bold ${s.tone}`}>
                {s.init}
              </span>
              <span className="flex-1 text-sm">{s.name}</span>
              {s.grade
                ? <span className="text-[13px] font-bold text-emerald-600">{s.grade}</span>
                : <span className="text-[13px] text-ink/40">—</span>}
            </div>
          ))}
        </div>
      </div>
      {/* amber sticker */}
      <div className="absolute -right-1 bottom-1 rotate-[4deg] rounded-[18px] bg-amber-500 px-5 py-3 text-ink shadow-[0_16px_32px_-14px_rgba(245,158,11,0.7)]">
        <p className="font-marketing-display text-[20px] font-bold leading-none">{t('home.visStickerNum', '+38%')}</p>
        <p className="mt-1 text-[12px] font-medium">{t('home.visStickerText', 'посещаемость')}</p>
      </div>
    </div>
  );
};

export default LoginPage;
