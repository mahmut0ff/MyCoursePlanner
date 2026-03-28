import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminGetOrg, adminSuspendOrg, adminActivateOrg, adminDeleteOrg, adminAddOrgNote, adminChangePlan, adminGiftPlan } from '../../lib/api';
import { ArrowLeft, Building2, Ban, RotateCcw, Trash2, Calendar, MessageSquare, Gift, History } from 'lucide-react';
import toast from 'react-hot-toast';

const PLAN_COLORS: Record<string, string> = { starter: 'bg-blue-100 text-blue-800', professional: 'bg-violet-100 text-violet-800', enterprise: 'bg-amber-100 text-amber-800' };
const STATUS_COLORS: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', suspended: 'bg-red-100 text-red-700', trial: 'bg-amber-100 text-amber-700', deleted: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400' };

const AdminOrgDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [giftingPlan, setGiftingPlan] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try { setOrg(await adminGetOrg(id)); } catch (e: any) { console.error(e); toast.error(e.message || 'Ошибка загрузки организации'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const handleSuspend = async () => { if (!confirm(t('admin.orgs.confirmSuspend'))) return; try { await adminSuspendOrg(id!); toast.success('Организация приостановлена'); load(); } catch (e: any) { toast.error(e.message || 'Ошибка'); } };
  const handleActivate = async () => { try { await adminActivateOrg(id!); toast.success('Организация активирована'); load(); } catch (e: any) { toast.error(e.message || 'Ошибка'); } };
  const handleDelete = async () => { if (!confirm(t('admin.orgs.confirmDelete'))) return; try { await adminDeleteOrg(id!); toast.success('Организация удалена'); navigate('/admin/organizations'); } catch (e: any) { toast.error(e.message || 'Ошибка'); } };
  const handleChangePlan = async (planId: string) => { try { await adminChangePlan(id!, planId); toast.success(`Тариф изменён на ${planId}`); load(); } catch (e: any) { toast.error(e.message || 'Ошибка'); } };
  const handleAddNote = async () => { if (!noteText.trim() || !id) return; try { await adminAddOrgNote(id, noteText); setNoteText(''); toast.success('Заметка добавлена'); load(); } catch (e: any) { toast.error(e.message || 'Ошибка'); } };
  const handleGiftPlan = async (planId: string) => {
    if (!confirm(`Подарить тариф «${planId}» бесплатно для организации «${org?.name}»?`)) return;
    setGiftingPlan(planId);
    try { await adminGiftPlan(id!, planId); toast.success(`🎁 Тариф «${planId}» подарен организации «${org?.name}»`); load(); } catch (e: any) { console.error(e); toast.error(e.message || 'Ошибка при подарке тарифа'); }
    finally { setGiftingPlan(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;
  if (!org) return <div className="text-center py-20"><Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">{t('common.notFound')}</p><button onClick={() => navigate('/admin/organizations')} className="mt-3 text-primary-500 text-sm hover:underline">{t('common.back')}</button></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate('/admin/organizations')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
        <div className="bg-slate-700 h-20" />
        <div className="px-6 pb-6 pt-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{org.name}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{org.ownerEmail}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[org.status] || ''}`}>{org.status}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[org.planId] || ''}`}>{org.planId}</span>
            {org.createdAt && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(org.createdAt).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      {org.usage && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
          {[
            { label: t('dashboard.totalStudents'), value: org.usage.students },
            { label: t('dashboard.totalTeachers'), value: org.usage.teachers },
            { label: 'Admins', value: org.usage.admins },
            { label: t('lessons.title'), value: org.usage.lessons },
            { label: t('exams.title'), value: org.usage.exams },
            { label: t('dashboard.examAttempts'), value: org.usage.attempts },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-[9px] text-slate-500 uppercase">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Plan Change */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('admin.orgs.changePlan')}</h2>
        <div className="flex gap-2">
          {['starter', 'professional', 'enterprise'].map((p) => (
            <button key={p} disabled={org.planId === p} onClick={() => handleChangePlan(p)}
              className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors capitalize ${org.planId === p ? 'bg-primary-100 text-primary-700 cursor-not-allowed' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 🎁 Gift Plan */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Подарить тариф бесплатно</h2>
          {org.subscription?.status === 'gifted' && (
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">🎁 Подарен</span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Организация получит тариф навсегда без оплаты</p>
        <div className="flex gap-2">
          {['starter', 'professional', 'enterprise'].map((p) => (
            <button key={p} disabled={giftingPlan === p} onClick={() => handleGiftPlan(p)}
              className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors capitalize ${org.planId === p && org.subscription?.status === 'gifted' ? 'bg-emerald-500 text-white ring-2 ring-emerald-300' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-slate-200 dark:border-slate-600'}`}>
              {giftingPlan === p ? '...' : `🎁 ${p}`}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('admin.orgs.actions')}</h2>
        <div className="flex flex-wrap gap-2">
          {org.status === 'active' && <button onClick={handleSuspend} className="btn-secondary text-xs flex items-center gap-1"><Ban className="w-3.5 h-3.5" />{t('admin.orgs.suspend')}</button>}
          {org.status !== 'active' && <button onClick={handleActivate} className="btn-primary text-xs flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" />{t('admin.orgs.activate')}</button>}
          <button onClick={handleDelete} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />{t('admin.orgs.delete')}</button>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4 text-amber-500" /><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('admin.orgs.internalNotes')}</h2></div>
        <div className="flex gap-2 mb-3">
          <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} className="input text-sm flex-1" placeholder={t('admin.orgs.addNote')} />
          <button onClick={handleAddNote} className="btn-primary text-xs px-3">{t('admin.orgs.add')}</button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {(org.notes || []).map((n: any) => (
            <div key={n.id} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-lg px-4 py-2.5">
              <p className="text-sm text-slate-800 dark:text-slate-200">{n.note}</p>
              <p className="text-[10px] text-slate-400 mt-1">{n.authorName} · {new Date(n.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {(!org.notes || org.notes.length === 0) && <p className="text-xs text-slate-400 text-center py-3">{t('admin.orgs.noNotes')}</p>}
        </div>
      </div>

      {/* Subscription */}
      {org.subscription && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('admin.orgs.subscription')}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">{t('admin.orgs.status')}</span><span className="font-medium text-slate-900 dark:text-white capitalize">{org.subscription.status}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{t('admin.orgs.periodEnd')}</span><span className="font-medium text-slate-900 dark:text-white">{org.subscription.currentPeriodEnd ? new Date(org.subscription.currentPeriodEnd).toLocaleDateString() : 'Бессрочно'}</span></div>
            {org.subscription.trialEndsAt && <div className="flex justify-between"><span className="text-slate-500">{t('admin.orgs.trialEnds')}</span><span className="font-medium text-slate-900 dark:text-white">{new Date(org.subscription.trialEndsAt).toLocaleDateString()}</span></div>}
          </div>
        </div>
      )}

      {/* 📜 History (Audit Logs) */}
      {org.auditLogs && org.auditLogs.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-primary-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">История организации</h2>
          </div>
          <div className="space-y-3">
            {org.auditLogs.map((log: any) => (
              <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 dark:border-slate-700/50 pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {log.action === 'plan_gifted' ? 'Подарен тариф' : log.action === 'plan_changed' ? 'Изменен тариф' : log.action === 'org_updated' ? 'Организация обновлена' : log.action}
                  </p>
                  {(log.after?.planId || log.before?.planId) && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Тариф: {log.before?.planId || 'отсутствует'} → <span className="font-medium">{log.after?.planId}</span>
                    </p>
                  )}
                  {log.metadata?.reason && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Причина: {log.metadata.reason}</p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs text-slate-600 dark:text-slate-300">{log.actorName || log.actorRole}</p>
                  <p className="text-[10px] text-slate-400">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrgDetailPage;
