import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiJoinQuizSession, apiGetQuizSessionByCode } from '../../lib/api';
import { Gamepad2, ArrowRight, Loader2, ArrowLeft } from 'lucide-react';
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
      const session = await apiGetQuizSessionByCode(cleaned);
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
    <div className="quiz-bg-image fixed inset-0 flex items-center justify-center z-50">
      {/* Back Button */}
      <button 
        onClick={() => navigate('/dashboard')}
        className="absolute top-4 left-4 sm:top-6 sm:left-6 w-12 h-12 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 transition-all z-20 group"
      >
        <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
      </button>

      <div className="w-full max-w-md px-4 relative z-10" style={{ animation: 'kahoot-slide-up 0.5s ease-out' }}>
        {/* Floating Logo */}
        <div className="text-center mb-8" style={{ animation: 'kahoot-lobby-float 3s ease-in-out infinite' }}>
          <div className="w-24 h-24 mx-auto rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-4 shadow-2xl border border-white/20">
            <Gamepad2 className="w-12 h-12 text-white" />
          </div>
          <h1 className="kahoot-font text-3xl font-extrabold text-white tracking-tight">Planula Quiz</h1>
        </div>

        {/* PIN Card */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="p-8">
            <div className="text-center mb-6">
              <h2 className="kahoot-font text-lg font-bold text-gray-800">{t('quiz.joinTitle')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('quiz.joinSubtitle')}</p>
            </div>

            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              placeholder="Game PIN"
              maxLength={6}
              className="w-full text-center text-3xl font-bold tracking-[0.3em] py-4 px-4 rounded-lg border-2 border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all kahoot-font"
              autoFocus
              autoComplete="off"
            />

            <button
              onClick={handleJoin}
              disabled={loading || code.length < 4}
              className="w-full mt-4 text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-lg kahoot-font shadow-lg hover:shadow-xl active:scale-[0.98]"
              style={{ 
                backgroundColor: code.length >= 4 ? '#26890c' : '#999',
                ...(code.length >= 4 ? { boxShadow: '0 4px 14px rgba(38, 137, 12, 0.3)' } : {})
              }}
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>{t('quiz.joinGame')}<ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-white/50 text-xs mt-6 kahoot-font">{t('quiz.codeHint')}</p>
      </div>
    </div>
  );
};

export default JoinQuizPage;
