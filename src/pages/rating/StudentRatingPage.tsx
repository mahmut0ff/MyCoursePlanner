/**
 * Рейтинг студентов — одна таблица «оценки + посещаемость» на всю академию.
 *
 * Разрезы: филиал × курс × группа × период. Филиал НЕ имеет своего фильтра на
 * странице — он общий для всего приложения (см. BranchContext и memory «Global
 * branch scope»): чипы «По филиалам» ниже переключают тот же самый глобальный
 * выбор, что и переключатель в боковом меню, поэтому второго источника правды
 * здесь не заводится.
 *
 * Сервер отдаёт СЧЁТЧИКИ по паре «студент × курс» (api-rating), а срез
 * складывается уже здесь через общий buildRatingRows — так смена курса/группы не
 * стоит запроса, а средние считаются из сырых чисел, а не усреднением средних
 * (см. src/lib/student-rating.ts). Тот же хук и тот же сборщик кормят страницу
 * недопуска — один срез, одна формула, одно место рейтинга.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Trophy, Search, ArrowUpDown, Download, X, BookOpen, Layers, Users,
  CalendarCheck, GraduationCap, Building2, Info, RefreshCw, Ban,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import {
  emptyCounts, mergeCounts, computeMetrics, toneOf, isNotAdmitted, buildRatingRows,
  ATTENDANCE_WEIGHT, GRADE_WEIGHT, NO_ADMISSION_THRESHOLD,
  type RatingCounts, type RatingRow,
} from '../../lib/student-rating';
import { useStudentRating, RATING_PERIODS, RATING_PERIOD_FALLBACK, type RatingPeriod } from '../../hooks/useStudentRating';
import { buildCsv, downloadCsv } from '../../lib/csv';
import EmptyState from '../../components/ui/EmptyState';
import { CardSkeleton, ListSkeleton } from '../../components/ui/Skeleton';
import LazyListFooter from '../../components/ui/LazyListFooter';
import { useLazyList } from '../../hooks/useLazyList';
import {
  TONE, gradeLabel, Avatar, NotAdmittedBadge, SummaryCard, BranchChip, RankBadge,
} from './ratingShared';
import RatingStudentDrawer from './RatingStudentDrawer';

type Row = RatingRow;
type SortKey = 'rank' | 'name' | 'lessons' | 'attendance' | 'grade';

const StudentRatingPage: React.FC = () => {
  const { t } = useTranslation();
  const { activeBranchId, setActiveBranch, branches, canSwitch } = useBranch();

  const [period, setPeriod] = useState<RatingPeriod>('all');
  const { data, courses, groups, loading, error, reload } = useStudentRating(period);

  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('all');
  const [groupId, setGroupId] = useState('all');
  const [showEmpty, setShowEmpty] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rank', dir: 'asc' });
  const [selected, setSelected] = useState<Row | null>(null);

  const students = data?.students ?? [];
  const stats = data?.stats ?? [];

  const courseTitle = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach(c => map.set(c.id, c.title || (c as any).name || c.id));
    return map;
  }, [courses]);

  const branchName = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach(b => map.set(b.id, b.name));
    return map;
  }, [branches]);

  const groupById = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);

  /** Группы, предлагаемые в фильтре: сужаются выбранным курсом. */
  const visibleGroups = useMemo(
    () => (courseId === 'all' ? groups : groups.filter(g => g.courseId === courseId)),
    [groups, courseId],
  );

  // Группа задаёт курс однозначно, поэтому срез считаем по ней, а не по паре
  // «курс + группа»: выбранная группа с курсом X — это всегда данные курса X.
  const activeGroup = groupId !== 'all' ? groupById.get(groupId) || null : null;
  const sliceCourseId = activeGroup ? (activeGroup.courseId || null) : (courseId === 'all' ? null : courseId);

  const rows = useMemo<Row[]>(
    () => buildRatingRows({ students, stats, groups, branchName, sliceCourseId, activeGroup }),
    [students, stats, groups, activeGroup, sliceCourseId, branchName],
  );

  const withData = useMemo(() => rows.filter(r => r.metrics.hasData), [rows]);
  const emptyCount = rows.length - withData.length;
  const notAdmittedCount = useMemo(() => withData.filter(r => isNotAdmitted(r.metrics)).length, [withData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = showEmpty ? rows : withData;
    if (q) list = list.filter(r => r.student.name.toLowerCase().includes(q));

    const dir = sort.dir === 'asc' ? 1 : -1;
    const value = (r: Row): number | string => {
      switch (sort.key) {
        case 'name': return r.student.name.toLowerCase();
        case 'lessons': return r.metrics.lessons;
        case 'attendance': return r.metrics.attendancePct;
        case 'grade': return r.metrics.hasGrades ? r.metrics.gradePct : -1;
        // «Место» — это балл наоборот: 1-е место = наибольший балл.
        default: return r.metrics.hasData ? -r.metrics.score : Number.POSITIVE_INFINITY;
      }
    };
    return [...list].sort((a, b) => {
      const va = value(a); const vb = value(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [rows, withData, showEmpty, search, sort]);

  const lazy = useLazyList(filtered, {
    initial: 50,
    step: 50,
    resetKey: `${search}|${courseId}|${groupId}|${period}|${showEmpty}|${sort.key}${sort.dir}|${activeBranchId ?? ''}`,
  });

  /** Сводка по срезу: складываем СЧЁТЧИКИ, а не проценты. */
  const totals = useMemo(() => {
    const counts = withData.reduce<RatingCounts>((acc, r) => mergeCounts(acc, r.counts), emptyCounts());
    const metrics = computeMetrics(counts);
    const leader = withData.reduce<Row | null>((best, r) => (!best || r.metrics.score > best.metrics.score ? r : best), null);
    return { metrics, leader };
  }, [withData]);

  /** Сколько студентов в каждом филиале — под чипами переключателя. */
  const perBranch = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach(s => s.branchIds.forEach(id => map.set(id, (map.get(id) || 0) + 1)));
    return map;
  }, [students]);

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' || key === 'rank' ? 'asc' : 'desc' }));

  const resetFilters = () => { setSearch(''); setCourseId('all'); setGroupId('all'); };
  const filtersActive = !!search || courseId !== 'all' || groupId !== 'all';

  const exportCsv = () => {
    const headers = [
      t('rating.col.rank', 'Место'),
      t('rating.col.student', 'Студент'),
      t('rating.col.branch', 'Филиал'),
      t('rating.col.group', 'Группа'),
      t('rating.col.lessons', 'Занятий'),
      t('rating.present', 'Был'),
      t('rating.late', 'Опоздал'),
      t('rating.absent', 'Пропустил'),
      t('rating.excused', 'Уважительная'),
      t('rating.col.attendance', 'Посещаемость, %'),
      t('rating.col.grade', 'Средний балл'),
      t('rating.gradePct', 'Успеваемость, %'),
      t('rating.col.score', 'Балл рейтинга'),
      t('noAdmission.badge', 'Не допуск'),
    ];
    const body = filtered.map(r => [
      r.rank ?? '—',
      r.student.name,
      r.branchNames.join('; '),
      r.groupNames.join('; '),
      r.metrics.lessons,
      r.counts.present,
      r.counts.late,
      r.counts.absent,
      r.counts.excused,
      r.metrics.hasAttendance ? r.metrics.attendancePct : '',
      r.metrics.avgGrade ?? '',
      r.metrics.hasGrades ? r.metrics.gradePct : '',
      r.metrics.hasData ? r.metrics.score : '',
      isNotAdmitted(r.metrics) ? t('noAdmission.yes', 'да') : '',
    ]);
    downloadCsv(`student-rating-${period}.csv`, buildCsv(headers, body));
  };

  const scopeLabel = activeGroup
    ? activeGroup.name
    : sliceCourseId
      ? courseTitle.get(sliceCourseId) || ''
      : t('rating.allCoursesScope', 'все курсы');

  return (
    <div className="space-y-6 pb-10">
      {/* ─── Шапка ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" />
            {t('rating.title', 'Рейтинг студентов')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('rating.subtitle', 'Средний балл и посещаемость каждого ученика — по филиалам, курсам и группам.')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Мост к недопуску: счётчик — живой повод туда зайти, а не украшение */}
          <Link
            to="/rating/no-admission"
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl border transition-colors ${
              notAdmittedCount > 0
                ? 'border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Ban className="w-4 h-4" /> {t('nav.noAdmission', 'Недопуск')}
            {notAdmittedCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-rose-500 text-white tabular-nums">
                {notAdmittedCount}
              </span>
            )}
          </Link>
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" /> {t('rating.export', 'Экспорт CSV')}
          </button>
        </div>
      </div>

      {/* ─── Период ─── */}
      <div className="flex flex-wrap gap-1.5">
        {RATING_PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              period === p
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
            }`}
          >
            {t(`rating.period.${p}`, RATING_PERIOD_FALLBACK[p])}
          </button>
        ))}
      </div>

      {/* ─── Филиалы ───
          Это НЕ собственный фильтр страницы: чипы двигают тот же глобальный
          выбор, что и переключатель в боковом меню, — один источник правды. */}
      {canSwitch && branches.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {t('rating.byBranch', 'По филиалам')}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <BranchChip
              label={t('branch.allBranches', 'Все филиалы')}
              count={activeBranchId === null ? students.length : undefined}
              active={activeBranchId === null}
              onClick={() => setActiveBranch(null)}
            />
            {branches.map(b => (
              <BranchChip
                key={b.id}
                label={b.name}
                count={activeBranchId === null ? (perBranch.get(b.id) || 0) : (activeBranchId === b.id ? students.length : undefined)}
                active={activeBranchId === b.id}
                onClick={() => setActiveBranch(b.id)}
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-sm border border-rose-100 dark:border-rose-900/40 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            onClick={reload}
            className="inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('rating.retry', 'Повторить')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
          <ListSkeleton rows={6} />
        </div>
      ) : (
        <>
          {/* ─── Сводка ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={Users}
              iconClass="text-blue-500 bg-blue-50 dark:bg-blue-900/30"
              label={t('rating.inRating', 'В рейтинге')}
              value={`${withData.length}${emptyCount ? ` / ${rows.length}` : ''}`}
              sub={emptyCount ? t('rating.withoutData', { count: emptyCount, defaultValue: '{{count}} без данных' }) : scopeLabel}
            />
            <SummaryCard
              icon={CalendarCheck}
              iconClass="text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30"
              label={t('rating.avgAttendance', 'Средняя посещаемость')}
              value={totals.metrics.hasAttendance ? `${totals.metrics.attendancePct}%` : '—'}
              sub={totals.metrics.hasAttendance
                ? t('rating.lessonsMarked', { count: totals.metrics.lessons, defaultValue: 'отмечено занятий: {{count}}' })
                : undefined}
            />
            <SummaryCard
              icon={GraduationCap}
              iconClass="text-violet-500 bg-violet-50 dark:bg-violet-900/30"
              label={t('rating.avgGrade', 'Средний балл')}
              value={gradeLabel(totals.metrics)}
              sub={totals.metrics.hasGrades
                ? t('rating.gradesCounted', { count: totals.metrics.gradeCount, defaultValue: 'оценок учтено: {{count}}' })
                : undefined}
            />
            <SummaryCard
              icon={Trophy}
              iconClass="text-amber-500 bg-amber-50 dark:bg-amber-900/30"
              label={t('rating.leader', 'Лидер')}
              value={totals.leader ? totals.leader.student.name : '—'}
              sub={totals.leader ? t('rating.scorePoints', { score: totals.leader.metrics.score, defaultValue: '{{score}} баллов' }) : undefined}
            />
          </div>

          {/* ─── Фильтры и поиск ─── */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('rating.searchPlaceholder', 'Поиск по имени студента...')}
                aria-label={t('rating.searchPlaceholder', 'Поиск по имени студента...')}
                className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={courseId}
                  onChange={e => { setCourseId(e.target.value); setGroupId('all'); }}
                  aria-label={t('rating.filterByCourse', 'Фильтр по курсу')}
                  className="input text-sm py-2 bg-slate-50 dark:bg-slate-900 border-none"
                >
                  <option value="all">{t('rating.allCourses', 'Все курсы')}</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.title || (c as any).name || c.id}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={groupId}
                  onChange={e => setGroupId(e.target.value)}
                  aria-label={t('rating.filterByGroup', 'Фильтр по группе')}
                  className="input text-sm py-2 bg-slate-50 dark:bg-slate-900 border-none"
                >
                  <option value="all">{t('rating.allGroups', 'Все группы')}</option>
                  {visibleGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Показывается, только когда таких студентов действительно нет в
                  выдаче, — вечно серый чип «0» был бы шумом. */}
              {emptyCount > 0 && (
                <button
                  onClick={() => setShowEmpty(v => !v)}
                  aria-pressed={showEmpty}
                  title={t('rating.showEmptyHint', 'Студенты, которым в этом срезе ещё не ставили оценок и не отмечали посещаемость')}
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    showEmpty
                      ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {t('rating.showEmpty', 'Без данных')}
                  <span className={showEmpty ? 'opacity-70' : 'text-slate-400'}>{emptyCount}</span>
                </button>
              )}

              {filtersActive && (
                <button
                  onClick={resetFilters}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> {t('rating.reset', 'Сбросить')}
                </button>
              )}
            </div>
          </div>

          {filtersActive && (
            <p className="-mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t('rating.found', 'Найдено')}:{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{filtered.length}</span>
              {' '}{t('rating.ofTotal', 'из')} {showEmpty ? rows.length : withData.length}
            </p>
          )}

          {/* ─── Таблица ─── */}
          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <EmptyState
                icon={Trophy}
                title={
                  filtersActive
                    ? t('rating.emptyFiltered', 'Никого не нашлось')
                    : emptyCount > 0
                      ? t('rating.emptyNoData', 'Пока не по чему считать рейтинг')
                      : t('rating.emptyTitle', 'Здесь пока пусто')
                }
                description={
                  filtersActive
                    ? t('rating.emptyFilteredDesc', 'Попробуйте изменить курс, группу или поисковый запрос.')
                    : emptyCount > 0
                      ? t('rating.emptyNoDataDesc', 'Ни одному студенту в этом срезе ещё не выставили оценок и не отметили посещаемость. Отметьте занятие в журнале — рейтинг появится сам.')
                      : t('rating.emptyDesc', 'В выбранном филиале нет студентов. Проверьте фильтр филиала или добавьте студентов.')
                }
                actionLabel={filtersActive ? t('rating.reset', 'Сбросить') : emptyCount > 0 ? t('rating.showEmptyAction', 'Показать студентов без данных') : undefined}
                onAction={filtersActive ? resetFilters : emptyCount > 0 ? () => setShowEmpty(true) : undefined}
              />
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <Th label="#" sortKey="rank" sort={sort} onSort={toggleSort} className="w-14" />
                        <Th label={t('rating.col.student', 'Студент')} sortKey="name" sort={sort} onSort={toggleSort} />
                        <th className="px-4 py-3.5 font-medium whitespace-nowrap hidden lg:table-cell">
                          {t('rating.col.groupCourse', 'Группа и курс')}
                        </th>
                        <Th label={t('rating.col.lessons', 'Занятий')} sortKey="lessons" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                        <Th label={t('rating.col.attendance', 'Посещаемость')} sortKey="attendance" sort={sort} onSort={toggleSort} />
                        <Th label={t('rating.col.grade', 'Средний балл')} sortKey="grade" sort={sort} onSort={toggleSort} />
                        <th className="px-4 py-3.5 font-medium whitespace-nowrap">{t('rating.col.score', 'Балл')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {lazy.visible.map(r => {
                        const m = r.metrics;
                        const tone = TONE[toneOf(m.score)];
                        const blocked = isNotAdmitted(m);
                        return (
                          <tr
                            key={r.student.uid}
                            onClick={() => setSelected(r)}
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r); } }}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-700/30 ${m.hasData ? '' : 'opacity-60'}`}
                          >
                            <td className="px-4 py-3.5">
                              <RankBadge rank={r.rank} />
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar name={r.student.name} url={r.student.avatarUrl} />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="font-medium text-slate-900 dark:text-white truncate max-w-[200px]">{r.student.name}</p>
                                    {blocked && <NotAdmittedBadge label={t('noAdmission.badge', 'Не допуск')} title={t('noAdmission.badgeHint', { threshold: NO_ADMISSION_THRESHOLD, defaultValue: 'Рейтинг ниже {{threshold}} баллов' })} />}
                                  </div>
                                  {r.branchNames.length > 0 && (
                                    <p className="text-xs text-slate-400 truncate max-w-[200px]">{r.branchNames.join(', ')}</p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3.5 hidden lg:table-cell">
                              <div className="min-w-0 max-w-[220px]">
                                <p className="text-slate-700 dark:text-slate-200 truncate">
                                  {r.groupNames.length ? r.groupNames.join(', ') : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                </p>
                                <p className="text-xs text-slate-400 truncate">
                                  {r.byCourse.map(s => courseTitle.get(s.courseId) || s.courseId).join(', ')}
                                </p>
                              </div>
                            </td>

                            <td className="px-4 py-3.5 tabular-nums hidden sm:table-cell">
                              {m.hasAttendance
                                ? <span className="text-slate-700 dark:text-slate-200">{m.lessons}</span>
                                : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>

                            <td className="px-4 py-3.5">
                              {m.hasAttendance ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${TONE[toneOf(m.attendancePct)].chip}`}>
                                  {m.attendancePct}%
                                </span>
                              ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>

                            <td className="px-4 py-3.5">
                              {m.hasGrades ? (
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{gradeLabel(m)}</span>
                                  <span className="text-xs text-slate-400 tabular-nums">{m.gradeCount}</span>
                                </div>
                              ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>

                            <td className="px-4 py-3.5">
                              {m.hasData ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-14 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0">
                                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${m.score}%` }} />
                                  </div>
                                  <span className={`font-bold tabular-nums ${tone.text}`}>{m.score}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">{t('rating.noData', 'нет данных')}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <LazyListFooter
                visibleCount={lazy.visible.length}
                total={lazy.total}
                hasMore={lazy.hasMore}
                sentinelRef={lazy.sentinelRef}
                onLoadMore={lazy.loadMore}
              />
            </>
          )}

          {/* ─── Формула ─── */}
          <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <p>
                <span className="font-semibold text-slate-600 dark:text-slate-300">{t('rating.formulaTitle', 'Как считается балл')}:</span>{' '}
                {t('rating.formula', {
                  attendance: Math.round(ATTENDANCE_WEIGHT * 100),
                  grade: Math.round(GRADE_WEIGHT * 100),
                  defaultValue: '{{attendance}}% посещаемость + {{grade}}% успеваемость. Посещаемость — доля занятий, где студент был или опоздал, от всех отмеченных. Успеваемость — средняя оценка в процентах от максимума своей шкалы.',
                })}
              </p>
              <p className="mt-1">
                {t('rating.formulaFallback', 'Если одной из половин ещё нет (нет оценок или не отмечена посещаемость), балл считается целиком по второй.')}
              </p>
              <p className="mt-1">
                {t('rating.formulaNoAdmission', { threshold: NO_ADMISSION_THRESHOLD, defaultValue: 'Балл ниже {{threshold}} — студент попадает в недопуск и получает метку «Не допуск».' })}
              </p>
            </div>
          </div>
        </>
      )}

      {selected && (
        <RatingStudentDrawer
          key={selected.student.uid}
          row={selected}
          courseTitle={courseTitle}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

// ── Заголовок колонки с сортировкой (нужен только здесь) ──
const Th: React.FC<{
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (k: SortKey) => void;
  className?: string;
}> = ({ label, sortKey, sort, onSort, className = '' }) => {
  const active = sort.key === sortKey;
  return (
    <th className={`px-4 py-3.5 font-medium whitespace-nowrap text-left ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ${active ? 'text-slate-700 dark:text-slate-200' : ''}`}
      >
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? 'opacity-100' : 'opacity-30'}`} />
      </button>
    </th>
  );
};

export default StudentRatingPage;
