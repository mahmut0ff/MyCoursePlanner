import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Building2, Info, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiCreateCompensationRule, apiUpdateCompensationRule } from '../../../lib/api';
import { useBranch } from '../../../contexts/BranchContext';
import { CURRENCY_SUFFIX } from '../../../lib/money';
import type { CompensationRule, Course, Group, PayComponent } from '../../../types';
import {
  COMPONENT_KINDS,
  componentKindLabel,
  currentPeriodKey,
  isSessionBased,
  minorToSomInput,
  bpToPercentInput,
  percentInputToBp,
  somInputToMinor,
  type Translate,
} from '../payrollFormat';

interface Props {
  /** null = создание. Редактирование меняет только label/components/effectiveTo — так устроен сервер. */
  rule: CompensationRule | null;
  teachers: any[];
  courses: Course[];
  groups: Group[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Как ограничена область компонента.
 *
 * ВЗАИМОИСКЛЮЧАЮЩИЙ выбор, а не два независимых списка, и это не косметика.
 * Движок (matchesScope в payroll-engine.ts) смотрит groupIds ПЕРВЫМИ и, если
 * они непусты, courseIds не смотрит вообще. Форма, показывающая «Курсы» и
 * «Группы» рядом, обещает объединение — директор, выбравший «курс А + группа Б»,
 * платил бы молча только по группе Б. Семантику движка менять нельзя (она под
 * тестами), поэтому правду говорит форма.
 */
type ScopeMode = 'all' | 'groups' | 'courses';

/** Черновик компонента: суммы живут строками, пока их не подтвердили. */
interface ComponentDraft {
  key: string;
  kind: PayComponent['kind'];
  /** В СОМАХ — директор минорных единиц не видит никогда. */
  amount: string;
  /** В процентах: «20», хранится как 2000. */
  percent: string;
  scopeMode: ScopeMode;
  courseIds: string[];
  groupIds: string[];
}

let draftSeq = 0;
const newDraft = (kind: PayComponent['kind']): ComponentDraft => ({
  key: `c${++draftSeq}`,
  kind,
  amount: '',
  percent: '',
  scopeMode: 'all',
  courseIds: [],
  groupIds: [],
});

/** Существующее правило → черновики формы. Обратная операция к buildComponents. */
const toDrafts = (components: PayComponent[] | undefined): ComponentDraft[] => {
  const list = (components ?? []).map((c): ComponentDraft => {
    const courseIds = c.kind === 'salary' ? [] : [...(c.scope?.courseIds ?? [])];
    const groupIds = c.kind === 'salary' ? [] : [...(c.scope?.groupIds ?? [])];
    return {
      key: `c${++draftSeq}`,
      kind: c.kind,
      amount: c.kind === 'percent_revenue' ? '' : minorToSomInput((c as any).amountMinor),
      percent: c.kind === 'percent_revenue' ? bpToPercentInput(c.percentBp) : '',
      // Старая ставка могла сохранить оба списка. Открываем её в режиме «по
      // группам» — именно по нему движок её и считал; курсы там были мёртвым
      // грузом, и показывать их выбранными значило бы повторить ту же ложь.
      scopeMode: groupIds.length ? 'groups' : courseIds.length ? 'courses' : 'all',
      courseIds,
      groupIds,
    };
  });
  return list.length ? list : [newDraft('salary')];
};

/**
 * Какие режимы предлагать. У процента «все занятия» нет: пустая область на нём
 * гарантированно даёт ноль, и предлагать вариант, который всегда упрётся в
 * ошибку, — та же ложь, только вежливее.
 */
const scopeModeOptions = (kind: PayComponent['kind']): ScopeMode[] =>
  kind === 'percent_revenue' ? ['groups', 'courses'] : ['all', 'groups', 'courses'];

const scopeModeLabel = (mode: ScopeMode, t: Translate): string =>
  mode === 'all' ? t('payroll.scopeModeAll', 'Все занятия')
  : mode === 'groups' ? t('payroll.scopeModeGroups', 'По группам')
  : t('payroll.scopeModeCourses', 'По курсам');

/** Смена вида компонента может сделать текущий режим области недопустимым. */
const fitScopeMode = (mode: ScopeMode, kind: PayComponent['kind']): ScopeMode =>
  scopeModeOptions(kind).includes(mode) ? mode : 'groups';

const teacherKey = (m: any) => String(m?.uid || m?.id || '');

const CheckList: React.FC<{
  title: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}> = ({ title, items, selected, onToggle }) => (
  <div>
    <p className="text-xs font-medium text-slate-500 mb-1">{title}</p>
    <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-700/50">
      {items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-400">—</p>
      ) : items.map(item => (
        <label key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={() => onToggle(item.id)}
            className="rounded border-slate-300"
          />
          <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
        </label>
      ))}
    </div>
  </div>
);

/**
 * Редактор ставки. Смысл модели — СТЕКОВАНИЕ компонентов: «оклад + процент с
 * группы» это одна ставка из двух компонентов, а не два правила. Поэтому
 * компоненты добавляются списком, и каждый несёт свою область действия.
 *
 * Честность про журнал вынесена в тело формы, а не в тултип: директор,
 * выбравший почасовую оплату и не знающий, что часы берутся только из отметок
 * посещаемости, получит молча заниженную зарплату человека.
 */
const RuleEditorModal: React.FC<Props> = ({ rule, teachers, courses, groups, onClose, onSaved }) => {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;
  const { activeBranchId, branches } = useBranch();
  const editing = Boolean(rule);

  /**
   * Филиал ставки.
   *
   * При СОЗДАНИИ он берётся из переключателя филиалов и уезжает на сервер явно:
   * POST штампа активного филиала не получает, и пропуск поля отдал бы решение
   * серверному умолчанию — ставки оседали бы неизвестно где. При РЕДАКТИРОВАНИИ
   * филиал не меняется: сервер правит только label/components/effectiveTo.
   */
  const ruleBranchId = editing ? (rule?.branchId ?? null) : activeBranchId;
  const branchLabel = ruleBranchId
    ? (branches.find(b => b.id === ruleBranchId)?.name
       || t('payroll.branchUnknown', 'Филиал {{id}}', { id: ruleBranchId }))
    : t('payroll.branchOrgWide', 'Вся организация (все филиалы)');

  const [teacherId, setTeacherId] = useState(rule?.teacherId || '');
  const [label, setLabel] = useState(rule?.label || '');
  const [effectiveFrom, setEffectiveFrom] = useState(rule?.effectiveFrom || currentPeriodKey());
  const [effectiveTo, setEffectiveTo] = useState(rule?.effectiveTo || '');
  const [drafts, setDrafts] = useState<ComponentDraft[]>(() => toDrafts(rule?.components));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const courseItems = useMemo(
    () => courses.map(c => ({ id: c.id, label: c.title })),
    [courses],
  );
  const groupItems = useMemo(
    () => groups.map(g => ({ id: g.id, label: g.courseName ? `${g.name} · ${g.courseName}` : g.name })),
    [groups],
  );

  const patch = (key: string, next: Partial<ComponentDraft>) =>
    setDrafts(list => list.map(d => (d.key === key ? { ...d, ...next } : d)));

  const toggleIn = (key: string, field: 'courseIds' | 'groupIds', id: string) =>
    setDrafts(list => list.map(d => {
      if (d.key !== key) return d;
      const current = d[field];
      return { ...d, [field]: current.includes(id) ? current.filter(x => x !== id) : [...current, id] };
    }));

  /**
   * Черновики → компоненты сервера. Валидируем здесь же: сервер вернёт «Компонент
   * №2: amountMinor должен быть...», и такой текст директору ничего не объясняет.
   */
  const buildComponents = (): { components?: PayComponent[]; error?: string } => {
    if (!drafts.length) return { error: t('payroll.needComponent', 'Добавьте хотя бы один компонент ставки') };
    const components: PayComponent[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const at = t('payroll.componentNo', 'Компонент №{{n}}', { n: i + 1 });
      // Пишем РОВНО один список — тот, что выбран. Отправить оба значило бы
      // сохранить в базе поле, которое движок не читает, и следующий редактор
      // снова показал бы его как действующее.
      const scope =
        d.scopeMode === 'groups' ? { groupIds: d.groupIds }
        : d.scopeMode === 'courses' ? { courseIds: d.courseIds }
        : {};
      const scopeEmpty =
        (d.scopeMode === 'groups' && !d.groupIds.length)
        || (d.scopeMode === 'courses' && !d.courseIds.length);
      if (d.kind !== 'salary' && scopeEmpty) {
        return {
          error: `${at}: ${d.scopeMode === 'groups'
            ? t('payroll.needGroups', 'отметьте хотя бы одну группу')
            : t('payroll.needCourses', 'отметьте хотя бы один курс')}`,
        };
      }

      if (d.kind === 'percent_revenue') {
        const percentBp = percentInputToBp(d.percent);
        if (percentBp === null) {
          return { error: `${at}: ${t('payroll.badPercent', 'укажите процент от 0,01 до 100')}` };
        }
        if (d.scopeMode === 'all') {
          // Пустая область на проценте — это гарантированный ноль (движок не
          // угадывает, чья выручка). Ловим здесь, а не диагностикой постфактум.
          return { error: `${at}: ${t('payroll.percentNeedsScope', 'выберите курсы или группы — без них процент даст 0')}` };
        }
        components.push({ kind: 'percent_revenue', percentBp, base: 'collected', scope });
        continue;
      }

      const amountMinor = somInputToMinor(d.amount);
      if (amountMinor === null) {
        return { error: `${at}: ${t('payroll.badAmount', 'укажите сумму больше нуля')}` };
      }
      if (d.kind === 'salary') {
        components.push({ kind: 'salary', amountMinor });
        continue;
      }
      components.push({ kind: d.kind, amountMinor, scope });
    }
    return { components };
  };

  const handleSave = async () => {
    setError('');
    if (!editing && !teacherId) {
      setError(t('payroll.needTeacher', 'Выберите преподавателя'));
      return;
    }
    if (!label.trim()) {
      setError(t('payroll.needLabel', 'Название ставки обязательно — оно печатается на расчётном листе'));
      return;
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      setError(t('payroll.badRange', 'Конец периода не может быть раньше начала'));
      return;
    }
    const { components, error: componentsError } = buildComponents();
    if (componentsError || !components) {
      setError(componentsError || '');
      return;
    }

    setSaving(true);
    try {
      if (editing && rule) {
        await apiUpdateCompensationRule({
          id: rule.id,
          label: label.trim(),
          components,
          effectiveTo: effectiveTo || null,
        });
        toast.success(t('payroll.ruleSaved', 'Ставка сохранена'));
      } else {
        await apiCreateCompensationRule({
          teacherId,
          label: label.trim(),
          components,
          effectiveFrom,
          effectiveTo: effectiveTo || null,
          // Явно, включая null: «Все филиалы» — это осознанная общеорганизационная
          // ставка, а не забытое поле.
          branchId: ruleBranchId,
        });
        toast.success(t('payroll.ruleCreated', 'Ставка создана'));
      }
      onSaved();
      onClose();
    } catch (e: any) {
      // 409 несёт человеческое объяснение с сервера (пересечение периодов либо
      // «по ставке уже утверждена ведомость») — показываем его дословно.
      setError(e?.message || t('payroll.saveFailed', 'Не удалось сохранить ставку'));
    } finally {
      setSaving(false);
    }
  };

  const hasSessionBased = drafts.some(d => isSessionBased(d.kind));

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {editing ? t('payroll.editRule', 'Изменить ставку') : t('payroll.newRule', 'Новая ставка')}
          </h2>
          <button onClick={onClose} disabled={saving} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50" aria-label={t('payroll.close', 'Закрыть')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.teacher', 'Преподаватель')} *
              </label>
              {editing ? (
                <div className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white">
                  {teachers.find(m => teacherKey(m) === rule?.teacherId)?.displayName || rule?.teacherId}
                </div>
              ) : (
                <select
                  value={teacherId}
                  onChange={e => setTeacherId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
                >
                  <option value="">{t('payroll.selectTeacher', 'Выберите преподавателя...')}</option>
                  {teachers.map(m => (
                    <option key={teacherKey(m)} value={teacherKey(m)}>{m.displayName || teacherKey(m)}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.ruleLabel', 'Название ставки')} *
              </label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder={t('payroll.ruleLabelPlaceholder', 'Оклад + 20% с группы А')}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.effectiveFrom', 'Действует с')} *
              </label>
              <input
                type="month"
                value={effectiveFrom}
                disabled={editing}
                onChange={e => setEffectiveFrom(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.effectiveTo', 'Действует по')}
              </label>
              <input
                type="month"
                value={effectiveTo}
                onChange={e => setEffectiveTo(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
              />
              <p className="text-[11px] text-slate-400 mt-1">{t('payroll.openEndedHint', 'Пусто — бессрочно')}</p>
            </div>
          </div>

          {/* Филиал ставки виден до сохранения: ведомость филиала берёт только
              ставки этого филиала, поэтому ставка, заведённая «не там», просто
              никому ничего не начислит — и молча. */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('payroll.ruleBranch', 'Филиал ставки')}
            </label>
            <div className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              {branchLabel}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {editing
                ? t('payroll.ruleBranchFixed', 'Филиал ставки не меняется. Чтобы перенести оплату в другой филиал, заведите новую ставку с более поздним месяцем начала.')
                : ruleBranchId
                  ? t('payroll.ruleBranchFromSwitcher', 'Берётся из переключателя филиалов. Эта ставка попадёт только в ведомость выбранного филиала.')
                  : t('payroll.ruleBranchOrgWideHint', 'Выбран режим «Все филиалы», поэтому ставка будет общеорганизационной: она попадёт в общую ведомость, но не в ведомость отдельного филиала. Чтобы привязать её к филиалу, выберите его в переключателе.')}
            </p>
          </div>

          {/* Версионирование объясняется прямо здесь: иначе директор ищет кнопку
              «изменить оклад с сентября» и не находит её. */}
          <div className="flex gap-2 p-3 rounded-xl bg-sky-50 dark:bg-sky-900/10 text-xs text-sky-800 dark:text-sky-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              {t(
                'payroll.versioningHint',
                'Чтобы изменить ставку, создайте новую с более поздним месяцем начала — действующая закроется автоматически. История прошлых месяцев не переписывается.',
              )}
            </p>
          </div>

          {/* ── Компоненты ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('payroll.components', 'Из чего складывается оплата')}
              </h3>
              <p className="text-[11px] text-slate-400">{t('payroll.componentsHint', 'Компоненты складываются')}</p>
            </div>

            <div className="space-y-3">
              {drafts.map((d, index) => (
                <div key={d.key} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/60 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center gap-3">
                    <select
                      value={d.kind}
                      onChange={e => {
                        const kind = e.target.value as PayComponent['kind'];
                        patch(d.key, { kind, scopeMode: fitScopeMode(d.scopeMode, kind) });
                      }}
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                      aria-label={t('payroll.componentNo', 'Компонент №{{n}}', { n: index + 1 })}
                    >
                      {COMPONENT_KINDS.map(kind => (
                        <option key={kind} value={kind}>{componentKindLabel(kind, tr)}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setDrafts(list => list.filter(x => x.key !== d.key))}
                      className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                      aria-label={t('payroll.removeComponent', 'Убрать компонент')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {d.kind === 'percent_revenue' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {t('payroll.percentField', 'Процент')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={d.percent}
                          onChange={e => patch(d.key, { percent: e.target.value })}
                          placeholder="20"
                          className="w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                        />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                      {/* База процента названа буквально: «от собранного», не «от
                          выставленного». Это разные числа, и путаница здесь стоит денег. */}
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                        {t(
                          'payroll.percentBaseHint',
                          'Процент считается от фактически полученных денег по выбранным курсам и группам, а не от выставленных счетов. Возвраты уменьшают базу.',
                        )}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {t('payroll.amountField', 'Сумма')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={d.amount}
                          onChange={e => patch(d.key, { amount: e.target.value })}
                          placeholder="30000"
                          className="w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
                        />
                        <span className="text-sm text-slate-500">{CURRENCY_SUFFIX}</span>
                      </div>
                    </div>
                  )}

                  {isSessionBased(d.kind) && (
                    <div className="flex gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-[11px] text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>
                        {t(
                          'payroll.sessionBasedWarning',
                          'Считаются только занятия, записанные через журнал посещаемости с выбранной группой. Занятие, где не выбран преподаватель, не начисляется никому; занятие без указанной длительности не попадает в почасовую оплату. Проверяйте блок «Пропущенные записи» в ведомости.',
                        )}
                      </p>
                    </div>
                  )}

                  {d.kind !== 'salary' && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-500">
                        {t('payroll.scopeModeLabel', 'За что начисляется')}
                      </p>
                      {/* Переключатель, а не два списка рядом: выбрать можно ЛИБО
                          группы, ЛИБО курсы. Так форма совпадает с тем, что
                          считает движок, и вопрос «а если и то и другое?» просто
                          не возникает. */}
                      <div className="flex flex-wrap gap-2">
                        {scopeModeOptions(d.kind).map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => patch(d.key, { scopeMode: mode })}
                            aria-pressed={d.scopeMode === mode}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                              d.scopeMode === mode
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {scopeModeLabel(mode, tr)}
                          </button>
                        ))}
                      </div>

                      {d.scopeMode === 'groups' && (
                        <CheckList
                          title={t('payroll.scopeGroups', 'Группы')}
                          items={groupItems}
                          selected={d.groupIds}
                          onToggle={id => toggleIn(d.key, 'groupIds', id)}
                        />
                      )}
                      {d.scopeMode === 'courses' && (
                        <CheckList
                          title={t('payroll.scopeCourses', 'Курсы')}
                          items={courseItems}
                          selected={d.courseIds}
                          onToggle={id => toggleIn(d.key, 'courseIds', id)}
                        />
                      )}

                      <p className="text-[11px] text-slate-400">
                        {d.scopeMode === 'all'
                          ? t('payroll.scopeHintAll', 'Считаются все занятия этого преподавателя, независимо от курса и группы.')
                          : d.scopeMode === 'groups'
                            ? t('payroll.scopeHintGroups', 'Считается только то, что относится к отмеченным группам. Курсы при выборе по группам не участвуют — группа точнее курса.')
                            : t('payroll.scopeHintCourses', 'Считается всё по отмеченным курсам — все их группы целиком.')}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setDrafts(list => [...list, newDraft('salary')])}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-4 h-4" />{t('payroll.addComponent', 'Добавить компонент')}
            </button>

            {hasSessionBased && (
              <p className="mt-3 text-[11px] text-slate-500">
                {t(
                  'payroll.sessionBasedFooter',
                  'Записи занятий появляются только при отметке посещаемости. Если журнал не ведут, оплата за занятие, час и студента будет нулевой.',
                )}
              </p>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50">
            {t('payroll.cancel', 'Отмена')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all"
          >
            {saving ? t('payroll.saving', 'Сохранение...') : t('payroll.save', 'Сохранить')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RuleEditorModal;
