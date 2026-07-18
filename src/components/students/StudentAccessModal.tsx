import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGrantStudentLogin, orgResetStudentPassword } from '../../lib/api';
import { CheckCircle, Copy, Eye, EyeOff, KeyRound, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  uid: string;
  studentName: string;
  /** Уже есть вход — значит, это смена пароля, а не выдача доступа. */
  hasLogin: boolean;
  currentLogin?: string;
  onClose: () => void;
  /** Доступ выдан впервые — вызывающий обновляет свою копию студента. */
  onGranted: (login: { username: string; email: string }) => void;
}

/**
 * Доступ студента в систему. Два режима в одном окне, потому что для менеджера
 * это один вопрос — «может ли ученик зайти и под чем»:
 *  • офлайн-студент → выдать логин (аккаунт создаётся поверх существующей записи);
 *  • студент с входом → сменить пароль.
 */
const StudentAccessModal: React.FC<Props> = ({ uid, studentName, hasLogin, currentLogin, onClose, onGranted }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  // Пароль показывается ровно один раз — после выдачи его уже не прочитать.
  const [granted, setGranted] = useState<{ username: string; password: string } | null>(null);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('common.copied', 'Скопировано'));
  };

  const handleSubmit = async () => {
    if (password.length < 6) { toast.error('Пароль — минимум 6 символов'); return; }
    if (!hasLogin && username.trim().length < 3) { toast.error('Логин — минимум 3 символа'); return; }
    setSaving(true);
    try {
      if (hasLogin) {
        await orgResetStudentPassword(uid, password);
        toast.success('Пароль обновлён');
        onClose();
      } else {
        const res: any = await orgGrantStudentLogin({ uid, username: username.trim().toLowerCase(), password });
        toast.success('Доступ выдан');
        onGranted({ username: res.username, email: res.email });
        setGranted({ username: res.username, password });
      }
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {granted ? (
          <div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Доступ выдан</h2>
            <p className="text-xs text-slate-500 mb-5">Передайте ученику эти данные. Пароль показывается только сейчас.</p>
            <div className="space-y-3">
              {([['Логин', granted.username], ['Пароль', granted.password]] as const).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-slate-400">{label}</p>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white truncate">{value}</p>
                  </div>
                  <button onClick={() => copy(value)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => copy(`Логин: ${granted.username}\nПароль: ${granted.password}`)}
                className="w-full text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center justify-center gap-1.5 pt-1"
              >
                <Copy className="w-3.5 h-3.5" /> Скопировать логин и пароль
              </button>
            </div>
            <div className="flex justify-end mt-8">
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all">
                {t('common.done', 'Готово')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary-500" />
                {hasLogin ? 'Сменить пароль' : 'Выдать доступ в систему'}
              </h2>
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              <b className="text-slate-700 dark:text-slate-300">{studentName}</b>
              {hasLogin && currentLogin && <> · логин: <span className="font-mono">{currentLogin}</span></>}
              {!hasLogin && <> · сейчас у ученика нет входа — это запись для журнала и оплат.</>}
            </p>

            <div className="space-y-4">
              {!hasLogin && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Логин *</label>
                  <input
                    autoFocus
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="aibek_t"
                    className={`${field} font-mono`}
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{hasLogin ? 'Новый пароль' : 'Пароль'} *</label>
                <div className="relative">
                  <input
                    autoFocus={hasLogin}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••"
                    className={`${field} pr-11`}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={onClose} disabled={saving} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50">
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || password.length < 6 || (!hasLogin && username.trim().length < 3)}
                className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                {hasLogin ? 'Сменить пароль' : 'Выдать доступ'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentAccessModal;
