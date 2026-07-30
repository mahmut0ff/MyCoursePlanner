import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ru, enUS, type Locale } from 'date-fns/locale';
import {
  Activity, GraduationCap, CalendarCheck, CheckSquare, FilePlus2,
  ClipboardList, Gamepad2, BookOpen, LogIn, Download, ArrowUpDown, X, Users, Zap, Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
import { useOrgPresence } from '../../hooks/useOrgPresence';
import { apiGetTeacherActivity, apiGetTeacherTimeline } from '../../lib/api';
import { formatNumber } from '../../lib/money';
import { buildCsv, downloadCsv } from '../../lib/csv';
import { kyrgyz } from '../../lib/dateFnsKyrgyz';
import { PresenceDot } from '../../components/presence/PresenceBadge';
import EmptyState from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';

// ── Типы ответа api-teacher-activity ──
interface KpiRow {
  teacherId: string;
  name: string;
  counts: Record<string, number>;
  totalActions: number;
  activeDays: number;
  engagementPoints: number;
  consistencyPct: number;
  kpiScore: number;
  lastActivityAt: string | null;
}
interface KpiTotals {
  teachers: number;
  activeTeachers: number;
  totalActions: number;
  avgActionsPerTeacher: number;
  topTeacherId: string | null;
}
interface KpiResponse {
  period: { period: string; startIso: string; endIso: string; expectedActiveDays: number } | null;
  rows: KpiRow[];
  totals: KpiTotals;
}
interface TimelineEvent {
  id: string;
  type: string;
  count: number;
  entityId: string | null;
  entityLabel: string | null;
  createdAt: string | null;
  meta: Record<string, unknown> | null;
}

const DATE_LOCALES: Record<string, Locale> = { ru, en: enUS, kg: kyrgyz };

// Метаданные типов действий — те же ключи, что ACTIVITY_WEIGHTS на сервере.
const TYPE_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  grade_set: { label: 'Оценки', icon: GraduationCap, color: 'text-blue-500' },
  attendance_marked: { label: 'Посещаемость', icon: CalendarCheck, color: 'text-emerald-500' },
  homework_checked: { label: 'Проверка ДЗ', icon: CheckSquare, color: 'text-violet-500' },
  homework_created: { label: 'Создание ДЗ', icon: FilePlus2, color: 'text-fuchsia-500' },
  lesson_created: { label: 'Уроки', icon: BookOpen, color: 'text-amber-500' },
  quiz_created: { label: 'Квизы', icon: Gamepad2, color: 'text-cyan-500' },
  exam_created: { label: 'Экзамены', icon: ClipboardList, color: 'text-rose-500' },
  login: { label: 'Входы', icon: LogIn, color: 'text-slate-400' },
};

const PERIODS = ['current_month', 'last_month', 'quarter', 'year', 'all'] as const;
type SortKey = 'name' | 'grade_set' | 'attendance_marked' | 'homework_checked' | 'created' | 'login' | 'activeDays' | 'kpiScore';

const createdOf = (r: KpiRow) =>
  (r.counts.exam_created || 0) + (r.counts.quiz_created || 0) + (r.counts.lesson_created || 0) + (r.counts.homework_created || 0);

