/**
 * Недопуск — студенты, чей рейтинг ниже порога допуска (NO_ADMISSION_THRESHOLD).
 *
 * Это не отдельный расчёт, а тот же рейтинг под жёстким срезом: один хук
 * (useStudentRating) и один сборщик строк (buildRatingRows), что и на странице
 * рейтинга, — иначе «балл 68» на одном экране и «допущен» на другом разошлись бы
 * молча. Метка «Не допуск» и порог живут в src/lib/student-rating.ts, поэтому
 * поднять/опустить планку можно в одной точке, а не по месту здесь.
 *
 * Кто попадает: только студенты С ДАННЫМИ и баллом ниже порога (isNotAdmitted).
 * Пустой балл 0 без единой отметки — это не двойка, а незаполненный журнал: вешать
 * за него недопуск значит наказать за чужую недоработку (см. WHY у isNotAdmitted).
 *
 * Филиал — общий переключатель приложения (см. memory «Global branch scope»):
 * чипы «По филиалам» двигают тот же выбор, что и боковое меню.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Ban, Search, Download, X, BookOpen, Layers, Building2, Info, RefreshCw,
  ShieldCheck, ShieldAlert, Gauge, TrendingDown, Trophy,
} from 'lucide-react';
import { useBranch } from '../../contexts/BranchContext';
import {
  isNotAdmitted, admissionGap, admissionReason, buildRatingRows,
  ATTENDANCE_WEIGHT, GRADE_WEIGHT, NO_ADMISSION_THRESHOLD,
  type RatingRow,
} from '../../lib/student-rating';
import { useStudentRating, RATING_PERIODS, RATING_PERIOD_FALLBACK, type RatingPeriod } from '../../hooks/useStudentRating';
import { buildCsv, downloadCsv } from '../../lib/csv';
import EmptyState from '../../components/ui/EmptyState';
import { CardSkeleton, ListSkeleton } from '../../components/ui/Skeleton';
import LazyListFooter from '../../components/ui/LazyListFooter';
import { useLazyList } from '../../hooks/useLazyList';
import { TONE, gradeLabel, Avatar, NotAdmittedBadge, SummaryCard, BranchChip } from './ratingShared';
import RatingStudentDrawer, { reasonText } from './RatingStudentDrawer';

const NoAdmissionPage: React.FC = () => {
  const { t } = useTranslation();
  const { activeBranchId, setActiveBranch, branches, canSwitch } = useBranch();

  const [period, setPeriod] = useState<RatingPeriod>('all');
  const { data, courses, groups, loading, error, reload } = useStudentRating(period);

  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('all');
  const [groupId, setGroupId] = useState('all');
  const [selected, setSelected] = useState<RatingRow | null>(null);

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
  const visibleGroups = useMemo(
    () => (courseId === 'all' ? groups : groups.filter(g => g.courseId === courseId)),
    [groups, courseId],
  );

  const activeGroup = groupId !== 'all' ? groupById.get(groupId) || null : null;
  const sliceCourseId = activeGroup ? (activeGroup.courseId || null) : (courseId === 'all' ? null : courseId);

  const rows = useMemo<RatingRow[]>(
    () => buildRatingRows({ students, stats, groups, branchName, sliceCourseId, activeGroup }),
    [students, stats, groups, activeGroup, sliceCourseId, branchName],
  );

  const withData = useMemo(() => rows.filter(r => r.metrics.hasData), [rows]);

  // Недопущенные, худшие первыми: балл вверх ногами, дальше — по имени, чтобы
  // порядок был устойчив при равных баллах.
  const blocked = useMemo(
    () => withData
      .filter(r => isNotAdmitted(r.metrics))
      .sort((a, b) => (a.metrics.score - b.metrics.score) || a.student.name.localeCompare(b.student.name)),
    [withData],
  );
  const admittedCount = withData.length - blocked.length;

  /** Средний балл недопущенных — насколько глубоко просели те, кто просел. */
  const avgBlockedScore = useMemo(
    () => (blocked.length ? Math.round(blocked.reduce((s, r) => s + r.metrics.score, 0) / blocked.length) : 0),
    [blocked],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? blocked.filter(r => r.student.name.toLowerCase().includes(q)) : blocked;
  }, [blocked, search]);

  const lazy = useLazyList(filtered, {
    initial: 50,
    step: 50,
    resetKey: `${search}|${courseId}|${groupId}|${period}|${activeBranchId ?? ''}`,
  });

  const perBranch = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach(s => s.branchIds.forEach(id => map.set(id, (map.get(id) || 0) + 1)));
    return map;
  }, [students]);

  const resetFilters = () => { setSearch(''); setCourseId('all'); setGroupId('all'); };
  const filtersActive = !!search || courseId !== 'all' || groupId !== 'all';

  const scopeLabel = activeGroup
    ? activeGroup.name
    : sliceCourseId
      ? courseTitle.get(sliceCourseId) || ''
      : t('rating.allCoursesScope', 'все курсы');

  const exportCsv = () => {
    const headers = [
      t('rating.col.student', 'Студент'),
      t('rating.col.branch', 'Филиал'),
      t('rating.col.group', 'Группа'),
      t('rating.col.attendance', 'Посещаемость, %'),
      t('rating.col.grade', 'Средний балл'),
      t('rating.gradePct', 'Успеваемость, %'),
      t('rating.col.score', 'Балл рейтинга'),
      t('noAdmission.gapCol', 'Недобор до порога'),
      t('noAdmission.reasonCol', 'Причина'),
    ];
    const body = filtered.map(r => [
      r.student.name,
      r.branchNames.join('; '),
      r.groupNames.join('; '),
      r.metrics.hasAttendance ? r.metrics.attendancePct : '',
      r.metrics.avgGrade ?? '',
      r.metrics.hasGrades ? r.metrics.gradePct : '',
      r.metrics.score,
      admissionGap(r.metrics),
      reasonText(t, admissionReason(r.metrics)),
    ]);
    downloadCsv(`no-admission-${period}.csv`, buildCsv(headers, body));
  };

  return (
    <div className="space-y-4 pb-10">
      {/* ─── Шапка ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-500" />
            {t('noAdmission.title', 'Недопуск')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('noAdmission.subtitle', { threshold: NO_ADMISSION_THRESHOLD, defaultValue: 'Студенты, чей рейтинг ниже {{threshold}} баллов. Им нужно подтянуть посещаемость или оценки.' })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/rating"
            className="btn-secondary inline-flex items-center gap-1.5"
          >
            <Trophy className="w-3.5 h-3.5" /> {t('noAdmission.fullRating', 'Полный рейтинг')}
          </Link>
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> {t('rating.export', 'Экспорт CSV')}
          </button>
        </div>
      </div>

      {/* ─── Период ─── */}
      <div className="flex flex-wrap gap-0.5">
        {RATING_PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`h-7 px-2 text-sm rounded-md transition-colors ${period === p ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'}`}
          >
            {t(`rating.period.${p}`, RATING_PERIOD_FALLBACK[p])}
          </button>
        ))}
      </div>

      {/* ─── Филиалы (общий переключатель приложения) ─── */}
      {canSwitch && branches.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <h2 className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t('rating.byBranch', 'По филиалам')}
            </h2>
          </div>
          <div className="flex flex-wrap gap-0.5">
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
        <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-sm border border-rose-200 dark:border-rose-900/40 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={reload} className="inline-flex items-center gap-1.5 text-xs font-medium shrink-0 hover:underline">
            <RefreshCw className="w-3.5 h-3.5" /> {t('rating.retry', 'Повторить')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
          <ListSkeleton rows={6} />
        </div>
      ) : (
        <>
          {/* ─── Сводка ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              icon={ShieldAlert}
              iconClass="text-slate-400"
              label={t('noAdmission.notAdmitted', 'Недопущено')}
              value={String(blocked.length)}
              sub={t('noAdmission.ofWithData', { count: withData.length, defaultValue: 'из {{count}} с данными' })}
            />
            <SummaryCard
              icon={ShieldCheck}
              iconClass="text-slate-400"
              label={t('noAdmission.admitted', 'Допущено')}
              value={String(admittedCount)}
              sub={scopeLabel}
            />
            <SummaryCard
              icon={Gauge}
              iconClass="text-slate-400"
              label={t('noAdmission.threshold', 'Порог допуска')}
              value={String(NO_ADMISSION_THRESHOLD)}
              sub={t('noAdmission.thresholdSub', 'балл и выше — допуск')}
            />
            <SummaryCard
              icon={TrendingDown}
              iconClass="text-slate-400"
              label={t('noAdmission.avgBlocked', 'Средний балл недопущенных')}
              value={blocked.length ? String(avgBlockedScore) : '—'}
              sub={blocked.length ? t('noAdmission.avgBlockedSub', { gap: NO_ADMISSION_THRESHOLD - avgBlockedScore, defaultValue: 'в среднем не хватает {{gap}}' }) : undefined}
            />
          </div>

          {/* ─── Фильтры и поиск ─── */}
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative min-w-0 md:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('rating.searchPlaceholder', 'Поиск по имени студента...')}
                aria-label={t('rating.searchPlaceholder', 'Поиск по имени студента...')}
                className="input pl-8"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={courseId}
                  onChange={e => { setCourseId(e.target.value); setGroupId('all'); }}
                  aria-label={t('rating.filterByCourse', 'Фильтр по курсу')}
                  className="input"
                >
                  <option value="all">{t('rating.allCourses', 'Все курсы')}</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.title || (c as any).name || c.id}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={groupId}
                  onChange={e => setGroupId(e.target.value)}
                  aria-label={t('rating.filterByGroup', 'Фильтр по группе')}
                  className="input"
                >
                  <option value="all">{t('rating.allGroups', 'Все группы')}</option>
                  {visibleGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {filtersActive && (
                <button
                  onClick={resetFilters}
                  className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> {t('rating.reset', 'Сбросить')}
                </button>
              )}
            </div>
          </div>

          {filtersActive && (
            <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t('rating.found', 'Найдено')}:{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{filtered.length}</span>
              {' '}{t('rating.ofTotal', 'из')} {blocked.length}
            </p>
          )}

          {/* ─── Список недопущенных ─── */}
          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
              {filtersActive ? (
                <EmptyState
                  icon={Search}
                  title={t('rating.emptyFiltered', 'Никого не нашлось')}
                  description={t('rating.emptyFilteredDesc', 'Попробуйте изменить курс, группу или поисковый запрос.')}
                  actionLabel={t('rating.reset', 'Сбросить')}
                  onAction={resetFilters}
                />
              ) : withData.length === 0 ? (
                <EmptyState
                  icon={Ban}
                  title={t('rating.emptyNoData', 'Пока не по чему считать рейтинг')}
                  description={t('rating.emptyNoDataDesc', 'Ни одному студенту в этом срезе ещё не выставили оценок и не отметили посещаемость. Отметьте занятие в журнале — рейтинг появится сам.')}
                />
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title={t('noAdmission.allClearTitle', 'Все допущены')}
                  description={t('noAdmission.allClearDesc', { threshold: NO_ADMISSION_THRESHOLD, count: withData.length, defaultValue: 'Ни у кого в этом срезе рейтинг не опустился ниже {{threshold}} баллов. Отличная работа!' })}
                />
              )}
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-1.5 font-medium whitespace-nowrap">{t('rating.col.student', 'Студент')}</th>
                        <th className="px-3 py-1.5 font-medium whitespace-nowrap hidden lg:table-cell">{t('rating.col.groupCourse', 'Группа и курс')}</th>
                        <th className="px-3 py-1.5 font-medium whitespace-nowrap hidden sm:table-cell">{t('rating.col.attendance', 'Посещаемость')}</th>
                        <th className="px-3 py-1.5 font-medium whitespace-nowrap hidden sm:table-cell">{t('rating.col.grade', 'Средний балл')}</th>
                        <th className="px-3 py-1.5 font-medium whitespace-nowrap">{t('rating.col.score', 'Балл')}</th>
                        <th className="px-3 py-1.5 font-medium whitespace-nowrap">{t('noAdmission.reasonCol', 'Причина')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {lazy.visible.map(r => {
                        const m = r.metrics;
                        const gap = admissionGap(m);
                        return (
                          <tr
                            key={r.student.uid}
                            onClick={() => setSelected(r)}
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r); } }}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-800"
                          >
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar name={r.student.name} url={r.student.avatarUrl} />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">{r.student.name}</p>
                                    <NotAdmittedBadge label={t('noAdmission.badge', 'Не допуск')} />
                                  </div>
                                  {r.branchNames.length > 0 && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{r.branchNames.join(', ')}</p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-3 py-1.5 hidden lg:table-cell">
                              <div className="min-w-0 max-w-[220px]">
                                <p className="text-slate-700 dark:text-slate-200 truncate">
                                  {r.groupNames.length ? r.groupNames.join(', ') : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {r.byCourse.map(s => courseTitle.get(s.courseId) || s.courseId).join(', ')}
                                </p>
                              </div>
                            </td>

                            <td className="px-3 py-1.5 hidden sm:table-cell">
                              {m.hasAttendance ? (
                                <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums ${TONE[m.attendancePct >= NO_ADMISSION_THRESHOLD ? 'good' : 'bad'].chip}`}>
                                  {m.attendancePct}%
                                </span>
                              ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>

                            <td className="px-3 py-1.5 hidden sm:table-cell">
                              {m.hasGrades ? (
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{gradeLabel(m)}</span>
                                  <span className="text-xs text-slate-400 tabular-nums">{m.gradeCount}</span>
                                </div>
                              ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>

                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">{m.score}</span>
                                <span className="text-xs text-slate-400 tabular-nums" title={t('noAdmission.gapCol', 'Недобор до порога')}>−{gap}</span>
                              </div>
                            </td>

                            <td className="px-3 py-1.5">
                              <span className="text-xs text-slate-500 dark:text-slate-400">{reasonText(t, admissionReason(m))}</span>
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

          {/* ─── Как это считается ─── */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <p>
                <span className="font-semibold text-slate-600 dark:text-slate-300">{t('noAdmission.howTitle', 'Как формируется недопуск')}:</span>{' '}
                {t('noAdmission.how', {
                  threshold: NO_ADMISSION_THRESHOLD,
                  attendance: Math.round(ATTENDANCE_WEIGHT * 100),
                  grade: Math.round(GRADE_WEIGHT * 100),
                  defaultValue: 'Рейтинг = {{attendance}}% посещаемость + {{grade}}% успеваемость. Балл ниже {{threshold}} — студент попадает сюда и получает метку «Не допуск». Поднялся до порога — метка снимается автоматически.',
                })}
              </p>
              <p className="mt-1">
                {t('noAdmission.howData', 'Студенты без единой оценки и отметки посещаемости в срез не попадают: недопуск ставится за низкий балл, а не за незаполненный журнал.')}
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
          coursesWorstFirst
        />
      )}
    </div>
  );
};

export default NoAdmissionPage;
