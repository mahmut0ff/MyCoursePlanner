import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetStudents, orgGetResults, orgGetGroups, orgUpdateGroup, apiRemoveMember, apiGetPaymentPlans, apiGetTransactions, apiCreateTransaction } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft, Mail, Trophy, Calendar, BarChart3, Users, Phone, MapPin,
  BookOpen, Zap, Target, Clock, CheckCircle, Plus, X, Loader2,
  Flame, Copy, Star, Shield, Link2, ExternalLink, CreditCard, Receipt
} from 'lucide-react';
import type { UserProfile, ExamAttempt, Group } from '../../types';
import { PinnedBadgesDisplay } from '../../lib/badges';
import toast from 'react-hot-toast';

/* ─── palette matching kahoot/quiz ─── */
const C = {
  purple: '#46178f',
  blue: '#1368ce',
  green: '#26890c',
  red: '#e21b3c',
  yellow: '#d89e00',
  teal: '#0aa08a',
};

const StudentDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [student, setStudent] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const { role, organizationId } = useAuth();
  const isAdmin = role === 'admin' || role === 'manager' || role === 'super_admin';
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  
  // Assignment Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Finances
  const [paymentPlans, setPaymentPlans] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payModalPlan, setPayModalPlan] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payComment, setPayComment] = useState('');
  const [paying, setPaying] = useState(false);

  // Fetch finances
  const loadFinances = async () => {
    try {
      const [plans, txs] = await Promise.all([
        apiGetPaymentPlans(),
        apiGetTransactions(),
      ]);
      setPaymentPlans((plans || []).filter((p: any) => p.studentId === uid));
      setTransactions((txs || []).filter((t: any) => t.studentId === uid));
    } catch { }
  };

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    Promise.all([
      orgGetStudents().then((all: UserProfile[]) => {
        setStudent(all.find((s) => s.uid === uid) || null);
      }),
      orgGetResults({ studentId: uid }).then(setResults).catch(() => setResults([])),
      orgGetGroups().then((allGroups: Group[]) => {
        setAllGroups(allGroups);
        setGroups(allGroups.filter(g => g.studentIds?.includes(uid!)));
      }).catch(() => { setAllGroups([]); setGroups([]); }),
      loadFinances(),
    ]).finally(() => setLoading(false));
  }, [uid]);

  /* ─── derived stats ─── */
  const stats = useMemo(() => {
    if (results.length === 0) return { avgScore: 0, passRate: 0, best: 0, streak: 0, totalTime: 0, totalCorrect: 0, totalQuestions: 0 };
    const avgScore = Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length);
    const passRate = Math.round((results.filter(r => r.passed).length / results.length) * 100);
    const best = Math.max(...results.map(r => r.percentage || 0));
    // Calculate streak (consecutive passed exams from most recent)
    const sorted = [...results].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    let streak = 0;
    for (const r of sorted) { if (r.passed) streak++; else break; }
    const totalTime = results.reduce((s, r) => s + (r.timeSpentSeconds || 0), 0);
    const totalCorrect = results.reduce((s, r) => s + (r.questionResults?.filter(q => q.isCorrect).length || 0), 0);
    const totalQuestions = results.reduce((s, r) => s + (r.questionResults?.length || 0), 0);
    return { avgScore, passRate, best, streak, totalTime, totalCorrect, totalQuestions };
  }, [results]);

  /* ─── score distribution for mini chart ─── */
  const scoreDistribution = useMemo(() => {
    const buckets = [0, 0, 0, 0]; // 0-49, 50-69, 70-89, 90-100
    results.forEach(r => {
      const p = r.percentage || 0;
      if (p >= 90) buckets[3]++;
      else if (p >= 70) buckets[2]++;
      else if (p >= 50) buckets[1]++;
      else buckets[0]++;
    });
    return buckets;
  }, [results]);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}с`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}м`;
    return `${Math.floor(seconds / 3600)}ч ${Math.floor((seconds % 3600) / 60)}м`;
  };

  const handleAssignGroup = async () => {
    if (!selectedGroupId || !uid) return;
    const targetGroup = allGroups.find(g => g.id === selectedGroupId);
    if (!targetGroup) return;

    setAssigning(true);
    try {
      const currentStudentIds = targetGroup.studentIds || [];
      if (!currentStudentIds.includes(uid)) {
        await orgUpdateGroup({
          id: targetGroup.id,
          studentIds: [...currentStudentIds, uid]
        });
        
        // Update local state
        const updatedTarget = { ...targetGroup, studentIds: [...currentStudentIds, uid] };
        setAllGroups(allGroups.map(g => g.id === targetGroup.id ? updatedTarget : g));
        setGroups([...groups, updatedTarget]);
        toast.success(t('common.saved', 'Ученик прикреплен к группе!'));
      }
      setShowAssignModal(false);
      setSelectedGroupId('');
    } catch (e: any) {
      toast.error(e.message || 'Error assigning student');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignGroup = async (groupId: string) => {
    const targetGroup = allGroups.find(g => g.id === groupId);
    if (!targetGroup || !uid) return;
    
    if (!window.confirm('Открепить ученика от группы?')) return;

    try {
      const currentStudentIds = targetGroup.studentIds || [];
      const updatedIds = currentStudentIds.filter(id => id !== uid);
      
      await orgUpdateGroup({ id: targetGroup.id, studentIds: updatedIds });
      
      const updatedTarget = { ...targetGroup, studentIds: updatedIds };
      setAllGroups(allGroups.map(g => g.id === targetGroup.id ? updatedTarget : g));
      setGroups(groups.filter(g => g.id !== targetGroup.id));
      toast.success('Ученик откреплен');
    } catch (e: any) {
      toast.error(e.message || 'Error unassigning');
    }
  };

  /* ─── loading ─── */
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: `${C.purple}30`, borderTopColor: C.purple }} />
    </div>
  );

  if (!student) return (
    <div className="text-center py-20">
      <Users className="w-14 h-14 mx-auto mb-3" style={{ color: C.purple, opacity: 0.2 }} />
      <p className="text-sm font-bold text-slate-500">{t('common.notFound')}</p>
      <button onClick={() => navigate('/students')} className="mt-3 text-sm font-bold hover:underline" style={{ color: C.purple }}>{t('common.back')}</button>
    </div>
  );

  const sortedResults = [...results].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  const maxBucket = Math.max(...scoreDistribution, 1);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back */}
      <button onClick={() => navigate('/students')} className="flex items-center gap-1.5 text-sm font-bold mb-4 transition-all hover:gap-2.5" style={{ color: C.purple }}>
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* ═══ Hero Profile Card ═══ */}
      <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-6 shadow-sm">
        {/* Gradient Banner */}
        <div className="h-28 sm:h-32 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.purple} 0%, ${C.blue} 50%, ${C.teal} 100%)` }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M30 5 L55 17.5 L55 42.5 L30 55 L5 42.5 L5 17.5 Z\' fill=\'none\' stroke=\'white\' stroke-width=\'1\'/%3E%3C/svg%3E")', backgroundSize: '60px 60px' }} />
          {/* Stats overlay on banner */}
          <div className="absolute bottom-3 right-4 flex items-center gap-3">
            {stats.streak > 0 && (
              <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded-full">
                <Flame className="w-3.5 h-3.5 text-orange-300" />
                <span className="text-[11px] font-bold">{stats.streak} серия</span>
              </div>
            )}
            <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded-full">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">{new Date(student.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 relative">
          {/* Avatar */}
          <div className="absolute -top-10 left-6">
            {student.avatarUrl ? (
              <img src={student.avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-xl ring-4 ring-white dark:ring-slate-800" />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl text-white font-extrabold shadow-xl ring-4 ring-white dark:ring-slate-800" style={{ background: `linear-gradient(135deg, ${C.purple} 0%, ${C.blue} 100%)` }}>
                {student.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          <div className="pt-12 sm:pt-2 sm:ml-24">
            {/* Name & email */}
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{student.displayName}</h1>
                  <PinnedBadgesDisplay badges={student.pinnedBadges} emptyPlaceholder />
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" />{student.email}</span>
                  {student.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{student.phone}</span>}
                  {student.city && <span className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{student.city}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${(student as any).status === 'expelled' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'}`}>
                  {(student as any).status === 'expelled' ? t('common.expelled', 'Отчислен') : t('common.active', 'Активен')}
                </span>
                {isAdmin && (student as any).status !== 'expelled' && (
                  <button onClick={async () => {
                    if (window.confirm('Вы уверены что хотите отчислить студента?')) {
                      await apiRemoveMember(student.uid, organizationId!);
                      toast.success('Студент отчислен');
                      navigate('/students');
                    }
                  }} className="text-[11px] font-bold text-red-500 hover:text-red-600 underline">
                    Отчислить
                  </button>
                )}
              </div>
            </div>

            {/* Bio */}
            {student.bio && (
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-l-2 pl-3 italic" style={{ borderColor: C.purple }}>
                {student.bio}
              </p>
            )}

            {/* Skills */}
            {student.skills && student.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {student.skills.map((skill, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: [C.purple, C.blue, C.green, C.teal, C.yellow][i % 5] }}>
                    {skill}
                  </span>
                ))}
              </div>
            )}

            {/* Groups */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              {groups.map(g => (
                <div key={g.id} className="group relative flex items-center pr-1 pl-2.5 py-1 rounded-lg font-bold border transition-colors" style={{ borderColor: `${C.blue}40`, color: C.blue, background: `${C.blue}10` }}>
                  <span className="text-[10px] cursor-pointer" onClick={() => navigate(`/groups/${g.id}`)}>
                    {g.name}{g.courseName ? ` · ${g.courseName}` : ''}
                  </span>
                  {isAdmin && (
                    <button onClick={() => handleUnassignGroup(g.id)} className="ml-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-white/50 rounded-md p-0.5 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {groups.length === 0 && <span className="text-[10px] text-slate-400 font-medium">Нет групп</span>}
              {isAdmin && (
                <button onClick={() => setShowAssignModal(true)} className="ml-1 p-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:text-blue-500 hover:border-blue-300 transition-colors" title="Прикрепить к группе">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Stats Grid ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon={<Trophy className="w-5 h-5 text-white" />} bg={C.purple} label={t('org.students.examsTaken')} value={results.length} />
        <StatCard icon={<Target className="w-5 h-5 text-white" />} bg={C.blue} label={t('org.students.avgScore')} value={`${stats.avgScore}%`} />
        <StatCard icon={<CheckCircle className="w-5 h-5 text-white" />} bg={C.green} label={t('org.students.passRate')} value={`${stats.passRate}%`} />
        <StatCard icon={<Star className="w-5 h-5 text-white" />} bg={C.yellow} label={t('org.students.bestScore')} value={`${stats.best}%`} />
        <StatCard icon={<Zap className="w-5 h-5 text-white" />} bg={C.red} label={t('org.students.correctAnswers', 'Верных')} value={stats.totalQuestions > 0 ? `${stats.totalCorrect}/${stats.totalQuestions}` : '0'} />
        <StatCard icon={<Clock className="w-5 h-5 text-white" />} bg={C.teal} label={t('org.students.totalTime', 'Время')} value={formatTime(stats.totalTime)} />
      </div>

      {/* ═══ Two Column Layout ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Left column — Score Distribution + Parent Portal */}
        <div className="space-y-4">
          {/* Score Distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" style={{ color: C.purple }} />
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{t('org.students.scoreDistribution', 'Распределение')}</h3>
            </div>
            <div className="p-4">
              {results.length === 0 ? (
                <p className="text-center text-[11px] text-slate-400 py-6">{t('org.students.noResults')}</p>
              ) : (
                <div className="space-y-2.5">
                  {[
                    { label: '90-100%', value: scoreDistribution[3], color: C.green, labelShort: t('teacherAnalytics.excellent', 'Отлично') },
                    { label: '70-89%', value: scoreDistribution[2], color: C.blue, labelShort: t('teacherAnalytics.good', 'Хорошо') },
                    { label: '50-69%', value: scoreDistribution[1], color: C.yellow, labelShort: t('teacherAnalytics.satisfactory', 'Удовл.') },
                    { label: '0-49%', value: scoreDistribution[0], color: C.red, labelShort: t('teacherAnalytics.poor', 'Неудовл.') },
                  ].map(b => (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="text-[10px] w-14 text-right text-slate-500 font-medium">{b.labelShort}</span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-700/50 rounded-full h-5 relative overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-1.5"
                          style={{ width: `${Math.max((b.value / maxBucket) * 100, b.value > 0 ? 15 : 0)}%`, backgroundColor: b.color }}
                        >
                          {b.value > 0 && <span className="text-[9px] font-bold text-white">{b.value}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Parent Portal */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-2">
              <Shield className="w-4 h-4" style={{ color: C.teal }} />
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Портал для родителей</h3>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-slate-500 mb-3">Безопасная ссылка для отслеживания успеваемости, без регистрации.</p>
              {student.parentPortalKey ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
                    <Link2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate flex-1 font-mono">{window.location.origin}/parent/{student.parentPortalKey}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/parent/${student.parentPortalKey}`);
                        toast.success('Ссылка скопирована!');
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:shadow-md active:scale-[0.98]"
                      style={{ background: C.teal }}
                    >
                      <Copy className="w-3 h-3" />Копировать
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm('Сбросить ссылку? Родитель больше не сможет по ней зайти.')) {
                          await import('../../lib/api').then(m => m.apiRevokeParentKey(student.uid));
                          setStudent({ ...student, parentPortalKey: undefined });
                          toast.success('Ссылка сброшена');
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 transition-all"
                    >
                      Сбросить
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      const res = await import('../../lib/api').then(m => m.apiGenerateParentKey(student.uid));
                      setStudent({ ...student, parentPortalKey: res.parentPortalKey });
                      toast.success('Ссылка создана!');
                    } catch { toast.error('Ошибка генерации ссылки'); }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:shadow-lg active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${C.purple} 0%, ${C.blue} 100%)` }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />Создать ссылку
                </button>
              )}
            </div>
          </div>

          {/* Finances Block */}
          {isAdmin && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Финансы</h3>
              </div>
              <div className="p-4 space-y-3">
                {paymentPlans.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-2">Счетов не найдено</p>
                ) : (
                  paymentPlans.map(plan => {
                    const debt = Math.max(0, plan.totalAmount - plan.paidAmount);
                    return (
                      <div key={plan.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-600">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{plan.courseName || 'Счёт'}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${debt > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {debt > 0 ? 'Долг' : 'Оплачено'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mb-2 flex justify-between">
                          <span>Сумма: {plan.totalAmount} c.</span>
                          <span>Оплачено: {plan.paidAmount} c.</span>
                        </div>
                        {debt > 0 && (
                          <button
                            onClick={() => {
                              setPayModalPlan(plan);
                              setPayAmount(String(debt));
                              setPayComment('');
                            }}
                            className="w-full mt-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors"
                          >
                            Принять оплату: {debt} c.
                          </button>
                        )}
                      </div>
                    );
                  })
                )}

                {transactions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">История оплат</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {transactions.filter(t => t.type === 'income').map(tx => (
                        <div key={tx.id} className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <Receipt className="w-3 h-3 text-emerald-500" />
                            <span className="text-slate-600 dark:text-slate-300">{new Date(tx.date || tx.createdAt).toLocaleDateString()}</span>
                          </div>
                          <span className="font-bold text-emerald-600">+{tx.amount} c.</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column — Results Table */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderBottomColor: C.purple, borderBottomWidth: '2px' }}>
              <Trophy className="w-4 h-4" style={{ color: C.purple }} />
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{t('org.students.recentResults')}</h3>
              <span className="text-[10px] text-slate-400 ml-auto font-semibold">{results.length} {t('results.attempts', 'попыток')}</span>
            </div>
            {sortedResults.length === 0 ? (
              <div className="text-center py-16">
                <BarChart3 className="w-10 h-10 mx-auto mb-2" style={{ color: C.purple, opacity: 0.15 }} />
                <p className="text-xs font-bold text-slate-400">{t('org.students.noResults')}</p>
                <p className="text-[10px] text-slate-400 mt-1">Результаты появятся после участия в экзаменах</p>
              </div>
            ) : (
              <div className="max-h-[480px] overflow-y-auto">
                {sortedResults.map((r, i) => {
                  const pct = r.percentage || 0;
                  const barColor = pct >= 90 ? C.green : pct >= 70 ? C.blue : pct >= 50 ? C.yellow : C.red;
                  return (
                    <div key={r.id} className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50/80 dark:hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => navigate(`/results/${r.id}`)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md text-white flex-shrink-0" style={{ backgroundColor: C.purple }}>#{sortedResults.length - i}</span>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{r.examTitle}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${r.passed ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-red-50 dark:bg-red-900/20 text-red-500'}`}>
                            {r.passed ? t('common.passed') : t('common.failed')}
                          </span>
                          <span className="text-sm font-extrabold" style={{ color: barColor }}>{pct}%</span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-slate-100 dark:bg-slate-700/50 rounded-full h-1.5 mb-1.5">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-slate-400">
                        <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" />{new Date(r.submittedAt).toLocaleDateString()}</span>
                        {r.timeSpentSeconds && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{formatTime(r.timeSpentSeconds)}</span>}
                        {r.questionResults && (
                          <span className="flex items-center gap-0.5">
                            <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                            {r.questionResults.filter(q => q.isCorrect).length}/{r.questionResults.length}
                          </span>
                        )}
                        {r.score !== undefined && <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5 text-amber-500" />{r.score}/{r.totalPoints} {t('quiz.points', 'б.')}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pay Modal */}
      {payModalPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Оплата: {payModalPlan.courseName || 'Счёт'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Сумма (сом)</label>
                <input type="number" autoFocus value={payAmount} onChange={e => setPayAmount(e.target.value)} max={payModalPlan.totalAmount - payModalPlan.paidAmount} className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm font-bold dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Комментарий</label>
                <input type="text" value={payComment} onChange={e => setPayComment(e.target.value)} placeholder="Наличные / Перевод" className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:text-white" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setPayModalPlan(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Отмена</button>
              <button 
                disabled={paying || !payAmount || Number(payAmount) <= 0}
                onClick={async () => {
                  setPaying(true);
                  try {
                    await apiCreateTransaction({
                      type: 'income', amount: Number(payAmount), date: new Date().toISOString(), categoryId: 'course_fee',
                      paymentPlanId: payModalPlan.id, studentId: uid, courseId: payModalPlan.courseId,
                      description: payComment || 'Оплата по счету'
                    });
                    toast.success('Оплата принята');
                    setPayModalPlan(null);
                    await loadFinances();
                  } catch (e: any) { alert(e.message); } finally { setPaying(false); }
                }}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
              >
                {paying ? '...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Прикрепить к группе</h2>
             <p className="text-xs text-slate-500 mb-4">Выберите группу для ученика <b>{student.displayName}</b>.</p>
             
             {(() => {
               const availableGroups = allGroups.filter(g => !(g.studentIds || []).includes(uid!));
               if (availableGroups.length === 0) {
                 return (
                   <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-3 rounded-xl text-xs font-medium mb-4 border border-amber-200/50">
                     Нет доступных групп.
                   </div>
                 );
               }
               return (
                 <select 
                   value={selectedGroupId} 
                   onChange={e => setSelectedGroupId(e.target.value)}
                   className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500 mb-5"
                 >
                   <option value="">-- Выберите группу --</option>
                   {availableGroups.map(g => (
                     <option key={g.id} value={g.id}>{g.name} ({g.courseName || 'Без курса'})</option>
                   ))}
                 </select>
               );
             })()}

             <div className="flex justify-end gap-2">
               <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                 Отмена
               </button>
               <button 
                 onClick={handleAssignGroup} 
                 disabled={!selectedGroupId || assigning}
                 className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-all active:scale-[0.98] shadow-md shadow-blue-500/20 flex items-center gap-2"
               >
                 {assigning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> ...</> : 'Прикрепить'}
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Reusable Stats Card Component ─── */
const StatCard: React.FC<{ icon: React.ReactNode; bg: string; label: string; value: string | number }> = ({ icon, bg, label, value }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-extrabold text-slate-900 dark:text-white truncate">{value}</p>
        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">{label}</p>
      </div>
    </div>
  </div>
);

export default StudentDetailPage;