const scoreTone = (s: number) =>
  s >= 70 ? { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' }
    : s >= 40 ? { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' }
      : { text: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500' };

const TeacherActivityPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { organizationId } = useAuth();
  const { activeBranchId } = useBranch();
  const presence = useOrgPresence(organizationId);

  const [period, setPeriod] = useState<string>('current_month');
  const [data, setData] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'kpiScore', dir: 'desc' });
  const [selected, setSelected] = useState<KpiRow | null>(null);

  const rel = useCallback(
    (iso: string | null) => {
      if (!iso) return '—';
      const loc = DATE_LOCALES[i18n.language.split('-')[0]] ?? ru;
      try {
        return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: loc });
      } catch {
        return '—';
      }
    },
    [i18n.language],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiGetTeacherActivity({ period })
      .then((res: KpiResponse) => setData(res || { period: null, rows: [], totals: emptyTotals() }))
      .catch((e: any) => setError(e?.message || t('teacherActivity.loadFailed', 'Не удалось загрузить активность')))
      .finally(() => setLoading(false));
  }, [period, t]);

  // activeBranchId в зависимостях: интерцептор штампует его на GET, смена филиала должна перезагрузить.
  useEffect(() => { load(); }, [load, activeBranchId]);

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? emptyTotals();
  const topRow = totals.topTeacherId ? rows.find(r => r.teacherId === totals.topTeacherId) : null;

  const sortedRows = useMemo(() => {
    const val = (r: KpiRow): number | string => {
      switch (sort.key) {
        case 'name': return r.name.toLowerCase();
        case 'created': return createdOf(r);
        case 'grade_set': return r.counts.grade_set || 0;
        case 'attendance_marked': return r.counts.attendance_marked || 0;
        case 'homework_checked': return r.counts.homework_checked || 0;
        case 'login': return r.counts.login || 0;
        case 'activeDays': return r.activeDays;
        default: return r.kpiScore;
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = val(a); const vb = val(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [rows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  const exportCsv = () => {
    const headers = ['Преподаватель', 'Оценки', 'Посещаемость', 'Проверка ДЗ', 'Создано', 'Входы', 'Активных дней', 'KPI'];
    const body = sortedRows.map(r => [
      r.name, r.counts.grade_set || 0, r.counts.attendance_marked || 0, r.counts.homework_checked || 0,
      createdOf(r), r.counts.login || 0, r.activeDays, r.kpiScore,
    ]);
    downloadCsv(`teacher-activity-${period}.csv`, buildCsv(headers, body));
  };

  const summary = [
    { label: t('teacherActivity.activeTeachers', 'Активных преподавателей'), value: `${totals.activeTeachers} / ${totals.teachers}`, icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: t('teacherActivity.totalActions', 'Всего действий'), value: formatNumber(totals.totalActions), icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: t('teacherActivity.avgPerTeacher', 'В среднем на преподавателя'), value: formatNumber(totals.avgActionsPerTeacher), icon: Zap, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: t('teacherActivity.topTeacher', 'Лидер'), value: topRow ? topRow.name : '—', sub: topRow ? `${topRow.kpiScore} KPI` : undefined, icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary-500" />
            {t('teacherActivity.title', 'Активность преподавателей')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('teacherActivity.subtitle', 'Кто ставит оценки и посещаемость, проверяет ДЗ, создаёт материалы и когда заходит — с KPI по каждому преподавателю.')}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          <Download className="w-4 h-4" /> {t('teacherActivity.export', 'Экспорт CSV')}
        </button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              period === p
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
          >
            {t(`teacherActivity.period.${p}`, PERIOD_FALLBACK[p])}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-sm border border-rose-100 dark:border-rose-900/40">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
          <CardSkeleton />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {summary.map(s => (
              <div key={s.label} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
                  <div className={`p-2 rounded-lg ${s.bg} ${s.color}`}><s.icon className="w-4 h-4" /></div>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white truncate" title={String(s.value)}>{s.value}</h3>
                {s.sub && <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>}
              </div>
            ))}
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <EmptyState
                icon={Activity}
                title={t('teacherActivity.emptyTitle', 'Пока нет данных об активности')}
                description={t('teacherActivity.emptyDesc', 'Как только преподаватели начнут ставить оценки, отмечать посещаемость и создавать материалы, здесь появится их активность и KPI.')}
              />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <Th label={t('teacherActivity.col.teacher', 'Преподаватель')} sortKey="name" sort={sort} onSort={toggleSort} align="left" />
                      <Th label={t('teacherActivity.col.grades', 'Оценки')} sortKey="grade_set" sort={sort} onSort={toggleSort} />
                      <Th label={t('teacherActivity.col.attendance', 'Посещ.')} sortKey="attendance_marked" sort={sort} onSort={toggleSort} />
                      <Th label={t('teacherActivity.col.hw', 'ДЗ')} sortKey="homework_checked" sort={sort} onSort={toggleSort} />
                      <Th label={t('teacherActivity.col.created', 'Создано')} sortKey="created" sort={sort} onSort={toggleSort} />
                      <Th label={t('teacherActivity.col.logins', 'Входы')} sortKey="login" sort={sort} onSort={toggleSort} />
                      <Th label={t('teacherActivity.col.activeDays', 'Дней')} sortKey="activeDays" sort={sort} onSort={toggleSort} />
                      <Th label="KPI" sortKey="kpiScore" sort={sort} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {sortedRows.map(r => {
                      const tone = scoreTone(r.kpiScore);
                      const online = presence.isOnline(r.teacherId);
                      return (
                        <tr
                          key={r.teacherId}
                          onClick={() => setSelected(r)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="relative shrink-0">
                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-500 dark:text-slate-300">
                                  {initials(r.name)}
                                </div>
                                <PresenceDot online={online} className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5" title={online ? 'В сети' : undefined} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 dark:text-white truncate max-w-[180px]">{r.name}</p>
                                <p className="text-xs text-slate-400">
                                  {r.lastActivityAt ? t('teacherActivity.lastAction', { time: rel(r.lastActivityAt), defaultValue: 'посл. действие {{time}}' }) : t('teacherActivity.noActivity', 'нет активности')}
                                </p>
                              </div>
                            </div>
                          </td>
                          <NumCell v={r.counts.grade_set || 0} />
                          <NumCell v={r.counts.attendance_marked || 0} />
                          <NumCell v={r.counts.homework_checked || 0} />
                          <NumCell v={createdOf(r)} />
                          <NumCell v={r.counts.login || 0} />
                          <NumCell v={r.activeDays} />
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-14 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${r.kpiScore}%` }} />
                              </div>
                              <span className={`font-semibold tabular-nums ${tone.text}`}>{r.kpiScore}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {selected && (
        <TeacherDrawer
          key={selected.teacherId}
          row={selected}
          period={period}
          online={presence.isOnline(selected.teacherId)}
          lastSeenMs={presence.lastSeenMs(selected.teacherId)}
          rel={rel}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

// ── Ячейки/заголовки таблицы ──
const NumCell: React.FC<{ v: number }> = ({ v }) => (
  <td className={`px-5 py-3.5 tabular-nums ${v > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'}`}>{v}</td>
);

const Th: React.FC<{ label: string; sortKey: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void; align?: 'left' | 'right' }> = ({ label, sortKey, sort, onSort, align = 'right' }) => {
  const active = sort.key === sortKey;
  return (
    <th className={`px-5 py-3.5 font-medium whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-left'}`}>
      <button onClick={() => onSort(sortKey)} className={`inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ${active ? 'text-slate-700 dark:text-slate-200' : ''}`}>
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? 'opacity-100' : 'opacity-30'}`} />
      </button>
    </th>
  );
};

// ── Боковая карточка преподавателя: разбивка + лента ──
const TeacherDrawer: React.FC<{
  row: KpiRow;
  period: string;
  online: boolean;
  lastSeenMs: number | null;
  rel: (iso: string | null) => string;
  onClose: () => void;
}> = ({ row, period, online, lastSeenMs, rel, onClose }) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [tlError, setTlError] = useState('');

  useEffect(() => {
    let alive = true;
    apiGetTeacherTimeline(row.teacherId, { period })
      .then((res: { events: TimelineEvent[] }) => { if (alive) setEvents(res?.events || []); })
      .catch((e: any) => { if (alive) setTlError(e?.message || 'Ошибка'); });
    return () => { alive = false; };
  }, [row.teacherId, period]);

  const breakdown = Object.keys(TYPE_META).map(type => ({ type, ...TYPE_META[type], value: row.counts[type] || 0 }));
  const tone = scoreTone(row.kpiScore);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{row.name}</h2>
              <PresenceDot online={online} className="w-2.5 h-2.5" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {online ? t('presence.online', 'В сети') : lastSeenMs ? t('presence.lastSeen', { time: rel(new Date(lastSeenMs).toISOString()), defaultValue: 'был(а) в сети {{time}}' }) : t('presence.offline', 'Не в сети')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* KPI + consistency */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-3">
          <Stat label="KPI" value={String(row.kpiScore)} valueClass={tone.text} />
          <Stat label={t('teacherActivity.consistency', 'Стабильность')} value={`${row.consistencyPct}%`} />
          <Stat label={t('teacherActivity.activeDaysShort', 'Активных дней')} value={String(row.activeDays)} />
        </div>

        {/* Breakdown */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{t('teacherActivity.breakdown', 'Разбивка')}</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {breakdown.map(b => (
              <div key={b.type} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <b.icon className={`w-4 h-4 shrink-0 ${b.color}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums leading-none">{b.value}</p>
                  <p className="text-[11px] text-slate-400 truncate">{t(`teacherActivity.type.${b.type}`, b.label)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="p-5 overflow-y-auto flex-1">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{t('teacherActivity.timeline', 'Последние действия')}</h3>
          {tlError && <p className="text-sm text-rose-500">{tlError}</p>}
          {!events && !tlError && <p className="text-sm text-slate-400">{t('common.loading', 'Загрузка…')}</p>}
          {events && events.length === 0 && <p className="text-sm text-slate-400">{t('teacherActivity.noActivity', 'нет активности')}</p>}
          {events && events.length > 0 && (
            <ol className="space-y-3">
              {events.map(e => {
                const meta = TYPE_META[e.type] || { label: e.type, icon: Activity, color: 'text-slate-400' };
                const Icon = meta.icon;
                return (
                  <li key={e.id} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        {t(`teacherActivity.type.${e.type}`, meta.label)}
                        {e.count > 1 && <span className="text-slate-400"> ×{e.count}</span>}
                      </p>
                      {e.entityLabel && <p className="text-xs text-slate-400 truncate">{e.entityLabel}</p>}
                    </div>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">{rel(e.createdAt)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div className="text-center">
    <p className={`text-xl font-bold ${valueClass || 'text-slate-900 dark:text-white'}`}>{value}</p>
    <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
  </div>
);

const PERIOD_FALLBACK: Record<string, string> = {
  current_month: 'Этот месяц',
  last_month: 'Прошлый месяц',
  quarter: 'Квартал',
  year: 'Год',
  all: 'Всё время',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function emptyTotals(): KpiTotals {
  return { teachers: 0, activeTeachers: 0, totalActions: 0, avgActionsPerTeacher: 0, topTeacherId: null };
}

export default TeacherActivityPage;
