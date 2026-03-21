import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signUp, signInWithGoogle } from '../../services/auth.service';
import { createUser, getUser } from '../../services/users.service';
import { GraduationCap, Mail, Lock, User, Eye, EyeOff, Building2 } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'account' | 'org'>('account');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAccountStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name || !email || !password) { setError('Please fill in all fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setStep('org');
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!orgName.trim()) { setError('Organization name is required'); return; }
    setLoading(true);
    try {
      const cred = await signUp(email, password, name);
      const profilePromise = createUser(cred.user.uid, email, name, 'admin');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 8000)
      );
      try { await Promise.race([profilePromise, timeoutPromise]); } catch {}

      const token = await cred.user.getIdToken();
      const orgRes = await fetch('/.netlify/functions/api-organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: orgName }),
      });

      if (!orgRes.ok) {
        const err = await orgRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create organization');
      }
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.message?.includes('already')) setError('Email already in use');
      else setError(`Registration failed: ${err.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithGoogle();
      const user = cred.user;
      const existing = await getUser(user.uid);
      if (!existing) {
        await createUser(user.uid, user.email || '', user.displayName || 'User', 'student');
      }
      navigate('/dashboard');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ═══ Left Decorative Panel ═══ */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-gradient-to-br from-[#4e7cf6] via-[#5b8bf7] to-[#7ba4f9] overflow-hidden">
        {/* Abstract shapes */}
        <div className="absolute top-[-80px] right-[-60px] w-[300px] h-[300px] rounded-full bg-white/10" />
        <div className="absolute bottom-[-120px] right-[80px] w-[400px] h-[400px] rounded-full border-[3px] border-white/20" />
        <div className="absolute bottom-[-60px] right-[140px] w-[280px] h-[280px] rounded-full border-[3px] border-white/15" />
        <div className="absolute bottom-[40px] right-[60px] w-6 h-6 rounded-full bg-cyan-300/80" />
        <div className="absolute bottom-[120px] right-[320px] w-4 h-4 rounded-full bg-white/40" />

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

        {/* Geometric decorations */}
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

        <div className="absolute bottom-[200px] left-[50%] text-white/30 text-2xl font-bold">✕</div>

        {/* Main text */}
        <div className="relative z-10 flex flex-col justify-center px-16">
          <h1 className="text-5xl font-extrabold text-white leading-tight mb-4">
            Создайте<br/>свою<br/>организацию
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
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl shadow-lg shadow-primary-200 dark:shadow-primary-900/30 mb-4">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('auth.registerTitle')}</h2>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-6">
            <div className={`flex-1 h-1.5 rounded-full transition-colors ${step === 'account' ? 'bg-primary-500' : 'bg-primary-500'}`} />
            <div className={`flex-1 h-1.5 rounded-full transition-colors ${step === 'org' ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          {step === 'account' ? (
            <>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">{t('auth.step1')}</p>

              <form onSubmit={handleAccountStep} className="space-y-4">
                <div>
                  <label className="label">{t('auth.fullName')}</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input pl-11" placeholder="John Doe" />
                  </div>
                </div>
                <div>
                  <label className="label">{t('auth.email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-11" placeholder="you@example.com" />
                  </div>
                </div>
                <div>
                  <label className="label">{t('auth.password')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-11 pr-11" placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="btn-primary w-full !py-3 !rounded-xl text-base">{t('auth.continue')}</button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-4 my-5">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-sm text-slate-400">or</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              {/* Google button */}
              <button
                onClick={handleGoogleRegister}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">{t('auth.step2')}</p>

              <form onSubmit={handleFinalSubmit} className="space-y-4">
                <div>
                  <label className="label">{t('auth.orgName')}</label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="input pl-11" placeholder={t('auth.orgNamePlaceholder')} />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep('account')} className="btn-secondary flex-1 !py-3 !rounded-xl">{t('common.back')}</button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1 !py-3 !rounded-xl">
                    {loading ? t('auth.creating') : t('auth.createAccount')}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-8">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-primary-600 font-semibold hover:text-primary-700 dark:text-primary-400">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
