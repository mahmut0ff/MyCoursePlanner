import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { Radio, LogIn, ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { findSessionByCode, joinLiveSession } from '../../services/live-session.service';

const JoinLiveLessonPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== 6) {
      setError(t('live.invalidCode'));
      return;
    }
    if (!user) return;

    setLoading(true);
    setError('');
    try {
      const session = await findSessionByCode(cleaned);
      if (!session) {
        setError(t('live.sessionNotFound'));
        setLoading(false);
        return;
      }
      await joinLiveSession(session.id, user.uid, user.displayName || 'Student', user.photoURL || '');
      toast.success(t('live.joined'));
      // Navigate to lesson with the live session active
      navigate(`/lessons/${session.lessonId}`);
    } catch (err: any) {
      setError(err.message || 'Error');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </button>

        {/* Main card */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-3xl shadow-2xl shadow-violet-500/10 border border-slate-200 dark:border-slate-700">
          {/* Gradient header */}
          <div className="relative bg-gradient-to-br from-[#46178F] via-[#5C1FB5] to-indigo-600 p-8 text-center overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
            
            <div className="relative z-10">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm shadow-lg">
                <Radio className="w-8 h-8 text-white" />
              </div>
              <h1 className="kahoot-font text-2xl font-extrabold text-white mb-1">{t('live.joinLesson')}</h1>
              <p className="text-white/70 text-sm font-medium">{t('live.enterCode')}</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleJoin} className="p-6 sm:p-8 space-y-5">
            <div className="relative">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder={t('live.codePlaceholder')}
                maxLength={6}
                className="w-full text-center text-4xl font-mono font-black tracking-[0.6em] px-4 py-5 bg-slate-50 dark:bg-slate-700/50 border-2 border-slate-200 dark:border-slate-600 rounded-2xl focus:border-violet-500 dark:focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-500 placeholder:text-lg placeholder:tracking-normal placeholder:font-normal"
                autoFocus
              />
              {code.length === 6 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Sparkles className="w-5 h-5 text-violet-500 animate-pulse" />
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400 text-center font-semibold bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-xl">{error}</p>
            )}

            <button
              type="submit"
              disabled={code.length !== 6 || loading}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-[#46178F] via-[#5C1FB5] to-indigo-600 text-white font-bold text-lg rounded-2xl shadow-[0_6px_0_#2c0e5a] active:translate-y-[4px] active:shadow-[0_2px_0_#2c0e5a] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:translate-y-0 transition-all kahoot-font"
            >
              {loading ? (
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  {t('live.joinLesson')}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Hint */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4 font-medium">
          {t('live.shareCode')}
        </p>
      </div>
    </div>
  );
};

export default JoinLiveLessonPage;
