import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiJoinQuizSession, apiGetQuizSessionByCode } from '../../lib/api';
import { Gamepad2, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const JoinQuizPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length < 4) { toast.error(t('quiz.invalidCode')); return; }
    setLoading(true);
    try {
      // First, look up session by code
      const session = await apiGetQuizSessionByCode(cleaned);
      // Then join the session
      await apiJoinQuizSession({ sessionId: session.id });
      toast.success(t('quiz.joined'));
      navigate(`/quiz/play/${session.id}`);
    } catch (e: any) {
      toast.error(e.message || t('quiz.sessionNotFound'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm text-center">
        {/* Logo & Animation */}
        <div className="relative mb-8">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-primary-500/30 animate-[bounce_3s_ease-in-out_infinite]">
            <Gamepad2 className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-3 bg-primary-200/40 dark:bg-primary-800/30 rounded-full blur-sm" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t('quiz.joinTitle')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('quiz.joinSubtitle')}</p>

        {/* Code input */}
        <div className="relative mb-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            onKeyDown={handleKeyDown}
            placeholder="ABC123"
            maxLength={6}
            className="w-full text-center text-3xl font-bold tracking-[0.4em] py-4 px-6 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-200 dark:placeholder-slate-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
            autoFocus
            autoComplete="off"
          />
        </div>

        <button
          onClick={handleJoin}
          disabled={loading || code.length < 4}
          className="w-full bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <><ArrowRight className="w-5 h-5" />{t('quiz.joinGame')}</>
          )}
        </button>

        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-4">{t('quiz.codeHint')}</p>
      </div>
    </div>
  );
};

export default JoinQuizPage;
