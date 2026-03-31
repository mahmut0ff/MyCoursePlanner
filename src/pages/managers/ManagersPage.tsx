import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetManagers, orgCreateManager } from '../../lib/api';
import { UserPlus, Search, Mail, RefreshCw, Send, Phone, ShieldCheck, Lock, User } from 'lucide-react';
import type { UserProfile } from '../../types';

const ManagersPage: React.FC = () => {
  const { t } = useTranslation();
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

  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Менеджеры</h1>
            <p className="text-[11px] text-slate-500">{managers.length} всего</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowCreate(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors">
              <UserPlus className="w-3 h-3" />
              Добавить менеджера
            </button>
          </div>
        </div>

        {success && <div className="mb-3 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[11px] text-emerald-500">{success}</div>}

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-2.5 mb-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')}...`}
              className="w-full bg-transparent border-0 pl-7 pr-2 py-1 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ShieldCheck className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Менеджеры не найдены</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/40 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/50">
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">Менеджер</th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden sm:table-cell">{t('common.email', 'Email')}</th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2 hidden md:table-cell">{t('common.phone')}</th>
                  <th className="text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider px-4 py-2">{t('org.users.role')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                {filtered.map((manager) => (
                  <tr key={manager.uid} onClick={() => navigate(`/managers/${manager.uid}`)} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {manager.avatarUrl ? (
                          <img src={manager.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 hover:scale-110 transition-transform" />
                        ) : (
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-[11px] text-white font-bold shadow-sm">
                            {manager.displayName?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{manager.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500 truncate max-w-[200px] hidden sm:table-cell">{manager.email}</td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500 hidden md:table-cell">
                      {manager.phone ? <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{manager.phone}</div> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-500/10 text-blue-500">Управляющий</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Manager Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Создать менеджера</h2>
            <p className="text-[10px] text-slate-500 mb-4">Учетная запись будет создана немедленно.</p>
            
            {error && <div className="mb-3 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-500">{error}</div>}

            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                  placeholder="ФИО менеджера"
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="Email адрес"
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder="Временный пароль"
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button 
                onClick={() => setShowCreate(false)} 
                className="px-2.5 py-1.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                Отмена
              </button>
              <button 
                onClick={handleCreate} 
                disabled={saving || !formData.email || !formData.displayName || !formData.password}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 disabled:opacity-50 transition-colors">
                <ShieldCheck className="w-3 h-3" />
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
