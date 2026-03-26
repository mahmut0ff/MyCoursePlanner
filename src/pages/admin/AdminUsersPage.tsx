import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminGetUsers } from '../../lib/api';
import { Search } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = { super_admin: 'bg-red-100 text-red-700', admin: 'bg-violet-100 text-violet-700', manager: 'bg-orange-100 text-orange-700', teacher: 'bg-blue-100 text-blue-700', student: 'bg-emerald-100 text-emerald-700' };

const AdminUsersPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<{ users: any[]; total: number }>({ users: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (search) filters.search = search;
      if (roleFilter) filters.role = roleFilter;

      const res = await adminGetUsers(filters);
      setData(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, roleFilter]);

  useEffect(() => { load(); }, [load]);



  return (
    <div>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('admin.users.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{data.total} {t('admin.users.subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder={t('admin.users.search')} />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input w-auto">
            <option value="">{t('admin.users.allRoles')}</option>
            <option value="admin">{t('roles.admin', 'Администратор')}</option>
            <option value="manager">{t('roles.manager', 'Менеджер')}</option>
            <option value="teacher">{t('roles.teacher', 'Преподаватель')}</option>
            <option value="student">{t('roles.student', 'Студент')}</option>
          </select>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b"><tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.users.user')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.users.role')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.users.organization')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.users.status')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.users.created')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.users.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50 dark:bg-slate-700/50 cursor-pointer" onClick={() => navigate(`/admin/users/${u.uid}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.avatarUrl ? (
                         <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm bg-slate-100 dark:bg-slate-700 shrink-0" />
                      ) : (
                         <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-400 shrink-0">{u.displayName?.[0]?.toUpperCase() || '?'}</div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{u.displayName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[u.role] || ''}`}>{u.role}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{u.organizationName || '—'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${u.disabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{u.disabled ? t('common.disabled') : t('common.active')}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.users.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">{loading ? t('common.loading') : t('admin.users.noUsers')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminUsersPage;
