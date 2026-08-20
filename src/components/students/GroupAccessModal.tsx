import React, { useState } from 'react';
import { X, KeyRound, Copy, Send, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { orgBulkGroupLogins, type BulkGroupLoginsResult } from '../../lib/api';

interface Props {
  groupId: string;
  groupName: string;
  onClose: () => void;
}

/**
 * Выдача доступов всей группе разом — «завтра экзамен, у половины нет входа».
 *
 * Показать действующие пароли невозможно: Firebase хранит их хешем. Поэтому
 * окно не «показывает доступы», а ВЫДАЁТ новые и показывает их один раз —
 * формулировки везде говорят именно это, чтобы преподаватель не ждал, что
 * сможет подсмотреть старый пароль позже.
 */
const GroupAccessModal: React.FC<Props> = ({ groupId, groupName, onClose }) => {
  const [resetExisting, setResetExisting] = useState(false);
  const [sendTelegram, setSendTelegram] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkGroupLoginsResult | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const res = await orgBulkGroupLogins({ groupId, resetExisting, sendTelegram });
      setResult(res);
      if (res.issued.length === 0) {
        toast.success('У всех учеников группы вход уже есть');
      } else {
        toast.success(`Доступы выданы: ${res.issued.length}`);
      }
    } catch (e: any) {
      toast.error(e.message || 'Не удалось выдать доступы');
    } finally {
      setBusy(false);
    }
  };

  const asText = (): string =>
    (result?.issued || [])
      .map(i => `${i.name} — логин: ${i.username} — пароль: ${i.password}`)
      .join('\n');

  const copyAll = () => {
    navigator.clipboard.writeText(asText());
    toast.success('Скопировано — сохраните, второй раз пароли не показать');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-3 px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-slate-400" />
            Доступы группы {groupName}
          </h2>
          <button onClick={onClose} aria-label="Закрыть" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {!result ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Ученикам без входа будут созданы логин и пароль — с ними они смогут зайти
                в приложение и пройти экзамен.
              </p>

              <label className="mt-4 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendTelegram}
                  onChange={e => setSendTelegram(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-primary-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  Отправить каждому в Telegram
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Дойдёт только тем, кто уже привязал бота. Остальным доступы придётся передать лично — список будет ниже.
                  </span>
                </span>
              </label>

              <label className="mt-3 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetExisting}
                  onChange={e => setResetExisting(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-primary-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  Сбросить пароль и тем, у кого вход уже есть
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Их текущий пароль перестанет работать — включайте, только если ученики его забыли.
                  </span>
                </span>
              </label>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={run}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {busy ? 'Выдаём…' : 'Выдать доступы'}
                </button>
              </div>
            </>
          ) : (
            <>
              {result.issued.length > 0 && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 mb-4">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[13px]">
                    Пароли показываются <b>один раз</b> — сохраните их сейчас. Позже подсмотреть
                    не получится, можно будет только выдать новые.
                  </p>
                </div>
              )}

              {result.sentToTelegram > 0 && (
                <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Отправлено в Telegram: {result.sentToTelegram} из {result.issued.length}
                </p>
              )}

              {result.issued.length > 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Ученик</th>
                        <th className="px-3 py-2 text-left font-medium">Логин</th>
                        <th className="px-3 py-2 text-left font-medium">Пароль</th>
                        <th className="px-3 py-2 text-center font-medium">TG</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {result.issued.map(i => (
                        <tr key={i.uid}>
                          <td className="px-3 py-2 text-slate-900 dark:text-white">{i.name}</td>
                          <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200">{i.username}</td>
                          <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200">{i.password}</td>
                          <td className="px-3 py-2 text-center">
                            {i.sent
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                              : <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Новых доступов не понадобилось — вход есть у всех.
                </p>
              )}

              {result.skipped.length > 0 && (
                <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400">
                  Пропущены ({result.skipped.length}): {result.skipped.map(s => `${s.name} — ${s.reason.toLowerCase()}`).join('; ')}
                </p>
              )}

              <div className="mt-5 flex items-center justify-end gap-2">
                {result.issued.length > 0 && (
                  <button
                    onClick={copyAll}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
                  >
                    <Copy className="w-4 h-4" />Скопировать списком
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors"
                >
                  Готово
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupAccessModal;
