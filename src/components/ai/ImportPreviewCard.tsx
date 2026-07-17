/**
 * ImportPreviewCard — the editable preview for "import students from a screenshot".
 *
 * The AI (api-ai-assistant `import_parse`) returns a PLAN: students grouped by the
 * headings it read, each flagged as a possible duplicate of an existing student,
 * each heading matched to an existing group when one looks the same. Nothing is
 * written yet — this card lets the user fix everything before committing:
 *   • rename a parsed group, point it at an existing group, or drop it;
 *   • for a group with no match, create it (pick the course) right here;
 *   • per student: include / exclude;
 *   • per duplicate: skip it, or enroll the existing student into this group.
 * On confirm it calls `onImport(payload)` (→ `import_commit`) and shows the result.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, UserPlus, AlertTriangle, Check, Loader2, Layers,
  GraduationCap, CircleAlert, PartyPopper,
} from 'lucide-react';

// ── Plan shapes (mirror the api-ai-assistant import_parse response) ──
interface DupRef { uid: string; name: string; phone: string }
interface PlanStudent { name: string; phone: string; duplicate: DupRef | null }
interface PlanGroup {
  key: string;
  parsedName: string;
  existingGroupId: string | null;
  existingGroupName: string | null;
  courseId: string | null;
  courseName: string | null;
  branchId: string | null;
  students: PlanStudent[];
}
interface Catalog {
  groups: { id: string; name: string; courseName: string }[];
  courses: { id: string; title: string; paymentFormat: string; price: number }[];
  branches: { id: string; name: string }[];
}
export interface ImportPlan {
  groups: PlanGroup[];
  ungrouped: PlanStudent[];
  catalog: Catalog;
  canCreateGroups: boolean;
  counts: { students: number; groups: number; duplicates: number };
}
export interface ImportResult {
  createdStudents: number;
  enrolledExisting: number;
  createdGroups: { id: string; name: string }[];
  skipped: number;
  failures: { name: string; reason: string }[];
}

// ── Editable working state ──
type GroupMode = 'existing' | 'new' | 'skip';
type DupAction = 'skip' | 'add';
interface RowState { name: string; phone: string; duplicate: DupRef | null; include: boolean; dupAction: DupAction }
interface GroupState {
  key: string;
  parsedName: string;
  mode: GroupMode;
  groupId: string;   // when mode === 'existing'
  name: string;      // when mode === 'new'
  courseId: string;  // when mode === 'new'
  students: RowState[];
}

const mkRow = (s: PlanStudent): RowState => ({
  name: s.name, phone: s.phone, duplicate: s.duplicate, include: true, dupAction: 'skip',
});

const ImportPreviewCard: React.FC<{
  plan: ImportPlan;
  onImport: (payload: any) => Promise<ImportResult>;
  onCancel: () => void;
}> = ({ plan, onImport, onCancel }) => {
  const { t } = useTranslation();
  const { catalog, canCreateGroups } = plan;
  const soleCourse = catalog.courses.length === 1 ? catalog.courses[0].id : '';

  const [branchId, setBranchId] = useState('');
  const [groups, setGroups] = useState<GroupState[]>(() =>
    plan.groups.map(g => ({
      key: g.key,
      parsedName: g.parsedName,
      mode: g.existingGroupId ? 'existing' : (canCreateGroups ? 'new' : 'skip'),
      groupId: g.existingGroupId || '',
      name: g.parsedName || g.existingGroupName || '',
      courseId: g.courseId || soleCourse,
      students: g.students.map(mkRow),
    })),
  );
  const [ungrouped, setUngrouped] = useState<RowState[]>(() => plan.ungrouped.map(mkRow));

  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);

  // ── Mutators ──
  const patchGroup = (gi: number, patch: Partial<GroupState>) =>
    setGroups(prev => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const patchRow = (gi: number, ri: number, patch: Partial<RowState>) =>
    setGroups(prev => prev.map((g, i) =>
      i !== gi ? g : { ...g, students: g.students.map((r, j) => (j === ri ? { ...r, ...patch } : r)) }));
  const patchLoose = (ri: number, patch: Partial<RowState>) =>
    setUngrouped(prev => prev.map((r, j) => (j === ri ? { ...r, ...patch } : r)));

  // A group can actually receive enrollments only if it resolves to a real group.
  const groupUsable = (g: GroupState) =>
    (g.mode === 'existing' && !!g.groupId) || (g.mode === 'new' && !!g.courseId);

  // ── Derived counts / validation ──
  const summary = useMemo(() => {
    let toCreate = 0, toEnroll = 0, newGroups = 0;
    for (const g of groups) {
      toCreate += g.students.filter(s => !s.duplicate && s.include).length;
      if (groupUsable(g)) toEnroll += g.students.filter(s => s.duplicate && s.dupAction === 'add').length;
      if (g.mode === 'new' && g.students.some(s => (!s.duplicate && s.include) || s.dupAction === 'add')) newGroups++;
    }
    toCreate += ungrouped.filter(s => !s.duplicate && s.include).length;
    return { toCreate, toEnroll, newGroups };
  }, [groups, ungrouped]);

  // A group that has people to place but no destination fully chosen (new group
  // without a course, or "existing" without a group picked) blocks the import —
  // otherwise those students would be silently created with no group.
  const incompleteGroups = groups.filter(g => {
    const hasPeople = g.students.some(s => (!s.duplicate && s.include) || (s.duplicate && s.dupAction === 'add'));
    if (!hasPeople) return false;
    if (g.mode === 'new') return !g.courseId;
    if (g.mode === 'existing') return !g.groupId;
    return false; // 'skip' is always valid
  });
  const nothingToDo = summary.toCreate === 0 && summary.toEnroll === 0;

  const buildPayload = () => ({
    branchId: branchId || undefined,
    groups: groups.map(g => {
      const usable = groupUsable(g);
      return {
        mode: g.mode,
        groupId: g.mode === 'existing' ? g.groupId : undefined,
        name: g.name.trim() || g.parsedName,
        courseId: g.mode === 'new' ? g.courseId : undefined,
        branchId: branchId || undefined,
        newStudents: g.students.filter(s => !s.duplicate && s.include).map(s => ({ name: s.name, phone: s.phone })),
        enrollUids: usable
          ? g.students.filter(s => s.duplicate && s.dupAction === 'add').map(s => s.duplicate!.uid)
          : [],
      };
    }),
    ungrouped: {
      newStudents: ungrouped.filter(s => !s.duplicate && s.include).map(s => ({ name: s.name, phone: s.phone })),
    },
  });

  const commit = async () => {
    setCommitting(true);
    setError('');
    try {
      const res = await onImport(buildPayload());
      setResult(res);
    } catch (e: any) {
      setError(e?.message || t('assistant.import.commitError', 'Не удалось выполнить импорт'));
    } finally {
      setCommitting(false);
    }
  };

  // ── Result state ──
  if (result) {
    return (
      <div className="w-full rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-900/15 p-3.5">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
          <PartyPopper className="w-4.5 h-4.5" />
          {t('assistant.import.doneTitle', 'Импорт завершён')}
        </div>
        <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
          <li>• {t('assistant.import.resCreated', 'Добавлено студентов')}: <strong>{result.createdStudents}</strong></li>
          {result.enrolledExisting > 0 && (
            <li>• {t('assistant.import.resEnrolled', 'Зачислено существующих')}: <strong>{result.enrolledExisting}</strong></li>
          )}
          {result.createdGroups.length > 0 && (
            <li>• {t('assistant.import.resGroups', 'Создано групп')}: <strong>{result.createdGroups.length}</strong> ({result.createdGroups.map(g => g.name).join(', ')})</li>
          )}
          {result.skipped > 0 && (
            <li className="text-slate-500 dark:text-slate-400">• {t('assistant.import.resSkipped', 'Пропущено')}: {result.skipped}</li>
          )}
        </ul>
        {result.failures.length > 0 && (
          <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            {result.failures.map((f, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>{f.name}: {f.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs text-slate-400 dark:text-slate-500">
        {t('assistant.import.cancelled', 'Импорт отменён')}
      </div>
    );
  }

  // ── Reusable bits ──
  const seg = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
      active ? 'bg-primary-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`;

  const StudentRow: React.FC<{ row: RowState; usable: boolean; onPatch: (p: Partial<RowState>) => void; allowAdd: boolean }> =
    ({ row, usable, onPatch, allowAdd }) => {
      if (row.duplicate) {
        const adding = allowAdd && usable && row.dupAction === 'add';
        return (
          <div className="flex items-start gap-2 py-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-800 dark:text-slate-100 truncate">
                {row.name}{row.phone ? <span className="text-slate-400"> · {row.phone}</span> : null}
              </div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400 truncate">
                {t('assistant.import.dupOf', 'Возможный дубликат')}: {row.duplicate.name}
              </div>
              {allowAdd && (
                <div className="mt-1 inline-flex bg-slate-100 dark:bg-slate-900/60 rounded-lg p-0.5">
                  <button className={seg(row.dupAction === 'skip')} onClick={() => onPatch({ dupAction: 'skip' })}>
                    {t('assistant.import.dupSkip', 'Не добавлять')}
                  </button>
                  <button
                    className={seg(row.dupAction === 'add') + (usable ? '' : ' opacity-40 cursor-not-allowed')}
                    onClick={() => usable && onPatch({ dupAction: 'add' })}
                    disabled={!usable}
                    title={usable ? '' : t('assistant.import.needGroup', 'Сначала выберите или создайте группу')}
                  >
                    {t('assistant.import.dupAdd', 'В группу')}
                  </button>
                </div>
              )}
            </div>
            {adding && <span className="text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">{t('assistant.import.willEnroll', 'зачислить')}</span>}
          </div>
        );
      }
      return (
        <label className="flex items-center gap-2 py-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={row.include}
            onChange={e => onPatch({ include: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
          />
          <span className={`text-sm truncate ${row.include ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through'}`}>
            {row.name}{row.phone ? <span className="text-slate-400 no-underline"> · {row.phone}</span> : null}
          </span>
        </label>
      );
    };

  return (
    <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
        <div className="w-7 h-7 rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
            {t('assistant.import.title', 'Импорт из скриншота')}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('assistant.import.subtitle', {
              students: plan.counts.students, groups: plan.counts.groups,
              defaultValue: 'Распознано: {{students}} студ., {{groups}} групп',
            })}
            {plan.counts.duplicates > 0 && ` · ${t('assistant.import.dupCount', { count: plan.counts.duplicates, defaultValue: 'дубликатов: {{count}}' })}`}
          </p>
        </div>
      </div>

      <div className="p-3 space-y-3 max-h-[46vh] overflow-y-auto">
        {/* Default branch */}
        {catalog.branches.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{t('assistant.import.branch', 'Филиал')}</label>
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="flex-1 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-900 dark:text-slate-100"
            >
              <option value="">{t('assistant.import.branchNone', 'Не указывать')}</option>
              {catalog.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {/* Groups */}
        {groups.map((g, gi) => {
          const usable = groupUsable(g);
          const needsCourse = g.mode === 'new' && !g.courseId;
          return (
            <div key={g.key} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-2.5 pt-2.5 pb-2 bg-slate-50/70 dark:bg-slate-900/30 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <Layers className="w-3.5 h-3.5" />
                  {g.parsedName
                    ? <span>{t('assistant.import.parsedGroup', 'Группа на скрине')}: <strong className="text-slate-700 dark:text-slate-200">«{g.parsedName}»</strong></span>
                    : <span>{t('assistant.import.noGroupName', 'Группа без названия')}</span>}
                  <span className="ml-auto">{g.students.length} {t('assistant.import.peopleShort', 'чел.')}</span>
                </div>

                {/* Mode switch */}
                <div className="inline-flex bg-slate-100 dark:bg-slate-900/60 rounded-lg p-0.5 flex-wrap">
                  {canCreateGroups && (
                    <button className={seg(g.mode === 'new')} onClick={() => patchGroup(gi, { mode: 'new' })}>
                      {t('assistant.import.modeNew', 'Новая группа')}
                    </button>
                  )}
                  <button className={seg(g.mode === 'existing')} onClick={() => patchGroup(gi, { mode: 'existing' })}>
                    {t('assistant.import.modeExisting', 'В существующую')}
                  </button>
                  <button className={seg(g.mode === 'skip')} onClick={() => patchGroup(gi, { mode: 'skip' })}>
                    {t('assistant.import.modeSkip', 'Без группы')}
                  </button>
                </div>

                {g.mode === 'new' && (
                  <div className="space-y-1.5">
                    <input
                      value={g.name}
                      onChange={e => patchGroup(gi, { name: e.target.value })}
                      placeholder={t('assistant.import.groupNamePh', 'Название новой группы')}
                      className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-900 dark:text-slate-100"
                    />
                    <div className="flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <select
                        value={g.courseId}
                        onChange={e => patchGroup(gi, { courseId: e.target.value })}
                        className={`flex-1 text-sm bg-white dark:bg-slate-900 border rounded-lg px-2 py-1.5 text-slate-900 dark:text-slate-100 ${
                          needsCourse ? 'border-amber-400 dark:border-amber-600' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <option value="">{t('assistant.import.pickCourse', 'Выберите курс…')}</option>
                        {catalog.courses.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.title}{c.price ? ` · ${c.price}${c.paymentFormat === 'one-time' ? '' : '/мес'}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {catalog.courses.length === 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('assistant.import.noCourses', 'Сначала создайте курс, чтобы открыть группу.')}</p>
                    )}
                  </div>
                )}

                {g.mode === 'existing' && (
                  <select
                    value={g.groupId}
                    onChange={e => patchGroup(gi, { groupId: e.target.value })}
                    className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">{t('assistant.import.pickGroup', 'Выберите группу…')}</option>
                    {catalog.groups.map(cg => (
                      <option key={cg.id} value={cg.id}>{cg.name}{cg.courseName ? ` · ${cg.courseName}` : ''}</option>
                    ))}
                  </select>
                )}

                {g.mode === 'skip' && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('assistant.import.skipNote', 'Студенты будут добавлены в центр без группы.')}
                  </p>
                )}
              </div>

              <div className="px-2.5 py-1 divide-y divide-slate-100 dark:divide-slate-700/50">
                {g.students.map((row, ri) => (
                  <StudentRow
                    key={ri}
                    row={row}
                    usable={usable}
                    allowAdd={g.mode !== 'skip'}
                    onPatch={p => patchRow(gi, ri, p)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Ungrouped */}
        {ungrouped.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/30 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              {t('assistant.import.ungrouped', 'Без группы')}
              <span className="ml-auto">{ungrouped.length} {t('assistant.import.peopleShort', 'чел.')}</span>
            </div>
            <div className="px-2.5 py-1 divide-y divide-slate-100 dark:divide-slate-700/50">
              {ungrouped.map((row, ri) => (
                <StudentRow key={ri} row={row} usable={false} allowAdd={false} onPatch={p => patchLoose(ri, p)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 space-y-2">
        {incompleteGroups.length > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <CircleAlert className="w-3.5 h-3.5 shrink-0" />
            {t('assistant.import.incompleteWarn', 'Укажите курс или группу назначения, чтобы продолжить.')}
          </p>
        )}
        {error && (
          <p className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /><span>{error}</span>
          </p>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('assistant.import.footerSummary', {
            create: summary.toCreate, enroll: summary.toEnroll, groups: summary.newGroups,
            defaultValue: 'Будет добавлено: {{create}} новых, {{enroll}} зачислено, {{groups}} новых групп',
          })}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={commit}
            disabled={committing || nothingToDo || incompleteGroups.length > 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors active:scale-[0.99]"
          >
            {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('assistant.import.confirm', 'Импортировать')}
          </button>
          <button
            onClick={() => { setCancelled(true); onCancel(); }}
            disabled={committing}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {t('assistant.import.cancel', 'Отмена')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportPreviewCard;
