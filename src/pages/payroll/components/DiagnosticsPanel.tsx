import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/** Структурная диагностика движка. Коды стабильны — см. payroll-engine.ts. */
export interface PayrollDiagnostic {
  code: string;
  message: string;
  count: number;
  sample?: string[];
  teacherId?: string;
  ruleId?: string;
}

interface Props {
  diagnostics: PayrollDiagnostic[];
  /** Имя преподавателя по id — диагностика ссылается на uid, директор его не знает. */
  teacherName: (id: string) => string;
}

/** Заголовок группы по коду. Сообщение с сервера уже по-русски — заголовок его называет. */
const CODE_TITLES: Record<string, { key: string; fallback: string }> = {
  session_no_teacher: { key: 'payroll.diagNoTeacher', fallback: 'Занятия без преподавателя' },
  session_no_duration: { key: 'payroll.diagNoDuration', fallback: 'Занятия без длительности' },
  percent_scope_empty: { key: 'payroll.diagScopeEmpty', fallback: 'Процент без области действия' },
  percent_base_negative: { key: 'payroll.diagBaseNegative', fallback: 'Возвраты превысили сборы' },
  revenue_unattributed: { key: 'payroll.diagUnattributed', fallback: 'Выручка вне областей действия' },
  teacher_without_rule: { key: 'payroll.diagNoRule', fallback: 'Преподаватели без ставки' },
  overlapping_rules: { key: 'payroll.diagOverlap', fallback: 'Пересекающиеся ставки' },
  rule_no_components: { key: 'payroll.diagNoComponents', fallback: 'Ставка без компонентов' },
};

/**
 * «Пропущенные записи» — это функция, а не лог ошибок.
 *
 * Сумма в ведомости может быть меньше ожидаемой по совершенно законным
 * причинам: занятие отмечено без преподавателя, у урока не проставлена
 * длительность, платёж пришёл мимо всех областей действия. Директор, который
 * этого не видит, либо переплатит, либо недоплатит человеку и не узнает об этом.
 * Поэтому блок стоит НАД таблицей и не сворачивается по умолчанию.
 */
const DiagnosticsPanel: React.FC<Props> = ({ diagnostics, teacherName }) => {
  const { t } = useTranslation();

  // Диагностики приходят и построчные, и глобальные — одинаковые схлопываем,
  // иначе одна и та же причина повторится столько раз, сколько у неё строк.
  const groups = useMemo(() => {
    const map = new Map<string, { code: string; count: number; messages: Set<string>; teachers: Set<string> }>();
    for (const d of diagnostics ?? []) {
      const entry = map.get(d.code) ?? { code: d.code, count: 0, messages: new Set<string>(), teachers: new Set<string>() };
      entry.count += Number(d.count || 0);
      entry.messages.add(d.message);
      if (d.teacherId) entry.teachers.add(d.teacherId);
      map.set(d.code, entry);
    }
    return [...map.values()];
  }, [diagnostics]);

  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/10 p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            {t('payroll.diagnosticsClean', 'Пропущенных записей нет')}
          </p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
            {t('payroll.diagnosticsCleanHint', 'Все занятия и платежи в этом месяце учтены ставками.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
            {t('payroll.diagnosticsTitle', 'Пропущенные записи')}
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-400/80 mt-0.5">
            {t(
              'payroll.diagnosticsHint',
              'Эти данные не попали в расчёт. Пока они не исправлены, суммы в ведомости ниже фактических.',
            )}
          </p>

          <ul className="mt-3 space-y-2">
            {groups.map(group => {
              const title = CODE_TITLES[group.code];
              const teachers = [...group.teachers].map(teacherName).filter(Boolean);
              return (
                <li key={group.code} className="rounded-xl bg-white/70 dark:bg-slate-900/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                      {title ? t(title.key, title.fallback) : group.code}
                    </p>
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-xs font-bold">
                      {group.count}
                    </span>
                  </div>
                  {[...group.messages].map((message, i) => (
                    <p key={i} className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-1">{message}</p>
                  ))}
                  {teachers.length > 0 && (
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1">
                      {t('payroll.diagTeachers', 'Преподаватели: {{names}}', { names: teachers.join(', ') })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DiagnosticsPanel;
