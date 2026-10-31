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
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('parent.accessClosed', 'Доступ закрыт')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
          >
            {t('parent.goHome', 'На главную')}
          </button>
        </div>
      </div>
    );
  }

  const { student, stats, recentResults, organization, aiEnabled, telegramBot } = data;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30">
      {/* Decorative header background */}
      <div className="h-48 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute top-10 right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>

        {/* School branding */}
        {organization && (organization.name || organization.logoUrl) && (
          <div className="absolute top-0 left-0 right-0 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 flex items-center gap-2.5 z-10">
            {organization.logoUrl && (
              <img src={organization.logoUrl} alt={organization.name} className="h-8 w-8 rounded-lg object-contain bg-white/90 p-0.5 shadow-sm" />
            )}
            {organization.name && (
              <span className="text-white font-bold text-sm sm:text-base drop-shadow-sm truncate">{organization.name}</span>
            )}
          </div>
        )}
        {/* Портал открывают по ссылке без входа — язык можно сменить только здесь. */}
        <div className="absolute top-4 right-4 z-20 rounded-lg bg-white/90 dark:bg-slate-900/80">
          <LanguageSwitcher compact />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10 pb-20">
        
        {/* Profile Card */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700 shadow-2xl rounded-3xl p-6 sm:p-10 mb-8 flex flex-col sm:flex-row items-center sm:items-end gap-6">
          <div className="relative">
            {student.avatarUrl ? (
              <img src={student.avatarUrl} alt={student.displayName} className="w-32 h-32 rounded-2xl object-cover shadow-lg ring-4 ring-white dark:ring-slate-800 bg-white" />
            ) : (
              <div className="w-32 h-32 bg-indigo-600 rounded-2xl flex items-center justify-center text-4xl text-white font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
                {student.displayName?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-3 -right-3 w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center text-white shadow-lg border-2 border-white dark:border-slate-800 transform rotate-12">
              <Trophy className="w-5 h-5" />
            </div>
          </div>
          
          <div className="flex-1 text-center sm:text-left pb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold uppercase tracking-wide mb-2">
              {t('parent.portal', 'Портал для родителей')}
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{student.displayName}</h1>
            {student.pinnedBadges && student.pinnedBadges.length > 0 && (
              <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-2">
                <PinnedBadgesDisplay badges={student.pinnedBadges} />
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {/* XP Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-400/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center shrink-0">
                <Star className="w-6 h-6 fill-current" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('parent.totalXp', 'Всего очков (XP)')}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{stats.totalXp}</span>
                  <span className="text-sm text-amber-500 font-medium pb-1">XP</span>
                </div>
              </div>
            </div>
          </div>

          {/* Streak Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-orange-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-500 flex items-center justify-center shrink-0">
                <Flame className="w-6 h-6 fill-current" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('parent.streak', 'Серия дней')}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{stats.currentStreak}</span>
                  <span className="text-sm text-slate-500 font-medium pb-1">{t('parent.days', 'дней')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Average Score Card */}
          {(() => {
            const avg = stats.averageScore;
            const hasAvg = avg !== null && avg !== undefined;
            const tone: 'slate' | 'emerald' | 'amber' | 'red' = !hasAvg ? 'slate' : avg >= 80 ? 'emerald' : avg >= 50 ? 'amber' : 'red';
            const blur = { slate: 'bg-slate-400/10', emerald: 'bg-emerald-500/10', amber: 'bg-amber-500/10', red: 'bg-red-500/10' }[tone];
            const chip = {
              slate: 'bg-slate-100 text-slate-400 dark:bg-slate-700/40',
              emerald: 'bg-emerald-100 text-emerald-500 dark:bg-emerald-900/30',
              amber: 'bg-amber-100 text-amber-500 dark:bg-amber-900/30',
              red: 'bg-red-100 text-red-500 dark:bg-red-900/30',
            }[tone];
            return (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 relative overflow-hidden group">
                <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500 ${blur}`}></div>
                <div className="flex items-center gap-4 relative z-10">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${chip}`}>
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('parent.avgScore', 'Средний балл')}</p>
                    {hasAvg ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{avg}</span>
                        <span className="text-[13px] font-bold text-slate-400 mb-0.5">/ 100</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold tracking-tight text-slate-400">—</span>
                        <span className="text-[13px] font-medium text-slate-400 mb-0.5">{t('parent.noGrades', 'пока нет оценок')}</span>
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
            className="block mb-8 group"
          >
            <div className="flex items-center gap-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Send className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base sm:text-lg">{t('parent.connectTelegram', 'Подключить Telegram')}</h3>
                <p className="text-sm text-white/80">{t('parent.telegramHint', 'Уведомления о посещаемости, оценках и оплате — прямо в Telegram')}</p>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0 opacity-80 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </a>
        )}

        {/* AI progress summary */}
        {aiEnabled && token && (
          <div className="mb-6">
            <ParentAISummaryCard token={token} />
          </div>
        )}

        {/* Оплаты и посещаемость — только чтение */}
        {data.payments && (
          <section className="mb-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('parent.paymentsTitle', 'Оплата обучения')}</h2>
              <span className={`text-sm font-semibold ${data.payments.totalDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {data.payments.totalDebt > 0
                  ? t('parent.debt', 'Долг: {{amount}}', { amount: `${formatMoney(data.payments.totalDebt)} ${currencySuffix()}` })
                  : t('parent.noDebt', 'Долгов нет')}
              </span>
            </div>
            {data.payments.plans.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('parent.noPayments', 'Счетов пока нет')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {data.payments.plans.map((p) => (
                  <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{p.courseName || '—'}{p.period ? ` · ${formatMonthKey(p.period)}` : ''}</p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {t('parent.moneyLine', 'оплачено {{paid}} из {{total}} · осталось {{left}}', {
                          paid: formatMoney(p.paidAmount), total: `${formatMoney(p.totalAmount)} ${currencySuffix()}`, left: formatMoney(p.debt),
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {t(`finances.status${p.progress === 'paid' ? 'Paid' : p.progress === 'partial' ? 'Partial' : 'Pending'}`)}
                      </span>
                      {p.overdue && <span className="text-xs font-semibold text-red-600 dark:text-red-400">{t('finances.overdueTag', 'срок прошёл')}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {data.attendance && (
          <section className="mb-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('parent.attendanceTitle', 'Посещаемость')}</h2>
              {data.attendance.rate !== null && (
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{data.attendance.rate}%</span>
              )}
            </div>
            {data.attendance.counts.total === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('parent.noAttendance', 'Отметок о посещении пока нет')}</p>
            ) : (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  {(['present', 'late', 'excused', 'absent'] as const)
                    .map((m) => `${t(`journal.attendance.${m}`)}: ${data.attendance!.counts[m]}`).join(' · ')}
                </p>
                <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {data.attendance.recent.map((e, i) => (
                    <li key={i} className="py-2 flex justify-between gap-2 text-sm">
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
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 flex items-center justify-center">
              <Play className="w-4 h-4 ml-0.5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('parent.recent', 'Недавние успехи')}</h2>
          </div>
          
          {recentResults.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-slate-500 font-medium">{t('parent.noResults', 'Пока нет завершённых заданий')}</p>
              <p className="text-sm text-slate-400 mt-1">{t('parent.noResultsText', 'Как только студент пройдёт тестирование, оно появится здесь.')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {recentResults.map((result) => (
                <div key={result.id} className="p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{result.examTitle}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-slate-500">{new Date(result.submittedAt).toLocaleDateString(numericDateLocale())}</span>
                      <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                      <span className="text-sm text-slate-500 uppercase">{result.type === 'homework' ? t('parent.type.homework', 'Домашка') : result.type === 'quiz' ? t('parent.type.quiz', 'Квиз') : t('parent.type.exam', 'Экзамен')}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    {result.xpEarned > 0 && (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-md text-sm">
                        +{result.xpEarned} <Star className="w-3.5 h-3.5 fill-current" />
                      </span>
                    )}
                    <div className="text-right">
                      {result.type === 'homework' ? (
                        <>
                          <span className="block text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                            {result.score} <span className="text-sm text-slate-400 font-bold">/ {result.maxPoints}</span>
                          </span>
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-500">
                            {t('parent.checked', 'Проверено')}
                          </span>
                        </>
                      ) : result.type === 'quiz' ? (
                        <>
                          <span className="block text-2xl font-black tracking-tight text-slate-900 dark:text-white">{result.percentage}%</span>
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-500">
                            {t('parent.correct', '{{correct}}/{{total}} верных', { correct: result.correct ?? 0, total: result.total ?? 0 })}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block text-2xl font-black tracking-tight text-slate-900 dark:text-white">{result.percentage}%</span>
                          <span className={`text-xs font-bold uppercase tracking-wider ${result.passed ? 'text-emerald-500' : 'text-red-500'}`}>
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
