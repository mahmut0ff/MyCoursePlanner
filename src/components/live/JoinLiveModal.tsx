import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, X, LogIn } from 'lucide-react';

interface JoinLiveModalProps {
  onJoin: (code: string) => void;
  onClose: () => void;
  loading?: boolean;
  error?: string;
}

const JoinLiveModal: React.FC<JoinLiveModalProps> = ({ onJoin, onClose, loading, error }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length === 6) {
      onJoin(cleaned);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Gradient header */}
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-6 text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            <Radio className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">{t('live.joinLesson')}</h2>
          <p className="text-sm text-white/70 mt-1">{t('live.enterCode')}</p>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder={t('live.codePlaceholder')}
              maxLength={6}
              className="w-full text-center text-3xl font-mono font-bold tracking-[0.5em] px-4 py-4 bg-slate-50 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-xl focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-500 placeholder:text-lg placeholder:tracking-normal placeholder:font-normal"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 text-center font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={code.length !== 6 || loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                {t('live.joinLesson')}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinLiveModal;
