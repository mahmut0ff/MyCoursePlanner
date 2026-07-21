import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Pencil, Plus, Search, Trash2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  apiDeleteCompensationRule,
  apiGetCompensationRules,
  apiUpdateCompensationRule,
  orgGetCourses,
  orgGetGroups,
  orgGetTeachers,
} from '../../../lib/api';
import { useBranch } from '../../../contexts/BranchContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import EmptyState from '../../../components/ui/EmptyState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import RowMenu from '../../../components/ui/RowMenu';
import type { RowMenuItem } from '../../../components/ui/RowMenu';
import LazyListFooter from '../../../components/ui/LazyListFooter';
import { useLazyList } from '../../../hooks/useLazyList';
import type { CompensationRule, Course, Group } from '../../../types';
import RuleEditorModal from '../components/RuleEditorModal';
import { describeComponents, describeEffective, describeScope, type Translate } from '../payrollFormat';

const collator = new Intl.Collator('ru');

/** Ставка, как её отдаёт сервер: с досланным именем преподавателя. */
type RuleRow = CompensationRule & { teacherName?: string };

/**
 * «Ставки» — карточки оплаты преподавателей. Директор рассуждает именно ими:
 * «Азизе — оклад плюс двадцать процентов с её группы». Поэтому компоненты
 * рисуются фразой по-русски, а не структурой, и период действия виден в строке.
 */
