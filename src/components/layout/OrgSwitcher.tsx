import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Building2, ChevronDown, Check, Plus, Search, LogOut,
  Users, Settings, BarChart3, Briefcase, MailOpen,
  FolderOpen
} from 'lucide-react';
import { apiGetMyMemberships, apiSwitchOrg, apiLeaveMembership } from '../../lib/api';

interface MembershipItem {
  id: string;
  organizationId: string;
  organizationName?: string;
  role: string;
  status: string;
}

interface OrgSwitcherProps {
  currentOrgId?: string;
  userRole?: string | null;
  onSwitch?: () => void;
  onClose?: () => void;
}

const OrgSwitcher: React.FC<OrgSwitcherProps> = ({ currentOrgId, userRole, onSwitch, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  useEffect(() => {
    apiGetMyMemberships()
      .then((data: any) => {
        const active = (Array.isArray(data) ? data : []).filter((m: any) => m.status === 'active');
        setMemberships(active);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const currentMembership = memberships.find((m) => m.organizationId === currentOrgId);

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrgId || (orgId === 'personal' && !currentOrgId)) { 
      setOpen(false); 
      return; 
    }
    setSwitching(true);
    try {
      await apiSwitchOrg(orgId);
      setOpen(false);
      onSwitch?.();
      window.location.reload();
    } catch (e) {
      console.error('Switch org failed:', e);
    } finally {
      setSwitching(false);
    }
  };

  const handleLeave = async (orgId: string) => {
    setSwitching(true);
    try {
      await apiLeaveMembership(orgId);
      window.location.reload();
    } catch (e) {
      console.error('Leave org failed:', e);
    } finally {
      setSwitching(false);
      setConfirmLeave(null);
    }
  };

  const nav = (path: string) => {
    setOpen(false);
    onClose?.();
    navigate(path);
  };

  const roleLabels: Record<string, string> = {
    owner: t('membership.owner', 'Владелец'),
    admin: t('membership.admin', 'Директор'),
    teacher: t('membership.teacher', 'Преподаватель'),
    mentor: t('membership.mentor', 'Ментор'),
    student: t('membership.student', 'Студент'),
    manager: t('membership.manager', 'Менеджер'),
  };

  if (!loaded) return <div className="px-3 py-2"><div className="h-10 bg-white/5 rounded-xl animate-pulse" /></div>;

  // ═══════════════════════════════════════════════
  // Quick Actions per Role
  // ═══════════════════════════════════════════════
  const getQuickActions = () => {
    const actions: { icon: React.ElementType; label: string; onClick: () => void; color?: string }[] = [];

    if (userRole === 'admin' && currentOrgId) {
      actions.push(
        { icon: Users, label: t('nav.orgUsers', 'Пользователи'), onClick: () => nav('/org-users') },
        { icon: Building2, label: t('org.branches', 'Филиалы'), onClick: () => nav('/branches') },
        { icon: Settings, label: t('nav.settings', 'Настройки'), onClick: () => nav('/org-settings') },
      );
    }

    if (userRole === 'manager' && currentOrgId) {
      actions.push(
        { icon: Users, label: t('nav.orgUsers', 'Пользователи'), onClick: () => nav('/org-users') },
        { icon: BarChart3, label: t('nav.analytics', 'Аналитика'), onClick: () => nav('/teacher-analytics') },
      );
    }

    if (userRole === 'teacher') {
      actions.push(

        { icon: MailOpen, label: t('nav.invites', 'Приглашения'), onClick: () => nav('/invites') },
        { icon: Briefcase, label: t('nav.myApplications', 'Мои заявки'), onClick: () => nav('/my-applications') },
      );
    }

    if (userRole === 'student') {
      actions.push(
        { icon: FolderOpen, label: t('nav.directory', 'Каталог'), onClick: () => nav('/directory'), color: 'text-violet-400' },
      );
    }

    return actions;
  };

  // ═══════════════════════════════════════════════
  // Leave Confirmation Modal
  // ═══════════════════════════════════════════════
  const leaveModal = confirmLeave && (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setConfirmLeave(null)} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-[#1a2332] border border-slate-600/30 rounded-2xl p-5 w-72 shadow-2xl">
        <h4 className="text-sm font-semibold text-white mb-2">{t('membership.leaveConfirmTitle', 'Покинуть организацию?')}</h4>
        <p className="text-xs text-slate-400 mb-4">
          {t('membership.leaveConfirmMsg', 'Вы потеряете доступ к курсам, дневнику и чату этой организации.')}
        </p>
        <div className="flex gap-2">
          <button onClick={() => setConfirmLeave(null)} className="flex-1 px-3 py-2 text-xs rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 transition">
            {t('common.cancel', 'Отмена')}
          </button>
          <button onClick={() => handleLeave(confirmLeave)} disabled={switching} className="flex-1 px-3 py-2 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition font-medium">
            {switching ? '...' : t('membership.leaveBtn', 'Покинуть')}
          </button>
        </div>
      </div>
    </>
  );

  // ═══════════════════════════════════════════════
  // 0 Memberships — Role-specific empty state
  // ═══════════════════════════════════════════════
  if (memberships.length === 0) {
    if (userRole === 'teacher' || userRole === 'manager') {
      return null;
    }

    let emptyTitle = t('membership.findCenter', 'Найти учебный центр');
    let emptySubtitle = t('membership.browseOrgs', 'Каталог организаций');
    let emptyAction = () => nav('/directory');
    let EmptyIcon = Search;

    if (userRole === 'admin') {
      emptyTitle = t('membership.createOrg', 'Создать организацию');
      emptySubtitle = t('membership.setupFirst', 'Настройте свой первый учебный центр');
      EmptyIcon = Plus;
    }

    return (
      <div className="px-3 py-2">
        <button
          onClick={emptyAction}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-violet-500/15 to-indigo-500/15 border border-violet-500/25 hover:border-violet-400/40 transition text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
            <EmptyIcon className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-violet-300 font-semibold">{emptyTitle}</p>
            <p className="text-[10px] text-slate-500">{emptySubtitle}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-violet-500/60 -rotate-90 group-hover:text-violet-300 transition" />
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // Has memberships — Main Launcher
  // ═══════════════════════════════════════════════
  const quickActions = getQuickActions();
  const currentOrg = currentMembership || null; // If null, they are in Personal Workspace

  // Determine "+" button behavior
  const getPlusAction = () => {
    if (userRole === 'admin') return { title: t('org.addBranch', 'Добавить филиал'), action: () => nav('/branches') };

    return { title: t('membership.findMore', 'Найти ещё'), action: () => nav('/directory') };
  };
  const plusAction = getPlusAction();

  return (
    <div className="relative px-3 py-2">
      {leaveModal}

      {/* ── Trigger Button ── */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/[0.08] transition text-left group"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-indigo-500/30 flex items-center justify-center shrink-0 ring-1 ring-white/10">
          {currentOrg ? (
            <Building2 className="w-4 h-4 text-violet-300" />
          ) : (
            <FolderOpen className="w-4 h-4 text-violet-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-white truncate font-semibold leading-tight">
            {currentOrg?.organizationName || t('nav.sectionPersonalWorkspace', 'Личное пространство')}
          </p>
          <p className="text-[10px] text-violet-400/80 font-medium mt-0.5">
            {currentOrg ? (roleLabels[currentOrg.role] || currentOrg.role) : t('nav.independent', 'Независимый профиль')}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* ── Dropdown Panel ── */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-full mt-1 bg-[#151f2e] border border-slate-600/30 rounded-2xl shadow-2xl z-50 overflow-hidden">

            {/* Quick Actions Grid */}
            {quickActions.length > 0 && (
              <div className="p-2 border-b border-white/5">
                <div className="grid grid-cols-3 gap-1">
                  {quickActions.map((a, i) => (
                    <button
                      key={i}
                      onClick={a.onClick}
                      className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg hover:bg-white/5 transition group"
                    >
                      <a.icon className={`w-4 h-4 ${a.color || 'text-slate-400'} group-hover:text-white transition`} />
                      <span className="text-[10px] text-slate-500 group-hover:text-slate-300 text-center leading-tight transition">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Org List */}
            <div className="py-1 max-h-44 overflow-y-auto">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {userRole === 'admin' ? t('org.myBranches', 'Мои филиалы') : t('org.myOrgs', 'Мои организации')}
              </p>
              
              {/* Personal Workspace Option for Teachers/Managers */}
              {userRole !== 'student' && userRole !== 'admin' && (
                <div className="flex items-center hover:bg-white/5 transition mb-1">
                  <button
                    onClick={() => handleSwitch('personal')}
                    disabled={switching}
                    className="flex-1 flex items-center gap-2.5 px-3 py-2 text-left"
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                      !currentOrgId
                        ? 'bg-violet-500/30 text-violet-300 ring-1 ring-violet-400/30'
                        : 'bg-white/5 text-slate-500'
                    }`}>
                      <FolderOpen className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate ${!currentOrgId ? 'text-white font-semibold' : 'text-slate-300'}`}>
                        {t('nav.sectionPersonalWorkspace', 'Личное пространство')}
                      </p>
                      <p className="text-[10px] text-slate-500">{t('nav.independent', 'Независимый профиль')}</p>
                    </div>
                    {!currentOrgId && (
                      <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    )}
                  </button>
                </div>
              )}

              {/* Memberships */}
              {memberships.map((m) => (
                <div key={m.organizationId} className="flex items-center hover:bg-white/5 transition">
                  <button
                    onClick={() => handleSwitch(m.organizationId)}
                    disabled={switching}
                    className="flex-1 flex items-center gap-2.5 px-3 py-2 text-left"
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      m.organizationId === currentOrgId
                        ? 'bg-violet-500/30 text-violet-300 ring-1 ring-violet-400/30'
                        : 'bg-white/5 text-slate-500'
                    }`}>
                      {(m.organizationName || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate ${m.organizationId === currentOrgId ? 'text-white font-semibold' : 'text-slate-300'}`}>
                        {m.organizationName || m.organizationId}
                      </p>
                      <p className="text-[10px] text-slate-500">{roleLabels[m.role] || m.role}</p>
                    </div>
                    {m.organizationId === currentOrgId && (
                      <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    )}
                  </button>
                  {m.role !== 'owner' && m.role !== 'admin' && (
                    <button
                      onClick={() => { setOpen(false); setConfirmLeave(m.organizationId); }}
                      className="p-1.5 mr-2 rounded-md hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition"
                      title={t('membership.leave', 'Покинуть')}
                    >
                      <LogOut className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Footer: + action */}
            <div className="border-t border-white/5 px-1 py-1">
              <button
                onClick={plusAction.action}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-400 hover:bg-white/5 rounded-lg transition font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                {plusAction.title}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OrgSwitcher;
