import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGetRoomByCode, apiJoinRoom } from '../../lib/api';
import { Edit3, ArrowRight, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';

const JoinRoomPage: React.FC = () => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length < 4) { setError(t('rooms.enterCodeError') || 'Invalid code format'); return; }
    setLoading(true);
    try {
      const room = await apiGetRoomByCode(cleaned);
      if (!room) { setError(t('rooms.notFound') || 'Exam not found'); setLoading(false); return; }
      await apiJoinRoom(room.id);
      navigate(`/take/${room.id}`);
    } catch (e: any) {
      setError(e.message || t('rooms.joinFailed') || 'Failed to join');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950 fixed inset-0 flex items-center justify-center z-50 p-4">
      {/* Back Button */}
      <button 
        onClick={() => navigate('/dashboard')}
        className="absolute top-4 left-4 w-8 h-8 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors z-20"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
      </button>

      <div className="w-full max-w-sm relative z-10 exam-slide-up">
        
        {/* Logo/Icon */}
        <div className="text-center mb-4">
          <div className="w-10 h-10 mx-auto rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center mb-3 border border-slate-200 dark:border-slate-700">
            <Edit3 className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('rooms.brandTitle', 'SabakHub Экзамен')}</h1>
        </div>

        {/* Input Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-5">
            <div className="text-center mb-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('rooms.joinTitle', 'Enter Exam PIN')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('rooms.joinSubtitle', 'Your instructor will provide a code')}</p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 px-3 py-2 rounded-md text-sm mb-4 text-center flex items-center justify-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" /> {error}
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                className="w-full text-center text-2xl font-semibold font-mono tracking-[0.4em] py-2.5 px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 hover:border-slate-400 dark:hover:border-slate-600 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 outline-none transition-colors uppercase"
                placeholder="000000"
                maxLength={6}
                autoFocus
              />
              <button 
                type="submit" 
                disabled={loading || code.length < 4} 
                className="btn-primary w-full flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><span>{t('rooms.joinButton', 'Enter Exam')}</span><ArrowRight className="w-3.5 h-3.5" /></>}
              </button>
            </form>
          </div>
        </div>
        
        {/* Footer text */}
        <div className="text-center mt-4 text-slate-500 dark:text-slate-400 text-xs">
          {t('rooms.protectedBy', 'Защищено системой проверки SabakHub')}
        </div>
      </div>
    </div>
  );
};

export default JoinRoomPage;

