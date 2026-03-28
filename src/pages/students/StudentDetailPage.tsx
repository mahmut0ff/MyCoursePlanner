import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetStudents, orgGetResults, orgGetGroups } from '../../lib/api';
import { ArrowLeft, Mail, Trophy, Calendar, BarChart3, Users, Phone, MapPin, BookOpen } from 'lucide-react';
import type { UserProfile, ExamAttempt, Group } from '../../types';

const StudentDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [student, setStudent] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    Promise.all([
      orgGetStudents().then((all: UserProfile[]) => {
        const found = all.find((s) => s.uid === uid);
        setStudent(found || null);
      }),
      orgGetResults({ studentId: uid }).then(setResults).catch(() => setResults([])),
      orgGetGroups().then((allGroups: Group[]) => {
        setGroups(allGroups.filter(g => g.studentIds?.includes(uid!)));
      }).catch(() => setGroups([])),
    ]).finally(() => setLoading(false));
  }, [uid]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!student) return <div className="text-center py-20"><Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/students')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length) : 0;
  const passRate = results.length > 0 ? Math.round((results.filter(r => r.passed).length / results.length) * 100) : 0;
  const best = results.length > 0 ? Math.max(...results.map(r => r.percentage || 0)) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <button onClick={() => navigate('/students')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Profile Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-slate-700 h-20" />
        <div className="px-6 pb-6 relative">
          <div className="absolute -top-8 left-6">
            {student.avatarUrl ? (
              <img src={student.avatarUrl} alt="" className="w-16 h-16 rounded-xl object-cover shadow-lg ring-4 ring-white dark:ring-slate-800" />
            ) : (
              <div className="w-16 h-16 bg-primary-600 rounded-xl flex items-center justify-center text-xl text-white font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
                {student.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="pt-10 sm:pt-1 sm:ml-20 pb-1 mb-4">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{student.displayName}</h1>
            <p className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{student.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-full font-medium">{t('common.active')}</span>
            {student.phone && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{student.phone}</span>
            )}
            {student.city && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{student.city}</span>
            )}
            {student.createdAt && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{t('org.users.joined')}: {new Date(student.createdAt).toLocaleDateString()}</span>
            )}
          </div>
          {/* Groups */}
          {groups.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <BookOpen className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] text-slate-500 font-medium">{t('org.students.groups')}:</span>
              {groups.map(g => (
                <span key={g.id} className="text-[10px] px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-full font-medium">
                  {g.name}{g.courseName ? ` · ${g.courseName}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Parent Portal */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-500">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Портал для родителей</h3>
            <p className="text-xs text-slate-500 mt-0.5">Безопасная ссылка для отслеживания успеваемости, без регистрации.</p>
          </div>
          <div>
            {student.parentPortalKey ? (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/parent/${student.parentPortalKey}`);
                    alert('Ссылка скопирована!');
                  }}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Скопировать ссылку
                </button>
                <button 
                  onClick={async () => {
                    if (confirm('Сбросить ссылку? Родитель больше не сможет по ней зайти.')) {
                      await import('../../lib/api').then(m => m.apiRevokeParentKey(student.uid));
                      setStudent({ ...student, parentPortalKey: undefined });
                    }
                  }}
                  className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border justify-center border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg text-xs font-medium transition-colors"
                >
                  Сбросить
                </button>
              </div>
            ) : (
              <button 
                onClick={async () => {
                  try {
                    const res = await import('../../lib/api').then(m => m.apiGenerateParentKey(student.uid));
                    setStudent({ ...student, parentPortalKey: res.parentPortalKey });
                  } catch (err) {
                    alert('Ошибка генерации ссылки');
                  }
                }}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"
              >
                Создать ссылку
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: t('org.students.examsTaken'), value: results.length, color: 'text-primary-500' },
          { label: t('org.students.avgScore'), value: `${avgScore}%`, color: 'text-primary-500' },
          { label: t('org.students.passRate'), value: `${passRate}%`, color: 'text-emerald-500' },
          { label: t('org.students.bestScore'), value: `${best}%`, color: 'text-amber-500' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Results */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('org.students.recentResults')}</h2>
          <span className="text-[10px] text-slate-400 ml-auto">{results.length} {t('org.students.total')}</span>
        </div>
        {results.length === 0 ? (
          <div className="text-center py-12"><BarChart3 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" /><p className="text-xs text-slate-400">{t('org.students.noResults')}</p></div>
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 dark:border-slate-700/50">
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-5 py-2">{t('nav.exams')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-5 py-2">{t('common.date')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-5 py-2">{t('org.results.score')}</th>
              <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-5 py-2">{t('common.status')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
              {results.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20">
                  <td className="px-5 py-2.5 text-xs font-medium text-slate-900 dark:text-white">{r.examTitle}</td>
                  <td className="px-5 py-2.5 text-[11px] text-slate-500">{new Date(r.submittedAt).toLocaleDateString()}</td>
                  <td className="px-5 py-2.5 text-xs font-bold text-slate-900 dark:text-white">{r.percentage}%</td>
                  <td className="px-5 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.passed ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {r.passed ? t('common.passed') : t('common.failed')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default StudentDetailPage;
