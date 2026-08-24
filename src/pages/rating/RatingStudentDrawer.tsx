/**
 * Боковая карточка студента рейтинга: из чего сложился его балл, курс за курсом.
 *
 * Общая для страницы рейтинга и страницы недопуска — на обеих открывается тот же
 * разбор «посещаемость + оценки + по курсам», плюс, когда студент в недопуске,
 * человекочитаемая причина (что именно ниже порога) и явная метка в шапке.
 */
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, ExternalLink } from 'lucide-react';
import {
  computeMetrics, toneOf, isNotAdmitted, admissionGap, admissionReason,
  NO_ADMISSION_THRESHOLD, type RatingRow,
} from '../../lib/student-rating';
import { TONE, gradeLabel, Stat, MiniStat, NotAdmittedBadge } from './ratingShared';

/** Причина недопуска словами — общий текст для карточки и таблицы. */
export function reasonText(t: ReturnType<typeof useTranslation>['t'], reason: ReturnType<typeof admissionReason>): string {
  switch (reason) {
    case 'attendance': return t('noAdmission.reasonAttendance', 'низкая посещаемость');
    case 'grades': return t('noAdmission.reasonGrades', 'низкая успеваемость');
    case 'both': return t('noAdmission.reasonBoth', 'посещаемость и оценки');
    default: return '';
  }
}

const RatingStudentDrawer: React.FC<{
  row: RatingRow;
  courseTitle: Map<string, string>;
  onClose: () => void;
  /** Показать сначала слабейший курс — на странице недопуска важнее «что тянет вниз». */
  coursesWorstFirst?: boolean;
}> = ({ row, courseTitle, onClose, coursesWorstFirst = false }) => {
  const { t } = useTranslation();
  const m = row.metrics;
  const tone = TONE[toneOf(m.score)];
  const blocked = isNotAdmitted(m);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-xl flex flex-col">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{row.student.name}</h2>
              {blocked && <NotAdmittedBadge label={t('noAdmission.badge', 'Не допуск')} />}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {row.rank !== null
                ? t('rating.placeInRating', { rank: row.rank, defaultValue: '{{rank}}-е место в рейтинге' })
                : t('rating.noData', 'нет данных')}
              {row.branchNames.length > 0 && ` · ${row.branchNames.join(', ')}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 shrink-0" aria-label={t('common.close', 'Закрыть')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Почему недопуск — сразу под именем, до цифр: это главное на этой карточке */}
        {blocked && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40">
            <p className="text-sm text-rose-700 dark:text-rose-300">
              {t('noAdmission.drawerReason', {
                gap: admissionGap(m),
                threshold: NO_ADMISSION_THRESHOLD,
                reason: reasonText(t, admissionReason(m)),
                defaultValue: 'Не хватает {{gap}} до порога {{threshold}} — {{reason}}.',
              })}
            </p>
          </div>
        )}

        <div className="p-5 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-3">
          <Stat label={t('rating.col.score', 'Балл')} value={m.hasData ? String(m.score) : '—'} valueClass={m.hasData ? tone.text : undefined} />
          <Stat label={t('rating.col.attendance', 'Посещаемость')} value={m.hasAttendance ? `${m.attendancePct}%` : '—'} />
          <Stat label={t('rating.col.grade', 'Средний балл')} value={gradeLabel(m)} />
        </div>

        {/* Разбивка посещаемости — из этих четырёх чисел и складывается процент */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {t('rating.attendanceBreakdown', 'Посещаемость')}
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <MiniStat label={t('rating.present', 'Был')} value={row.counts.present} className="text-emerald-600 dark:text-emerald-400" />
            <MiniStat label={t('rating.late', 'Опоздал')} value={row.counts.late} className="text-amber-600 dark:text-amber-400" />
            <MiniStat label={t('rating.absent', 'Пропустил')} value={row.counts.absent} className="text-rose-600 dark:text-rose-400" />
            <MiniStat label={t('rating.excused', 'Уважительная')} value={row.counts.excused} className="text-slate-500 dark:text-slate-400" />
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {t('rating.byCourse', 'По курсам')}
          </h3>
          {row.byCourse.length === 0 ? (
            <p className="text-sm text-slate-400">
              {t('rating.noCourseData', 'В этом срезе по студенту ещё нет ни оценок, ни отметок посещаемости.')}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {row.byCourse
                .map(s => ({ stat: s, metrics: computeMetrics(s) }))
                .sort((a, b) => (coursesWorstFirst ? a.metrics.score - b.metrics.score : b.metrics.score - a.metrics.score))
                .map(({ stat, metrics }) => (
                  <li key={stat.courseId} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{courseTitle.get(stat.courseId) || stat.courseId}</span>
                        {isNotAdmitted(metrics) && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title={t('noAdmission.badge', 'Не допуск')} />}
                      </p>
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${TONE[toneOf(metrics.score)].text}`}>
                        {metrics.score}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{t('rating.attendanceShort', 'посещ.')} {metrics.hasAttendance ? `${metrics.attendancePct}%` : '—'}</span>
                      <span>{t('rating.gradeShort', 'балл')} {gradeLabel(metrics)}</span>
                      <span className="ml-auto tabular-nums">{metrics.lessons} {t('rating.lessonsShort', 'зан.')}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className={`h-full rounded-full ${TONE[toneOf(metrics.score)].bar}`} style={{ width: `${metrics.score}%` }} />
                    </div>
                  </li>
                ))}
            </ul>
          )}

          {row.groupNames.length > 0 && (
            <p className="mt-4 text-xs text-slate-400">
              {t('rating.groupsLabel', 'Группы')}: {row.groupNames.join(', ')}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <Link
            to={`/students/${row.student.uid}`}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <ExternalLink className="w-4 h-4" />
            {t('rating.openStudent', 'Открыть карточку студента')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RatingStudentDrawer;
