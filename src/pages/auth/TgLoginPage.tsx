import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiTgLogin } from '../../lib/api';
import { signInWithToken } from '../../services/auth.service';
import { Loader2, AlertCircle, Send } from 'lucide-react';

/**
 * Passwordless entry point opened from the Telegram bot's login button.
 * Exchanges the one-time ?ott= token for a Firebase custom token and signs in.
 */
const TgLoginPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const ott = params.get('ott');
    if (!ott) {
      setError('Ссылка неполная. Откройте кнопку входа из Telegram ещё раз.');
      return;
    }
    (async () => {
      try {
        const { customToken } = await apiTgLogin(ott);
        await signInWithToken(customToken);
        navigate('/dashboard', { replace: true });
      } catch (e: any) {
        setError(e?.message || 'Не удалось войти. Запросите новую ссылку в боте командой /login.');
      }
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-8 text-center">
        {!error ? (
          <>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center mb-5">
              <Send className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Входим в SabakHub…</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Подождите секунду — настраиваем ваш аккаунт.</p>
            <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" />
          </>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center mb-5">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Не удалось войти</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error}</p>
            <button onClick={() => navigate('/login')} className="btn-secondary w-full">Войти обычным способом</button>
          </>
        )}
      </div>
    </div>
  );
};

export default TgLoginPage;
