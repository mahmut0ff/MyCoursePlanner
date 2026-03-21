import React, { useEffect, useState, useCallback } from 'react';
import { adminGetUsers, adminGetUser, adminUpdateUserRole, adminDisableUser, adminEnableUser, adminResetPassword } from '../../lib/api';
import { Search, Ban, Check, Key, X } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = { super_admin: 'bg-red-100 text-red-700', admin: 'bg-violet-100 text-violet-700', teacher: 'bg-blue-100 text-blue-700', student: 'bg-emerald-100 text-emerald-700' };

const AdminUsersPage: React.FC = () => {
  const [data, setData] = useState<{ users: any[]; total: number }>({ users: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const openDetail = async (uid: string) => {
    setDetailLoading(true);
    try { setSelected(await adminGetUser(uid)); } catch (e) { console.error(e); }
    finally { setDetailLoading(false); }
  };

  const handleRoleChange = async (uid: string, newRole: string) => { await adminUpdateUserRole(uid, newRole); openDetail(uid); load(); };
  const handleDisable = async (uid: string) => { if (!confirm('Disable this user?')) return; await adminDisableUser(uid); openDetail(uid); load(); };
  const handleEnable = async (uid: string) => { await adminEnableUser(uid); openDetail(uid); load(); };
  const handleReset = async (email: string) => {
    try { const res = await adminResetPassword(email); alert(`Password reset link generated:\n${res.link}`); } catch (e: any) { alert(`Error: ${e.message}`); }
  };

  return (
    <div className="flex h-[calc(100vh-120px)]">
      <div className={`flex-1 min-w-0 ${selected ? 'hidden lg:block' : ''}`}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500 text-sm">{data.total} users across all organizations</p>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Search by name or email..." />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input w-auto">
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </select>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b"><tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Organization</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">Created</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.users.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50 dark:bg-slate-700/50 cursor-pointer" onClick={() => openDetail(u.uid)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-bold text-primary-700">{u.displayName?.[0]?.toUpperCase() || '?'}</div>
                      <div><p className="text-sm font-medium text-slate-900">{u.displayName}</p><p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{u.email}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[u.role] || ''}`}>{u.role}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{u.organizationName || '—'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${u.disabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{u.disabled ? 'disabled' : 'active'}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.users.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">{loading ? 'Loading...' : 'No users found'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="w-full lg:w-[400px] lg:ml-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50 dark:bg-slate-700/50">
            <h2 className="font-semibold text-slate-900 dark:text-white truncate">{selected.displayName}</h2>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:text-slate-500"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {detailLoading ? <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div> : (
              <>
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-2xl font-bold text-primary-700 mx-auto mb-2">{selected.displayName?.[0]?.toUpperCase()}</div>
                  <p className="font-semibold text-slate-900">{selected.displayName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{selected.email}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-slate-500 text-xs">Role</p><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[selected.role] || ''}`}>{selected.role}</span></div>
                  <div><p className="text-slate-500 text-xs">Status</p><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${selected.disabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{selected.disabled ? 'disabled' : 'active'}</span></div>
                  <div><p className="text-slate-500 text-xs">Organization</p><p className="font-medium text-slate-900">{selected.organizationName || '—'}</p></div>
                  <div><p className="text-slate-500 text-xs">Created</p><p className="font-medium text-slate-900">{new Date(selected.createdAt).toLocaleDateString()}</p></div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-2">Change Role</h4>
                  <div className="flex gap-2 flex-wrap">
                    {['admin', 'teacher', 'student'].map((r) => (
                      <button key={r} disabled={selected.role === r} onClick={() => handleRoleChange(selected.uid, r)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selected.role === r ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-200'}`}>{r}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-2">Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.disabled ? (
                      <button onClick={() => handleEnable(selected.uid)} className="btn-primary text-xs flex items-center gap-1"><Check className="w-3 h-3" />Enable</button>
                    ) : (
                      <button onClick={() => handleDisable(selected.uid)} className="btn-secondary text-xs flex items-center gap-1"><Ban className="w-3 h-3" />Disable</button>
                    )}
                    <button onClick={() => handleReset(selected.email)} className="btn-secondary text-xs flex items-center gap-1"><Key className="w-3 h-3" />Reset Password</button>
                  </div>
                </div>

                {selected.recentAttempts?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-2">Recent Exams</h4>
                    <div className="space-y-2">
                      {selected.recentAttempts.slice(0, 5).map((a: any) => (
                        <div key={a.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 text-sm">
                          <p className="font-medium text-slate-900">{a.examTitle}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{a.percentage}% · {new Date(a.submittedAt).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsersPage;
