import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Search, Loader2, ShieldCheck, Users as UsersIcon, Mail } from 'lucide-react';
import { apiGetTeamMembers, apiGetRoles, apiAssignRole } from '../../lib/api';
import { roleAccent, type OrgRole } from '../../lib/rbac';

interface Member {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  roles?: string[];
  roleId: string | null;
  avatarUrl?: string;
}

const BASE_ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  manager: 'Менеджер',
  teacher: 'Преподаватель',
  mentor: 'Наставник',
  student: 'Студент',
};

const isFullAccessRole = (r: string) => r === 'admin' || r === 'owner';

const MembersTab: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingUid, setSavingUid] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([apiGetTeamMembers(), apiGetRoles()]);
      setMembers(m.items || []);
      setRoles(r.items || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const assign = async (member: Member, roleId: string) => {
    const next = roleId || null;
    setSavingUid(member.uid);
    try {
      await apiAssignRole(member.uid, next);
      setMembers(prev => prev.map(m => m.uid === member.uid ? { ...m, roleId: next } : m));
      toast.success(t('team.roleAssigned', 'Роль назначена'));
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally { setSavingUid(null); }
  };

  const filtered = members.filter(m =>
    m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('common.search', 'Поиск') + '...'}
          className="input pl-9 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <UsersIcon className="w-9 h-9 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500">{t('team.noMembers', 'Сотрудники не найдены.')}</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
          {filtered.map(member => {
            const heldRoles = member.roles?.length ? member.roles : [member.role];
            const accent = roleAccent({ id: member.role, name: member.role });
            const full = heldRoles.some(isFullAccessRole);
            return (
              <div key={member.uid} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                {/* Identity */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: accent }}>
                      {member.displayName?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{member.displayName || '—'}</p>
                    {member.email && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" />{member.email}</p>
                    )}
                  </div>
                </div>

                {/* Base role badges — a member may hold several roles (multi-role) */}
                <div className="flex flex-wrap gap-1 self-start sm:self-auto shrink-0">
                  {heldRoles.map(r => {
                    const rAccent = roleAccent({ id: r, name: r });
                    return (
                      <span
                        key={r}
                        className="text-[10px] font-bold px-2 py-1 rounded-full"
                        style={{ background: `${rAccent}1a`, color: rAccent }}
                      >
                        {BASE_ROLE_LABELS[r] || r}
                      </span>
                    );
                  })}
                </div>

                {/* Role assignment */}
                <div className="sm:w-56 shrink-0">
                  {full ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" /> {t('team.fullAccess', 'Полный доступ')}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        className="input text-sm !py-1.5"
                        value={member.roleId || ''}
                        disabled={!isAdmin || savingUid === member.uid}
                        onChange={e => assign(member, e.target.value)}
                      >
                        <option value="">{t('team.defaultForRole', 'По умолчанию для роли')}</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {savingUid === member.uid && <Loader2 className="w-4 h-4 animate-spin text-primary-500 shrink-0" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {roles.length === 0 && isAdmin && (
        <p className="text-xs text-slate-400 text-center">
          {t('team.noRolesHint', 'Создайте роли во вкладке «Роли и доступы», чтобы назначать их сотрудникам.')}
        </p>
      )}
    </div>
  );
};

export default MembersTab;
