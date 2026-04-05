import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { createUser } from '../../services/users.service';
import { apiCheckAuthIdentity } from '../../lib/api';
import { School, BookOpenCheck, User, Building2, AtSign, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { auth } from '../../lib/firebase';

type RegRole = 'admin' | 'teacher' | 'student';

class OnboardingErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl max-w-2xl w-full border border-red-200 dark:border-red-900/30">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Критическая ошибка онбординга</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-4">UI не смог отрендериться. Пожалуйста, отправьте этот текст разработчикам:</p>
            <pre className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg overflow-auto text-[11px] text-red-500 whitespace-pre-wrap font-mono">
              {this.state.error?.stack || this.state.error?.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const OnboardingPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser, profile, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'role' | 'details' | 'org'>('role');
  const [regRole, setRegRole] = useState<RegRole>('admin');
  
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Wait for auth to finish loading before doing any redirects
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  // If there's no Firebase user, they shouldn't be here
  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  // If the profile is already fully created, redirect them
  if (profile) {
    return <Navigate to="/dashboard" replace />;
  }

  useEffect(() => {
    if (!username || username.length < 3) return setUsernameStatus('idle');
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await apiCheckAuthIdentity({ action: 'check', username });
        setUsernameStatus(res.username ? 'taken' : 'available');
      } catch { setUsernameStatus('idle'); }
    }, 500);
    return () => clearTimeout(timer);
  }, [username]);

  const handleRoleStep = (role: RegRole) => {
    setRegRole(role);
    setStep('details');
  };

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username) { setError(t('auth.fillAllFields', 'Пожалуйста, заполните все поля')); return; }
    if (usernameStatus === 'taken') { setError(t('auth.identitiesTaken', 'Указанный никнейм уже занят.')); return; }

    if (regRole === 'admin') {
      setStep('org');
    } else {
      await finalizeRegistration();
    }
  };

  const finalizeRegistration = async () => {
    setError('');
    setLoading(true);
    try {
      const email = firebaseUser.email || '';
      const name = firebaseUser.displayName || 'User';
      const role = regRole === 'teacher' ? 'teacher' : 'student';
      
      await createUser(firebaseUser.uid, email, name, role, username);
      await refreshProfile();
      navigate(role === 'teacher' ? '/teacher-profile' : '/dashboard');
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(`${t('auth.regFailed')}: ${err.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!orgName.trim()) { setError(t('auth.orgRequired')); return; }
    
    setLoading(true);
    try {
      const email = firebaseUser.email || '';
      const name = firebaseUser.displayName || 'User';
      
      await createUser(firebaseUser.uid, email, name, 'admin', username);
      
      const token = await firebaseUser.getIdToken();
      const orgRes = await fetch('/.netlify/functions/api-organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: orgName }),
      });

      if (!orgRes.ok) {
        const err = await orgRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create organization');
      }
      
      await refreshProfile();
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(`${t('auth.regFailed')}: ${err.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const leftTitle = React.useMemo(() => {
    if (regRole === 'teacher') return t('auth.teacherLeftTitle', 'Преподавай\nлучше\nс нами');
    if (regRole === 'student') return t('auth.loginTitle', 'Обучение\nначинается\nздесь');
    return t('auth.orgLeftTitle', 'Управляй\nшколой\nс умом');
  }, [regRole, t]);

  const leftSubtitle = React.useMemo(() => {
    if (regRole === 'teacher') return t('auth.teacherLeftSubtitle', 'Инструменты для успешного преподавания');
    if (regRole === 'student') return t('auth.registerSubtitle', 'Откройте для себя новые знания');
    return t('auth.orgLeftSubtitle', 'Полный контроль над вашей организацией');
  }, [regRole, t]);

  const totalSteps = 3;
  const currentStep = step === 'role' ? 1 : step === 'details' ? 2 : 3;

  return (
    <OnboardingErrorBoundary>
      <div className="min-h-screen flex">
      {/* ═══ Left Decorative Panel ═══ */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-primary-600 overflow-hidden">
        <div className="absolute top-[-80px] right-[-60px] w-[300px] h-[300px] rounded-full bg-white/10" />
        <div className="absolute bottom-[-120px] right-[80px] w-[400px] h-[400px] rounded-full border-[3px] border-white/20" />
        <div className="absolute top-[80px] left-[40px] grid grid-cols-6 gap-1.5">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-white/25" />
          ))}
        </div>
        <div className="absolute bottom-[200px] left-[50%] text-white/30 text-2xl font-bold">✕</div>
        <div className="relative z-10 flex flex-col justify-center px-16">
          <h1 className="text-5xl font-extrabold text-white leading-tight mb-4">
            {typeof leftTitle === 'string' ? leftTitle.split('\n').map((line, i) => (
              <React.Fragment key={i}>{line}<br/></React.Fragment>
            )) : leftTitle}
          </h1>
          <p className="text-white/70 text-lg max-w-sm">{leftSubtitle}</p>
        </div>
      </div>

      {/* ═══ Right Form Panel ═══ */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 bg-white dark:bg-slate-900 relative">
        {/* Mobile-only branded strip */}
        <div className="lg:hidden w-full max-w-md mb-6 -mt-2">
          <div className="bg-gradient-to-r from-primary-500 to-violet-500 rounded-2xl p-5 text-center text-white">
            <div className="text-3xl mb-2">🎓</div>
            <h2 className="text-lg font-extrabold">{t('auth.welcomeTitle', 'Добро пожаловать!')}</h2>
            <p className="text-white/70 text-xs mt-1">{t('auth.welcomeSubtitle', 'Настроим ваш профиль за минуту')}</p>
          </div>
        </div>

        <div className="absolute top-4 right-4 flex gap-4 items-center">
            <LanguageSwitcher />
        </div>

        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex flex-col items-center">
              <img src="/icons/logo.png" alt="Planula" className="h-14 w-auto object-contain mb-4" />
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold overflow-hidden">
                    {firebaseUser?.photoURL ? 
                      <img src={firebaseUser.photoURL} alt="Avatar" className="w-full h-full object-cover" /> : 
                      (firebaseUser?.displayName ? firebaseUser.displayName.charAt(0).toUpperCase() : 'U')
                    }
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">{firebaseUser?.displayName}</p>
                  <p className="text-xs text-slate-500">{firebaseUser?.email}</p>
                </div>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('auth.completeProfile', 'Завершите профиль')}</h2>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-6">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i < currentStep ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
            ))}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          {/* ═══ Step: Role Selection ═══ */}
          {step === 'role' && (
            <>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 text-center">{t('auth.chooseRole', 'Выберите тип аккаунта')}</p>
              <div className="space-y-3">
                <button
                  onClick={() => handleRoleStep('admin')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-primary-500 dark:hover:border-primary-500 bg-white dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group"
                >
                  <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary-200/50 dark:shadow-primary-900/30">
                    <School className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{t('auth.roleOrgAdmin', 'Создаю организацию')}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('auth.roleOrgAdminDesc', 'Создайте школу или учебный центр')}</p>
                  </div>
                </button>

                <button
                  onClick={() => handleRoleStep('teacher')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-500 dark:hover:border-violet-500 bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-all group"
                >
                  <div className="w-12 h-12 bg-violet-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-violet-200/50 dark:shadow-violet-900/30">
                    <BookOpenCheck className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{t('auth.roleTeacher', 'Я преподаватель')}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('auth.roleTeacherDesc', 'Создайте профиль и присоединяйтесь к организациям')}</p>
                  </div>
                </button>

                <button
                  onClick={() => handleRoleStep('student')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all group"
                >
                  <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{t('membership.student', 'Студент')}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('dashboard.studentDesc', 'Начни учиться прямо сейчас')}</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* ═══ Step: Details ═══ */}
          {step === 'details' && (
            <>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">{t('auth.chooseNickname', 'Придумайте уникальный никнейм')}</p>
              <form onSubmit={handleDetailsSubmit} className="space-y-4">
                <div>
                  <label className="label">{t('auth.username', 'Никнейм')}</label>
                  <div className="relative">
                    <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} className="input pl-11 pr-11" placeholder="john_doe" />
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                      {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                      {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {usernameStatus === 'taken' && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                  </div>
                  {usernameStatus === 'taken' && <p className="text-xs text-red-500 mt-1">{t('auth.usernameTaken', 'Этот никнейм уже занят')}</p>}
                </div>
                
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setStep('role')} className="btn-secondary flex-1 !py-3 !rounded-xl">{t('common.back')}</button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1 !py-3 !rounded-xl">
                    {loading && (regRole === 'teacher' || regRole === 'student') ? t('auth.creating', 'Создание...') : t('auth.continue', 'Продолжить')}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ═══ Step: Organization ═══ */}
          {step === 'org' && (
            <>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">{t('auth.step2', 'Детали организации')}</p>
              <form onSubmit={handleOrgSubmit} className="space-y-4">
                <div>
                  <label className="label">{t('auth.orgName', 'Название организации')}</label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="input pl-11" placeholder={t('auth.orgNamePlaceholder', 'My Academy')} />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep('details')} className="btn-secondary flex-1 !py-3 !rounded-xl">{t('common.back', 'Назад')}</button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1 !py-3 !rounded-xl">
                    {loading ? t('auth.creating', 'Создание...') : t('auth.createAccount', 'Создать аккаунт')}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-8">
            <button onClick={handleSignOut} className="text-primary-600 font-semibold hover:text-primary-700 dark:text-primary-400">
              {t('auth.useDifferentAccount', 'Войти под другим аккаунтом')}
            </button>
          </p>
        </div>
      </div>
    </div>
    </OnboardingErrorBoundary>
  );
};

export default OnboardingPage;
