import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signUp } from '../../services/auth.service';
import { createUser } from '../../services/users.service';
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 flex items-center justify-center p-4">
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-4">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">{t('app.name')}</h1>
          <p className="text-primary-200 mt-1">{t('auth.registerSubtitle')}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Progress */}
          <div className="flex items-center gap-3 mb-6">
            <div className={`flex-1 h-1 rounded ${step === 'account' ? 'bg-primary-500' : 'bg-primary-500'}`} />
            <div className={`flex-1 h-1 rounded ${step === 'org' ? 'bg-primary-500' : 'bg-slate-200'}`} />
          </div>

          {step === 'account' ? (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">{t('auth.registerTitle')}</h2>
              <p className="text-slate-500 text-sm mb-6">{t('auth.step1')}</p>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

              <form onSubmit={handleAccountStep} className="space-y-4">
                <div>
                  <label className="label">{t('auth.fullName')}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input pl-10" placeholder="John Doe" />
                  </div>
                </div>
                <div>
                  <label className="label">{t('auth.email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-10" placeholder="you@example.com" />
                  </div>
                </div>
                <div>
                  <label className="label">{t('auth.password')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-10 pr-10" placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="btn-primary w-full">{t('auth.continue')}</button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">{t('auth.orgName')}</h2>
              <p className="text-slate-500 text-sm mb-6">{t('auth.step2')}</p>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

              <form onSubmit={handleFinalSubmit} className="space-y-4">
                <div>
                  <label className="label">{t('auth.orgName')}</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="input pl-10" placeholder={t('auth.orgNamePlaceholder')} />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep('account')} className="btn-secondary flex-1">{t('common.back')}</button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? t('auth.creating') : t('auth.createAccount')}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="text-center text-sm text-slate-500 mt-6">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">{t('auth.login')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
