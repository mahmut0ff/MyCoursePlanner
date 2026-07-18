import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { orgBulkSetBranch, orgBulkSetGroup, type BulkResult } from '../../lib/api';
import type { Branch, Group } from '../../types';
import toast from 'react-hot-toast';

interface Props {
  uid: string;
  studentName: string;
  mode: 'group' | 'branch';
  groups: Group[];
  branches: Branch[];
  /** Где студент сейчас — чтобы было видно, что именно заменяется. */
  current: string[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Перевод одного студента. Те же эндпоинты, что и у массового бара, просто с
 * массивом из одного uid: раньше это действие существовало только под чекбоксами,
 * которых нет в мобильной вёрстке.
 *
 * И группа, и филиал — именно перевод, а не добавление: сервер убирает студента
 * из остальных групп / заменяет список филиалов целиком. Об этом сказано в тексте,
 * иначе «перевести» читается как «добавить ещё одну».
 */
const MoveStudentModal: React.FC<Props> = ({ uid, studentName, mode, groups, branches, current, onClose, onDone }) => {
  const { t } = useTranslation();
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);

  const options = mode === 'group'
    ? groups.map(g => ({ id: g.id, name: g.name }))
    : branches.map(b => ({ id: b.id, name: b.name }));

  const title = mode === 'group' ? 'Перевести в группу' : 'Перевести в филиал';
  const hint = mode === 'group'
    ? 'Студент будет исключён из остальных групп и добавлен в выбранную.'
    : 'Текущий филиал будет заменён на выбранный.';

  const handleMove = async () => {
    if (!targetId) return;
    setBusy(true);
    try {
      const res: BulkResult = mode === 'group'
        ? await orgBulkSetGroup('student', [uid], targetId)
        : await orgBulkSetBranch('student', [uid], targetId);
      // moved === 0 означает, что сервер отказался трогать запись (чужой филиал,
      // снятые права) — молчаливый «успех» здесь врал бы.
      if ((res.moved ?? 0) > 0) {
        toast.success(mode === 'group' ? 'Переведён в группу' : 'Переведён в филиал');
        onDone();
        onClose();
      } else {
        toast.error('Не удалось перевести — нет доступа к этой записи');
      }
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          <b className="text-slate-700 dark:text-slate-300">{studentName}</b>
          {current.length > 0 && <> · сейчас: {current.join(', ')}</>}
        </p>

        {options.length === 0 ? (
          <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-3 rounded-xl text-xs font-medium mb-5 border border-amber-200/50">
            {mode === 'group' ? 'В организации нет групп.' : 'В организации нет филиалов.'}
          </div>
        ) : (
          <>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              disabled={busy}
              autoFocus
              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-primary-500 mb-2"
            >
              <option value="">— Выберите —</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mb-5">{hint}</p>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50">
            {t('common.cancel', 'Отмена')}
          </button>
          <button
            onClick={handleMove}
            disabled={!targetId || busy}
            className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-40 transition-all flex items-center gap-2"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Перевести
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveStudentModal;