const RulesTab: React.FC = () => {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;
  const { activeBranchId } = useBranch();
  const { can } = usePermissions();

  const canWrite = can('payroll', 'write');
  const canDelete = can('payroll', 'delete');

  const [rules, setRules] = useState<RuleRow[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const [editor, setEditor] = useState<{ open: boolean; rule: RuleRow | null }>({ open: false, rule: null });
  const [pendingDelete, setPendingDelete] = useState<RuleRow | null>(null);
  const [forceDelete, setForceDelete] = useState<{ rule: RuleRow; linked: number | null } | null>(null);
  const [pendingArchive, setPendingArchive] = useState<RuleRow | null>(null);
  const [busy, setBusy] = useState(false);
  // Сервер отказал, потому что по ставке уже утверждена ведомость. Это не сбой,
  // а правило — показываем его объяснение отдельным баннером, а не тостом,
  // который исчезнет раньше, чем его дочитают.
  const [frozenNotice, setFrozenNotice] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([apiGetCompensationRules(), orgGetTeachers(), orgGetCourses(), orgGetGroups()])
      .then(([ruleData, teacherData, courseData, groupData]: [any, any, any, any]) => {
        setRules(Array.isArray(ruleData) ? ruleData : []);
        setTeachers(Array.isArray(teacherData) ? teacherData : []);
        setCourses(Array.isArray(courseData) ? courseData : []);
        setGroups(Array.isArray(groupData) ? groupData : []);
      })
      .catch((e: any) => setError(e?.message || t('payroll.loadFailed', 'Не удалось загрузить данные')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
    // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  }, [load, activeBranchId]);

  // Имя курса или группы по id — для читаемой области действия компонента.
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of courses) map.set(c.id, c.title);
    for (const g of groups) map.set(g.id, g.name);
    return map;
  }, [courses, groups]);

  const teacherNameById = useMemo(
    () => new Map(teachers.map(m => [String(m.uid || m.id), String(m.displayName || '')])),
    [teachers],
  );

  const nameOfRule = useCallback(
    (r: RuleRow) => r.teacherName || teacherNameById.get(r.teacherId) || r.teacherId,
    [teacherNameById],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rules.filter(r => {
      const matchesQuery = !q
        || nameOfRule(r).toLowerCase().includes(q)
        || (r.label || '').toLowerCase().includes(q);
      return matchesQuery && (!status || r.status === status);
    });
    return list.sort((a, b) =>
      collator.compare(nameOfRule(a), nameOfRule(b))
      || (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
  }, [rules, search, status, nameOfRule]);

  // Ленивый рендер вместо страниц; ключ сброса — фильтры и филиал, а не сам
  // массив, иначе перезагрузка после правки ставки отматывала бы список назад.
  const { visible: pageRows, total, hasMore, sentinelRef, loadMore } = useLazyList(filtered, {
    resetKey: `${search}|${status}|${activeBranchId || ''}`,
  });

  /** 409 бывает двух видов: замороженная ведомость (запрет) и черновые строки (можно force). */
  const runDelete = async (rule: RuleRow, force: boolean) => {
    setBusy(true);
    try {
      await apiDeleteCompensationRule(rule.id, force || undefined);
      toast.success(t('payroll.ruleDeleted', 'Ставка удалена'));
      setPendingDelete(null);
      setForceDelete(null);
      load();
    } catch (e: any) {
      if (e?.status === 409) {
        const frozen = e?.frozenStates ?? e?.body?.frozenStates;
        if (Array.isArray(frozen) && frozen.length) {
          setPendingDelete(null);
          setForceDelete(null);
          setFrozenNotice(e?.message || t('payroll.ruleFrozen', 'По этой ставке уже утверждена ведомость — удалить её нельзя. Заархивируйте ставку: она перестанет участвовать в расчётах, но история сохранится.'));
          return;
        }
        if (!force) {
          const raw = e?.payrollLines ?? e?.body?.payrollLines;
          setPendingDelete(null);
          setForceDelete({ rule, linked: typeof raw === 'number' ? raw : null });
          return;
        }
      }
      toast.error(e?.message || t('payroll.deleteFailed', 'Не удалось удалить ставку'));
    } finally {
      setBusy(false);
    }
  };

  const runArchive = async (rule: RuleRow) => {
    setBusy(true);
    try {
      await apiUpdateCompensationRule({ id: rule.id, status: 'archived' });
      toast.success(t('payroll.ruleArchived', 'Ставка заархивирована'));
      setPendingArchive(null);
      load();
    } catch (e: any) {
      setPendingArchive(null);
      if (e?.status === 409) {
        setFrozenNotice(e?.message || t('payroll.ruleFrozenEdit', 'По этой ставке уже утверждена ведомость — менять её нельзя.'));
      } else {
        toast.error(e?.message || t('payroll.archiveFailed', 'Не удалось заархивировать ставку'));
      }
    } finally {
      setBusy(false);
    }
  };

  const buildMenu = (rule: RuleRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [];
    if (canWrite) {
      items.push({ label: t('payroll.editRule', 'Изменить ставку'), icon: Pencil, onSelect: () => setEditor({ open: true, rule }) });
      if (rule.status === 'active') {
        items.push({ label: t('payroll.archiveRule', 'Заархивировать'), icon: Archive, onSelect: () => setPendingArchive(rule) });
      }
    }
    if (canDelete) {
      items.push({
        label: t('payroll.deleteRule', 'Удалить ставку'),
        icon: Trash2,
        danger: true,
        separated: true,
        onSelect: () => setPendingDelete(rule),
      });
    }
    return items;
  };

  const hasFilters = Boolean(search || status);

  return (
    <div className="space-y-4">
      {frozenNotice && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-sm text-amber-800 dark:text-amber-300 flex items-start justify-between gap-3">
          <span>{frozenNotice}</span>
          <button onClick={() => setFrozenNotice('')} className="text-xs font-medium underline shrink-0">
            {t('payroll.dismiss', 'Понятно')}
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('payroll.searchRules', 'Поиск по преподавателю или названию...')}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            aria-label={t('payroll.allStatuses', 'Все статусы')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">{t('payroll.allStatuses', 'Все статусы')}</option>
            <option value="active">{t('payroll.statusActive', 'Действует')}</option>
            <option value="archived">{t('payroll.statusArchived', 'В архиве')}</option>
          </select>
        </div>
        {canWrite && (
          <button
            onClick={() => setEditor({ open: true, rule: null })}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />{t('payroll.newRule', 'Новая ставка')}
          </button>
        )}
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="text-sm font-medium underline shrink-0">
            {t('payroll.retry', 'Повторить')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={hasFilters ? t('payroll.nothingFound', 'Ничего не найдено') : t('payroll.noRules', 'Ставок пока нет')}
          description={
            hasFilters
              ? t('payroll.tryOtherFilters', 'Попробуйте изменить поиск или статус')
              : t('payroll.noRulesHint', 'Заведите ставку преподавателю — без неё в ведомости ему ничего не начислится')
          }
        />
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('payroll.colTeacher', 'Преподаватель')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('payroll.colFormula', 'Из чего складывается')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('payroll.colPeriod', 'Период действия')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('payroll.colStatus', 'Статус')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('payroll.colActions', 'Действия')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pageRows.map(rule => {
                    const archived = rule.status === 'archived';
                    return (
                      <tr key={rule.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${archived ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3.5 align-top">
                          <p className="font-medium text-slate-900 dark:text-white leading-tight">{nameOfRule(rule)}</p>
                          <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{rule.label}</p>
                        </td>
                        <td className="px-5 py-3.5 align-top text-slate-700 dark:text-slate-300 min-w-[16rem]">
                          <p>{describeComponents(rule.components, tr)}</p>
                          {/* Область действия отдельной строкой: та же ставка на всех
                              группах и на одной — это разные деньги. */}
                          <ul className="mt-1 space-y-0.5">
                            {(rule.components ?? []).map((c, i) => (
                              c.kind === 'salary' ? null : (
                                <li key={i} className="text-[11px] text-slate-400">
                                  {describeScope(c.scope, id => nameById.get(id) || id, tr)}
                                </li>
                              )
                            ))}
                          </ul>
                        </td>
                        <td className="px-5 py-3.5 align-top text-slate-500 whitespace-nowrap">
                          {describeEffective(rule.effectiveFrom, rule.effectiveTo, tr)}
                        </td>
                        <td className="px-5 py-3.5 align-top whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            archived
                              ? 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          }`}>
                            {archived ? t('payroll.statusArchived', 'В архиве') : t('payroll.statusActive', 'Действует')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 align-top text-right whitespace-nowrap">
                          <RowMenu items={buildMenu(rule)} label={t('payroll.colActions', 'Действия')} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <LazyListFooter
            visibleCount={pageRows.length}
            total={total}
            hasMore={hasMore}
            sentinelRef={sentinelRef}
            onLoadMore={loadMore}
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingArchive)}
        busy={busy}
        title={t('payroll.archiveRule', 'Заархивировать')}
        message={t(
          'payroll.archiveConfirm',
          'Ставка перестанет участвовать в расчётах со следующего пересчёта, но останется в истории уже утверждённых ведомостей.',
        )}
        confirmLabel={t('payroll.archive', 'Заархивировать')}
        onConfirm={() => pendingArchive && runArchive(pendingArchive)}
        onClose={() => setPendingArchive(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        busy={busy}
        title={t('payroll.deleteRule', 'Удалить ставку')}
        message={t(
          'payroll.deleteConfirm',
          'Ставка «{{label}}» будет удалена без возможности восстановления. Если нужно только прекратить начисления — заархивируйте её.',
          { label: pendingDelete?.label || '' },
        )}
        confirmLabel={t('payroll.delete', 'Удалить')}
        onConfirm={() => pendingDelete && runDelete(pendingDelete, false)}
        onClose={() => setPendingDelete(null)}
      />

      {/* Второе подтверждение — ответ на 409 о черновых строках ведомости. */}
      <ConfirmDialog
        open={Boolean(forceDelete)}
        danger
        busy={busy}
        title={t('payroll.deleteRuleForceTitle', 'Ставка уже попала в ведомость')}
        message={
          forceDelete?.linked != null
            ? t(
                'payroll.deleteRuleForceCount',
                'К этой ставке привязано строк ведомости: {{n}}. Ведомость не утверждена, поэтому строки восстановятся пересчётом — но без ставки начисления по ним обнулятся. Удалить всё равно?',
                { n: forceDelete.linked },
              )
            : t(
                'payroll.deleteRuleForce',
                'К этой ставке привязаны строки неутверждённой ведомости. Они восстановятся пересчётом, но начисления по ним обнулятся. Удалить всё равно?',
              )
        }
        confirmLabel={t('payroll.deleteAnyway', 'Всё равно удалить')}
        onConfirm={() => forceDelete && runDelete(forceDelete.rule, true)}
        onClose={() => setForceDelete(null)}
      />

      {editor.open && (
        <RuleEditorModal
          rule={editor.rule}
          teachers={teachers}
          courses={courses}
          groups={groups}
          onClose={() => setEditor({ open: false, rule: null })}
          onSaved={load}
        />
      )}
    </div>
  );
};

export default RulesTab;
