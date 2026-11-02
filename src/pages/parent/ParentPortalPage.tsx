import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { numericDateLocale } from '../../lib/locale';
import { apiGetParentPortalData } from '../../lib/api';
import { Trophy, Flame, Play, BookOpen, Star, AlertCircle, Calendar, Send, ChevronRight } from 'lucide-react';
import { PinnedBadgesDisplay } from '../../lib/badges';
import ParentAISummaryCard from '../../components/ai/ParentAISummaryCard';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { formatMoney, formatMonthKey, formatDayKey, currencySuffix } from '../../lib/money';

interface ParentPortalData {
  student: {
    uid: string;
    displayName: string;
    avatarUrl: string;
    pinnedBadges: string[];
  };
  organization?: {
    name: string;
    logoUrl: string;
  } | null;
  aiEnabled?: boolean;
  telegramBot?: string;
  stats: {
    totalXp: number;
    currentStreak: number;
    averageScore: number | null;
  };
  recentResults: {
    id: string;
    examTitle: string;
    percentage: number;
    passed: boolean;
    submittedAt: string;
    type: string;
    xpEarned: number;
    score?: number;
    maxPoints?: number;
    correct?: number;
    total?: number;
  }[];
  payments?: {
    totalDebt: number;
    hasOverdue: boolean;
    plans: { id: string; courseName: string; period: string | null; totalAmount: number; paidAmount: number; debt: number; progress: 'pending' | 'partial' | 'paid' | 'cancelled'; overdue: boolean }[];
  } | null;
  attendance?: {
    rate: number | null;
    counts: { total: number; present: number; late: number; excused: number; absent: number };
    recent: { date: string; courseName: string; mark: 'present' | 'late' | 'excused' | 'absent' }[];
  } | null;
}

