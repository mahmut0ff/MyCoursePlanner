import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signIn } from '../../services/auth.service';
import { useAuth } from '../../contexts/AuthContext';
import { apiResolveUsername } from '../../lib/api';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

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

  return (
    <div className="min-h-screen flex">
      {/* ═══ Left Decorative Panel ═══ */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-primary-600 overflow-hidden">
        {/* Abstract shapes */}
        <div className="absolute top-[-80px] right-[-60px] w-[300px] h-[300px] rounded-full bg-white/10" />
        <div className="absolute bottom-[-120px] right-[80px] w-[400px] h-[400px] rounded-full border-[3px] border-white/20" />
        <div className="absolute bottom-[-60px] right-[140px] w-[280px] h-[280px] rounded-full border-[3px] border-white/15" />
        <div className="absolute bottom-[40px] right-[60px] w-6 h-6 rounded-full bg-cyan-300/80" />
        <div className="absolute bottom-[120px] right-[320px] w-4 h-4 rounded-full bg-white/40" />
        <div className="absolute top-[100px] left-[60px] w-3 h-3 rounded-full bg-white/30" />

        {/* Dots grid */}
        <div className="absolute top-[80px] left-[40px] grid grid-cols-6 gap-1.5">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-white/25" />
          ))}
        </div>
        <div className="absolute bottom-[160px] left-[80px] grid grid-cols-6 gap-1.5">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-white/20" />
          ))}
        </div>

        {/* Abstract geometric decorations */}
        <div className="absolute top-[60px] right-[180px]">
          <div className="w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-white/30" />
          </div>
        </div>
        <div className="absolute top-[80px] left-[120px]">
          <div className="flex flex-col gap-1 items-center">
            <div className="w-6 h-16 rounded-full border-2 border-white/25" />
            <div className="w-6 h-24 rounded-full border-2 border-white/25" />
            <div className="w-6 h-20 rounded-full border-2 border-white/25" />
          </div>
        </div>

        {/* Bottom X decoration */}
        <div className="absolute bottom-[200px] left-[50%] text-white/30 text-2xl font-bold">✕</div>

        {/* Main text */}
        <div className="relative z-10 flex flex-col justify-center px-16">
          <h1 className="text-5xl font-extrabold text-white leading-tight mb-4">
            {t('auth.loginTitle').split(' ').length > 2
              ? t('auth.loginTitle')
              : <>Обучение<br/>начинается<br/>здесь</>
            }
          </h1>
          <p className="text-white/70 text-lg max-w-sm">
            {t('auth.registerSubtitle')}
          </p>
        </div>
      </div>

      {/* ═══ Right Form Panel ═══ */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-white dark:bg-slate-900 relative">
        {/* Language Switcher */}
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>

        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <img src="/icons/logo.png" alt="SabakHub" className="h-14 w-auto mx-auto object-contain mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('auth.loginTitle')}</h2>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">{t('auth.emailOrUsername', 'Email или Никнейм')}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text" value={identity} onChange={(e) => setIdentity(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  className="input pl-11" placeholder="aibek@example.kg или aibek_t"
                />
              </div>
            </div>
            <div>
              <label className="label">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input pl-11 pr-11" placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-500 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                {t('auth.rememberMe')}
              </label>
              <a href="#" className="text-primary-600 hover:text-primary-700 font-medium dark:text-primary-400">
                {t('auth.forgotPassword')}
              </a>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3 !rounded-xl text-base">
              {loading ? t('auth.signingIn') : t('auth.login')}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-8">
            {t('auth.provisionedAccountHint', 'Доступ к платформе выдаёт администратор вашего учебного центра.')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
