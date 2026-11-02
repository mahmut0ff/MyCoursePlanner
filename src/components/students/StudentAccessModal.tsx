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
    if (password.length < 6) { toast.error(t('org.students.access.passwordMin', 'Пароль — минимум 6 символов')); return; }
    if (!hasLogin && username.trim().length < 3) { toast.error(t('org.students.access.loginMin', 'Логин — минимум 3 символа')); return; }
    setSaving(true);
    try {
      if (hasLogin) {
        await orgResetStudentPassword(uid, password);
        toast.success(t('org.students.access.passwordUpdated', 'Пароль обновлён'));
        onClose();
      } else {
        const res: any = await orgGrantStudentLogin({ uid, username: username.trim().toLowerCase(), password });
        toast.success(t('org.students.access.granted', 'Доступ выдан'));
        onGranted({ username: res.username, email: res.email });
        setGranted({ username: res.username, password });
      }
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'input';

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-pop max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
        {granted ? (
          <div>
            <div className="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{t('org.students.access.granted', 'Доступ выдан')}</h2>
            <p className="text-xs text-slate-500 mb-4">{t('org.students.access.grantedHint', 'Передайте ученику эти данные. Пароль показывается только сейчас.')}</p>
            <div className="space-y-3">
              {([[t('org.students.access.login', 'Логин'), granted.username], [t('auth.password', 'Пароль'), granted.password]] as const).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">{value}</p>
                  </div>
                  <button onClick={() => copy(value)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-md transition-colors shrink-0">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => copy(t('org.students.access.copyText', 'Логин: {{username}}\nПароль: {{password}}', { username: granted.username, password: granted.password }))}
                className="w-full text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center justify-center gap-1.5 pt-1"
              >
                <Copy className="w-3.5 h-3.5" /> {t('org.students.access.copyBoth', 'Скопировать логин и пароль')}
              </button>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={onClose} className="btn-primary">
                {t('common.done', 'Готово')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary-500" />
                {hasLogin ? t('org.students.access.changePassword', 'Сменить пароль') : t('org.students.access.grantTitle', 'Выдать доступ в систему')}
              </h2>
              <button onClick={onClose} aria-label={t('common.close', 'Закрыть')} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700"><X className="w-3.5 h-3.5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              <b className="text-slate-700 dark:text-slate-300">{studentName}</b>
              {hasLogin && currentLogin && <> · {t('org.students.access.loginInline', 'логин:')} <span className="font-mono">{currentLogin}</span></>}
              {!hasLogin && <> · {t('org.students.access.noLoginHint', 'сейчас у ученика нет входа — это запись для журнала и оплат.')}</>}
            </p>

            <div className="space-y-3">
              {!hasLogin && (
                <div>
                  <label className="label">{t('org.students.access.login', 'Логин')} *</label>
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
                <label className="label">{hasLogin ? t('org.students.access.newPassword', 'Новый пароль') : t('auth.password', 'Пароль')} *</label>
                <div className="relative">
                  <input
                    autoFocus={hasLogin}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••"
                    className={`${field} pr-8`}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} disabled={saving} className="btn-ghost disabled:opacity-50">
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || password.length < 6 || (!hasLogin && username.trim().length < 3)}
                className="btn-primary disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                {hasLogin ? t('org.students.access.changePassword', 'Сменить пароль') : t('org.students.access.grant', 'Выдать доступ')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentAccessModal;
