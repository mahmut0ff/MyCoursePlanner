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
    <div className="exam-bg fixed inset-0 flex items-center justify-center z-50 p-4">
      {/* Back Button */}
      <button 
        onClick={() => navigate('/dashboard')}
        className="absolute top-4 left-4 sm:top-6 sm:left-6 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 transition-all z-20 group"
      >
        <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
      </button>

      <div className="w-full max-w-sm relative z-10 exam-slide-up">
        
        {/* Logo/Icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-white/40 dark:bg-black/40 backdrop-blur-xl flex items-center justify-center mb-4 shadow-xl border border-white/50 dark:border-white/10">
            <Edit3 className="w-10 h-10 text-primary-700 dark:text-primary-300" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Planula Exam</h1>
        </div>

        {/* Input Card */}
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/60 dark:border-slate-700/50 overflow-hidden">
          <div className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">{t('rooms.joinTitle', 'Enter Exam PIN')}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('rooms.joinSubtitle', 'Your instructor will provide a code')}</p>
            </div>

            {error && (
              <div className="bg-red-50/80 dark:bg-red-900/50 backdrop-blur-sm border border-red-200/50 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm mb-5 text-center flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4" /> {error}
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-5">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                className="w-full text-center text-3xl font-bold tracking-[0.4em] py-4 px-4 rounded-xl border-2 border-slate-200/50 dark:border-slate-800/50 bg-white/50 dark:bg-black/20 text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all shadow-inner uppercase"
                placeholder="000000"
                maxLength={6}
                autoFocus
              />
              <button 
                type="submit" 
                disabled={loading || code.length < 4} 
                className="w-full bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>{t('rooms.joinButton', 'Enter Exam')}</span><ArrowRight className="w-5 h-5" /></>}
              </button>
            </form>
          </div>
        </div>
        
        {/* Footer text */}
        <div className="text-center mt-6 text-slate-500 dark:text-slate-400 text-xs font-medium">
          Protected by Planula Secure Assessment
        </div>
      </div>
    </div>
  );
};

export default JoinRoomPage;