const ParentPortalPage: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ParentPortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError(t('parent.invalidLink', 'Неверная ссылка'));
      setLoading(false);
      return;
    }

    apiGetParentPortalData(token)
      .then((res) => {
        setData(res);
      })
      .catch(() => {
        setError(t('parent.linkExpired', 'Ссылка недействительна или доступ закрыт.'));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-xl max-w-md w-full text-center">
          <div className="text-red-500 flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">{t('parent.accessClosed', 'Доступ закрыт')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
          <button 
            onClick={() => navigate('/')}
            className="btn-primary w-full justify-center"
          >
            {t('parent.goHome', 'На главную')}
          </button>
        </div>
      </div>
    );
  }

  const { student, stats, recentResults, organization, aiEnabled, telegramBot } = data;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 selection:bg-primary-500/30">
      {/* Decorative header background */}
      <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 relative">

        {/* School branding */}
        {organization && (organization.name || organization.logoUrl) && (
          <div className="absolute inset-y-0 left-0 right-0 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 z-10">
            {organization.logoUrl && (
              <img src={organization.logoUrl} alt={organization.name} className="h-7 w-7 rounded-md object-contain bg-white border border-slate-200 dark:border-slate-700 p-0.5" />
            )}
            {organization.name && (
              <span className="text-slate-900 dark:text-slate-100 font-semibold text-sm truncate">{organization.name}</span>
            )}
          </div>
        )}
        {/* Портал открывают по ссылке без входа — язык можно сменить только здесь. */}
        <div className="absolute top-3 right-4 z-20 rounded-md">
          <LanguageSwitcher compact />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 relative z-10 pb-20">
        
        {/* Profile Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="relative">
            {student.avatarUrl ? (
              <img src={student.avatarUrl} alt={student.displayName} className="w-16 h-16 rounded-full object-cover bg-white" />
            ) : (
              <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-xl text-slate-700 dark:text-slate-200 font-semibold">
                {student.displayName?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-white border-2 border-white dark:border-slate-800">
              <Trophy className="w-3 h-3" />
            </div>
          </div>
          
          <div className="flex-1 text-center sm:text-left">
            <div className="inline-flex items-center h-5 px-1.5 bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 rounded text-xs font-medium mb-1">
              {t('parent.portal', 'Портал для родителей')}
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{student.displayName}</h1>
            {student.pinnedBadges && student.pinnedBadges.length > 0 && (
              <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-2">
                <PinnedBadgesDisplay badges={student.pinnedBadges} />
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {/* XP Card */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3">
              <div className="order-last shrink-0">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('parent.totalXp', 'Всего очков (XP)')}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{stats.totalXp}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">XP</span>
                </div>
              </div>
            </div>
          </div>

          {/* Streak Card */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3">
              <div className="order-last shrink-0">
                <Flame className="w-3.5 h-3.5 text-orange-500 fill-current" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('parent.streak', 'Серия дней')}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{stats.currentStreak}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t('parent.days', 'дней')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Average Score Card */}
          {(() => {
            const avg = stats.averageScore;
            const hasAvg = avg !== null && avg !== undefined;
            const tone: 'slate' | 'emerald' | 'amber' | 'red' = !hasAvg ? 'slate' : avg >= 80 ? 'emerald' : avg >= 50 ? 'amber' : 'red';
            const chip = {
              slate: 'text-slate-400',
              emerald: 'text-emerald-500',
              amber: 'text-amber-500',
              red: 'text-red-500',
            }[tone];
            return (
              <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <div className={`order-last shrink-0 ${chip}`}>
                    <BookOpen className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('parent.avgScore', 'Средний балл')}</p>
                    {hasAvg ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{avg}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">/ 100</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-semibold text-slate-400">—</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{t('parent.noGrades', 'пока нет оценок')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Connect Telegram — get push alerts about attendance, grades & payments */}
        {token && telegramBot && (
          <a
            href={`https://t.me/${telegramBot}?start=parent_${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block mb-4 group"
          >
            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <div className="w-8 h-8 rounded-md bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Send className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('parent.connectTelegram', 'Подключить Telegram')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('parent.telegramHint', 'Уведомления о посещаемости, оценках и оплате — прямо в Telegram')}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            </div>
          </a>
        )}

        {/* AI progress summary */}
        {aiEnabled && token && (
          <div className="mb-4">
            <ParentAISummaryCard token={token} />
          </div>
        )}

        {/* Оплаты и посещаемость — только чтение */}
        {data.payments && (
          <section className="mb-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('parent.paymentsTitle', 'Оплата обучения')}</h2>
              <span className={`text-sm font-medium tabular-nums ${data.payments.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {data.payments.totalDebt > 0
                  ? t('parent.debt', 'Долг: {{amount}}', { amount: `${formatMoney(data.payments.totalDebt)} ${currencySuffix()}` })
                  : t('parent.noDebt', 'Долгов нет')}
              </span>
            </div>
            {data.payments.plans.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('parent.noPayments', 'Счетов пока нет')}</p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {data.payments.plans.map((p) => (
                  <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{p.courseName || '—'}{p.period ? ` · ${formatMonthKey(p.period)}` : ''}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {t('parent.moneyLine', 'оплачено {{paid}} из {{total}} · осталось {{left}}', {
                          paid: formatMoney(p.paidAmount), total: `${formatMoney(p.totalAmount)} ${currencySuffix()}`, left: formatMoney(p.debt),
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {t(`finances.status${p.progress === 'paid' ? 'Paid' : p.progress === 'partial' ? 'Partial' : 'Pending'}`)}
                      </span>
                      {p.overdue && <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{t('finances.overdueTag', 'срок прошёл')}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {data.attendance && (
          <section className="mb-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('parent.attendanceTitle', 'Посещаемость')}</h2>
              {data.attendance.rate !== null && (
                <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">{data.attendance.rate}%</span>
              )}
            </div>
            {data.attendance.counts.total === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('parent.noAttendance', 'Отметок о посещении пока нет')}</p>
            ) : (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {(['present', 'late', 'excused', 'absent'] as const)
                    .map((m) => `${t(`journal.attendance.${m}`)}: ${data.attendance!.counts[m]}`).join(' · ')}
                </p>
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.attendance.recent.map((e, i) => (
                    <li key={i} className="py-1.5 flex justify-between gap-2 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{formatDayKey(e.date)}{e.courseName ? ` · ${e.courseName}` : ''}</span>
                      <span className={e.mark === 'absent' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500 dark:text-slate-400'}>
                        {t(`journal.attendance.${e.mark}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {/* Recent Results */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <div className="text-slate-400 flex items-center justify-center">
              <Play className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('parent.recent', 'Недавние успехи')}</h2>
          </div>
          
          {recentResults.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="flex items-center justify-center mx-auto mb-2">
                <Calendar className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">{t('parent.noResults', 'Пока нет завершённых заданий')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('parent.noResultsText', 'Как только студент пройдёт тестирование, оно появится здесь.')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {recentResults.map((result) => (
                <div key={result.id} className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{result.examTitle}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{new Date(result.submittedAt).toLocaleDateString(numericDateLocale())}</span>
                      <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{result.type === 'homework' ? t('parent.type.homework', 'Домашка') : result.type === 'quiz' ? t('parent.type.quiz', 'Квиз') : t('parent.type.exam', 'Экзамен')}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    {result.xpEarned > 0 && (
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        +{result.xpEarned} <Star className="w-3 h-3 fill-current" />
                      </span>
                    )}
                    <div className="text-right">
                      {result.type === 'homework' ? (
                        <>
                          <span className="block text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {result.score} <span className="text-xs text-slate-400 font-normal">/ {result.maxPoints}</span>
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {t('parent.checked', 'Проверено')}
                          </span>
                        </>
                      ) : result.type === 'quiz' ? (
                        <>
                          <span className="block text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">{result.percentage}%</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {t('parent.correct', '{{correct}}/{{total}} верных', { correct: result.correct ?? 0, total: result.total ?? 0 })}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">{result.percentage}%</span>
                          <span className={`text-xs font-medium ${result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {result.passed ? t('parent.passed', 'Сдано') : t('parent.failed', 'Не сдано')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ParentPortalPage;
