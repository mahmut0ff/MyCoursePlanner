import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetManagers, apiRemoveMember, apiDeleteMember, orgGetManagerPermissions, orgUpdateManagerPermissions } from '../../lib/api';
import { ArrowLeft, Mail, Calendar, ShieldCheck, Phone, Trash2, UserMinus, CreditCard, Settings, Users, Building2, Loader2 } from 'lucide-react';
import type { UserProfile } from '../../types';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const C = {
  blue: '#3b82f6',
  indigo: '#6366f1',
  cyan: '#06b6d4',
};

interface ManagerPerms {
  finances: boolean;
  settings: boolean;
  managers: boolean;
  branches: boolean;
}

const PERM_MODULES: { key: keyof ManagerPerms; icon: React.ReactNode; label: string; desc: string }[] = [
  { key: 'finances', icon: <CreditCard className="w-4 h-4" />, label: 'Финансы', desc: 'Транзакции, счета, платёжные планы' },
  { key: 'settings', icon: <Settings className="w-4 h-4" />, label: 'Настройки орг.', desc: 'Редактирование настроек организации' },
  { key: 'managers', icon: <Users className="w-4 h-4" />, label: 'Менеджеры', desc: 'Просмотр, создание и удаление менеджеров' },
  { key: 'branches', icon: <Building2 className="w-4 h-4" />, label: 'Филиалы', desc: 'Управление филиалами и точками' },
];

const ManagerDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { organizationId, role: myRole } = useAuth();
  const isAdmin = myRole === 'admin' || myRole === 'super_admin';

  const [manager, setManager] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<ManagerPerms>({ finances: false, settings: false, managers: false, branches: false });
  const [permsLoading, setPermsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    orgGetManagers()
      .then((all: UserProfile[]) => setManager(all.find((u) => u.uid === uid) || null))
      .catch(() => null)
      .finally(() => setLoading(false));

    if (isAdmin) {
      setPermsLoading(true);
      orgGetManagerPermissions(uid)
        .then((data: any) => setPerms(data.permissions))
        .catch(() => {})
        .finally(() => setPermsLoading(false));
    } else {
      setPermsLoading(false);
    }
  }, [uid]);

  const togglePerm = async (key: keyof ManagerPerms) => {
    if (!uid || !isAdmin) return;
    const newPerms = { ...perms, [key]: !perms[key] };
    setSaving(key);
    try {
      await orgUpdateManagerPermissions(uid, newPerms);
      setPerms(newPerms);
      toast.success(`${!perms[key] ? 'Доступ открыт' : 'Доступ закрыт'}`);
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setSaving(null);
    }
  };

  const handleRemoveManager = async () => {
    if (!manager || !organizationId) return;
    if (!window.confirm('Убрать менеджера из организации? Он потеряет доступ.')) return;
    try {
      await apiRemoveMember(manager.uid, organizationId);
      toast.success('Менеджер убран из организации');
      navigate('/managers');
    } catch (e: any) { toast.error(e.message || 'Ошибка'); }
  };

  const handleDeleteManager = async () => {
    if (!manager || !organizationId) return;
    if (!window.confirm('Полностью удалить менеджера? Это необратимо.')) return;
    try {
      await apiDeleteMember(manager.uid, organizationId);
      toast.success('Менеджер полностью удалён');
      navigate('/managers');
    } catch (e: any) { toast.error(e.message || 'Ошибка'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: `${C.blue}30`, borderTopColor: C.blue }} />
    </div>
  );

  if (!manager) return (
    <div className="text-center py-20">
      <ShieldCheck className="w-14 h-14 mx-auto mb-3" style={{ color: C.blue, opacity: 0.2 }} />
      <p className="text-sm font-bold text-slate-500">{t('common.notFound')}</p>
      <button onClick={() => navigate('/managers')} className="mt-3 text-sm font-bold hover:underline" style={{ color: C.blue }}>{t('common.back')}</button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <button onClick={() => navigate('/managers')} className="flex items-center gap-1.5 text-sm font-bold mb-4 transition-all hover:gap-2.5" style={{ color: C.blue }}>
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Hero Profile Card */}
      <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-6 shadow-sm">
        <div className="h-28 sm:h-32 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.blue} 0%, ${C.indigo} 50%, ${C.cyan} 100%)` }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M30 5 L55 17.5 L55 42.5 L30 55 L5 42.5 L5 17.5 Z\' fill=\'none\' stroke=\'white\' stroke-width=\'1\'/%3E%3C/svg%3E")', backgroundSize: '60px 60px' }} />
          <div className="absolute bottom-3 right-4 flex items-center gap-3">
             <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded-full">
               <Calendar className="w-3.5 h-3.5" />
               <span className="text-[11px] font-bold">с {new Date(manager.createdAt).toLocaleDateString()}</span>
             </div>
          </div>
        </div>

        <div className="px-6 pb-6 relative">
          <div className="absolute -top-10 left-6">
            {manager.avatarUrl ? (
              <img src={manager.avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-xl ring-4 ring-white dark:ring-slate-800" />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl text-white font-extrabold shadow-xl ring-4 ring-white dark:ring-slate-800" style={{ background: `linear-gradient(135deg, ${C.blue} 0%, ${C.indigo} 100%)` }}>
                {manager.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          <div className="pt-12 sm:pt-2 sm:ml-24 flex items-start justify-between flex-wrap gap-4">
             <div>
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{manager.displayName}</h1>
                <div className="flex items-center gap-1.5 mt-1 mb-2">
                   <span className="flex items-center gap-1 text-[11px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded uppercase tracking-wider border border-blue-200 dark:border-blue-800">
                     <ShieldCheck className="w-3 h-3" /> Менеджер
                   </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{manager.email}</span>
                  {manager.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{manager.phone}</span>}
                </div>
             </div>

             {isAdmin && (
               <div className="flex items-center gap-2">
                 <button onClick={handleRemoveManager} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all">
                   <UserMinus className="w-3.5 h-3.5" />Убрать
                 </button>
                 <button onClick={handleDeleteManager} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
                   <Trash2 className="w-3.5 h-3.5" />Удалить
                 </button>
               </div>
             )}
          </div>
        </div>
      </div>
      
      {/* Permissions Panel */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Доступы и права</h2>
          </div>
          <p className="text-[11px] text-slate-500 mb-5">Базовые права (студенты, учителя, курсы, группы, расписание) включены всегда. Дополнительные модули можно настроить ниже.</p>

          {permsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PERM_MODULES.map(mod => (
                <div
                  key={mod.key}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none group ${
                    perms[mod.key]
                      ? 'bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                  onClick={() => togglePerm(mod.key)}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                    perms[mod.key]
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500'
                  }`}>
                    {saving === mod.key ? <Loader2 className="w-4 h-4 animate-spin" /> : mod.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{mod.label}</p>
                    <p className="text-[10px] text-slate-500 truncate">{mod.desc}</p>
                  </div>
                  {/* Toggle Switch */}
                  <div className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${
                    perms[mod.key] ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                  }`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      perms[mod.key] ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Base Permissions Info */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Базовые права (всегда включены)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            'Управление студентами и учителями',
            'Создание и редактирование курсов',
            'Управление группами и расписанием',
            'Одобрение/отклонение заявок',
            'Приглашение новых пользователей',
            'Доступ к урокам и экзаменам',
          ].map((perm, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">{perm}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ManagerDetailPage;
