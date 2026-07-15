import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2, Trash2, X, ArrowRight, AlertTriangle } from 'lucide-react';
import {
  orgBulkDeleteMembers,
  orgBulkSetBranch,
  orgBulkSetGroup,
  type BulkKind,
  type BulkResult,
} from '../../lib/api';
import { usePermissions } from '../../contexts/PermissionsContext';
import type { Branch, Group } from '../../types';

interface BulkActionBarProps {
  /** Which roster this bar acts on. Also picks the permission that gates it. */
  kind: BulkKind;
  selected: Set<string>;
  /** Branch migration is hidden when the org has none. */
  branches: Branch[];
  groups: Group[];
  /** Drop the selection without refetching. */
  onClear: () => void;
  /** A mutation landed — refetch the roster and clear the selection. */
  onDone: () => void;
}

type Job = 'group' | 'branch' | 'delete';

/**
 * Multi-select action bar for the students and teachers rosters: migrate the
 * selection to a group or a branch, or delete it outright.
 *
 * Each action mirrors the grant the server enforces on it, per roster
 * (students:* for students, teachers:* for teachers): migrating takes `write`,
 * deleting takes `delete`. They're gated separately because they're separate
 * powers — moving someone between groups isn't erasing them. Hiding an action
 * the caller lacks just keeps the affordance honest; the server still decides.
 */
const BulkActionBar: React.FC<BulkActionBarProps> = ({ kind, selected, branches, groups, onClear, onDone }) => {
  const { t } = useTranslation();
  const { canWrite, canDelete, loaded } = usePermissions();

  const [groupId, setGroupId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState<Job | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const uids = useMemo(() => [...selected], [selected]);
  const resource = kind === 'student' ? 'students' : 'teachers';
  const mayMigrate = canWrite(resource);
  const mayDelete = canDelete(resource);

  // `loaded` matters here: a restricted member's custom role resolves async, and
  // until it settles they fall back to their base role's defaults — a manager
  // whose grants were revoked would flash an enabled Delete button.
  if (!loaded || (!mayMigrate && !mayDelete) || uids.length === 0) return null;

  /** Report a bulk result. `skipped` covers rows the server refused to touch. */
  const finish = (res: BulkResult, msg: string) => {
    const n = res.deleted ?? res.moved ?? 0;
    if (n > 0) toast.success(`${msg} · ${n}`);
    else if (!res.skipped) toast(t('roster.bulk.noop', 'Ничего не изменено'));
    if (res.skipped > 0) {
      toast(t('roster.bulk.skipped', 'Пропущено: {{count}}', { count: res.skipped }), { icon: '⚠️' });
    }
    onDone();
  };

  /** Returns whether the call landed, so a failure leaves the form (and modal) intact to retry. */
  const run = async (job: Job, fn: () => Promise<BulkResult>, msg: string): Promise<boolean> => {
    setBusy(job);
    try {
      finish(await fn(), msg);
      return true;
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const migrateGroup = async () => {
    if (await run('group', () => orgBulkSetGroup(kind, uids, groupId), t('roster.bulk.movedToGroup', 'Переведено в группу'))) {
      setGroupId('');
    }
  };

  const migrateBranch = async () => {
    if (await run('branch', () => orgBulkSetBranch(kind, uids, branchId), t('roster.bulk.movedToBranch', 'Переведено в филиал'))) {
      setBranchId('');
    }
  };

  const remove = async () => {
    if (await run('delete', () => orgBulkDeleteMembers(kind, uids), t('roster.bulk.deleted', 'Удалено'))) {
      setConfirmDelete(false);
    }
  };

  const selectCls = 'input text-sm !py-1.5 max-w-[180px]';
  const goCls =
    'p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0';

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-4 py-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-500/30">
        <span className="text-sm font-semibold text-primary-700 dark:text-primary-300 shrink-0">
          {t('roster.bulk.selected', 'Выбрано')}: {uids.length}
        </span>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {/* Migrate to a group */}
          {mayMigrate && groups.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select value={groupId} onChange={e => setGroupId(e.target.value)} className={selectCls} disabled={busy !== null}>
                <option value="">{t('roster.bulk.toGroup', 'В группу')}…</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                onClick={migrateGroup}
                disabled={!groupId || busy !== null}
                className={goCls}
                title={t('roster.bulk.migrate', 'Перевести')}
              >
                {busy === 'group' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Migrate to a branch — orgs without branches never see this */}
          {mayMigrate && branches.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select value={branchId} onChange={e => setBranchId(e.target.value)} className={selectCls} disabled={busy !== null}>
                <option value="">{t('roster.bulk.toBranch', 'В филиал')}…</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button
                onClick={migrateBranch}
                disabled={!branchId || busy !== null}
                className={goCls}
                title={t('roster.bulk.migrate', 'Перевести')}
              >
                {busy === 'branch' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          )}

          {mayDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/30 disabled:opacity-40 transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              {t('common.delete', 'Удалить')}
            </button>
          )}

          <button
            onClick={onClear}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
            title={t('common.cancel', 'Отмена')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => { if (busy !== 'delete') setConfirmDelete(false); }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              {kind === 'student'
                ? t('roster.bulk.deleteStudentsTitle', 'Удалить учеников?')
                : t('roster.bulk.deleteTeachersTitle', 'Удалить преподавателей?')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              {t('roster.bulk.deleteCount', 'Будет удалено')}:{' '}
              <span className="font-bold text-slate-900 dark:text-white">{uids.length}</span>
            </p>
            <p className="text-xs text-slate-500 mb-6">
              {t(
                'roster.bulk.deleteDesc',
                'Они будут исключены из организации и из всех групп. У кого есть вход в систему — аккаунт сохранится, удалится только связь с организацией. Действие необратимо.',
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={busy === 'delete'}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-40 transition-colors"
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={remove}
                disabled={busy === 'delete'}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t('common.delete', 'Удалить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BulkActionBar;
