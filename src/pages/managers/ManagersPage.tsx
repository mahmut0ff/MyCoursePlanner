import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetManagers, orgCreateManager, apiRemoveMember, apiDeleteMember } from '../../lib/api';
import { UserPlus, Search, Mail, RefreshCw, Phone, ShieldCheck, Lock, User, Trash2, UserMinus } from 'lucide-react';
import type { UserProfile } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

const ManagersPage: React.FC = () => {
  const { t } = useTranslation();
  const { organizationId } = useAuth();
  const [managers, setManagers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create Form State
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: ''
  });

  const load = () => {
    setLoading(true);
    setError('');
    orgGetManagers()
      .then((data: any) => {
        const managersOnly = (Array.isArray(data) ? data : []).filter(
          (u: any) => u.role === 'manager'
        );
        setManagers(managersOnly);
      })
      .catch((e: any) => setError(e.message || 'Error'))
      .finally(() => setLoading(false));
  };
  
  useEffect(() => { load(); }, []);

  const filtered = managers.filter((m) => 
    m.displayName?.toLowerCase().includes(search.toLowerCase()) || 
    m.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!formData.email.trim() || !formData.displayName.trim() || !formData.password.trim()) {
      setError('Заполните все поля');
      return;
    }
    setSaving(true); 
    setError('');
    try {
      await orgCreateManager({
        email: formData.email.trim(),
        displayName: formData.displayName.trim(),
        password: formData.password.trim()
      });
      setShowCreate(false); 
      setFormData({ displayName: '', email: '', password: '' });
      setSuccess('Менеджер успешно создан'); 
      setTimeout(() => setSuccess(''), 3000);
      load();
    } catch (e: any) { 
      setError(e.message || t('common.loadError', 'Ошибка')); 
    } finally { 
      setSaving(false); 
    }
  };

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">Менеджеры</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{managers.length} всего</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0">
            <UserPlus className="w-4 h-4" />
            Добавить менеджера
          </button>
        </div>
      </div>

      {success && <div className="mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-600 dark:text-emerald-400">{success}</div>}
      {error && <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

      {/* Unified Filter Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
            className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={search ? 'Менеджеры не найдены' : 'Менеджеров пока нет'}
          description={search ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первого менеджера'}
          actionLabel="Добавить менеджера"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_200px_140px_100px_80px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>Менеджер</span>
            <span>{t('common.email', 'Email')}</span>
            <span>{t('common.phone')}</span>
            <span>{t('org.users.role')}</span>
            <span></span>
          </div>

          {filtered.map((manager) => (
            <div
              key={manager.uid}
              onClick={() => navigate(`/managers/${manager.uid}`)}
              className="cursor-pointer group flex flex-col md:grid md:grid-cols-[1fr_200px_140px_100px_80px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors"
            >
              {/* Name + avatar */}
              <div className="flex items-center gap-3 min-w-0 w-full">
                {manager.avatarUrl ? (
                  <img src={manager.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 shrink-0 hover:scale-110 transition-transform" />
                ) : (
                  <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-sm shrink-0">
                    {manager.displayName?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{manager.displayName}</h3>
                  {/* Mobile meta */}
                  <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                    {manager.email && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{manager.email}</span>}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Управляющий</span>
                  </div>
                </div>
              </div>

              {/* Email */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{manager.email}</span>
              </div>

              {/* Phone */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {manager.phone ? (
                  <><Phone className="w-3.5 h-3.5 text-slate-400" /><span>{manager.phone}</span></>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </div>

              {/* Role */}
              <div className="hidden md:block">
                <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Управляющий</span>
              </div>

              {/* Actions */}
              <div className="hidden md:flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={async () => {
                    if (!organizationId) return;
                    if (!window.confirm(`Убрать ${manager.displayName} из организации?`)) return;
                    try {
                      await apiRemoveMember(manager.uid, organizationId);
                      toast.success('Менеджер убран');
                      load();
                    } catch (e: any) { toast.error(e.message || 'Ошибка'); }
                  }}
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                  title="Убрать из организации"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (!organizationId) return;
                    if (!window.confirm(`Полностью удалить ${manager.displayName}? Это необратимо.`)) return;
                    try {
                      await apiDeleteMember(manager.uid, organizationId);
                      toast.success('Менеджер удалён');
                      load();
                    } catch (e: any) { toast.error(e.message || 'Ошибка'); }
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                  title="Удалить полностью"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Manager Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Создать менеджера</h2>
            <p className="text-xs text-slate-500 mb-6">Учетная запись будет создана немедленно.</p>
            
            {error && <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">ФИО менеджера</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                    placeholder="ФИО менеджера"
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Email адрес</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="Email адрес"
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Временный пароль</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="Временный пароль"
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => setShowCreate(false)} 
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
                Отмена
              </button>
              <button 
                onClick={handleCreate} 
                disabled={saving || !formData.email || !formData.displayName || !formData.password}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                {saving ? 'Создание...' : 'Добавить менеджера'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagersPage;
