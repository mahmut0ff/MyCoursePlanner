import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, Check, Plus, Search, LogOut } from 'lucide-react';
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
  onSwitch?: () => void;
}

const OrgSwitcher: React.FC<OrgSwitcherProps> = ({ currentOrgId, onSwitch }) => {
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
    if (orgId === currentOrgId) {
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

  const roleLabels: Record<string, string> = {
    owner: t('membership.owner', 'Владелец'),
    admin: t('membership.admin', 'Админ'),
    teacher: t('membership.teacher', 'Преподаватель'),
    mentor: t('membership.mentor', 'Ментор'),
    student: t('membership.student', 'Студент'),
  };

  if (!loaded) return null;

  // ═══ 0 memberships: CTA to discover organizations ═══
  if (memberships.length === 0) {
    return (
      <div className="px-3 py-2">
        <button
          onClick={() => navigate('/directory')}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-violet-500/15 to-indigo-500/15 border border-violet-500/25 hover:border-violet-400/40 transition text-left group"
        >
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Search className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-violet-300 font-medium">{t('membership.findCenter', 'Найти учебный центр')}</p>
            <p className="text-[10px] text-slate-500">{t('membership.browseOrgs', 'Каталог организаций')}</p>
          </div>
          <Plus className="w-3.5 h-3.5 text-violet-500 group-hover:text-violet-300 transition" />
        </button>
      </div>
    );
  }

  // ═══ Leave confirmation modal ═══
  const leaveModal = confirmLeave && (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setConfirmLeave(null)} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-[#1a2332] border border-slate-600/30 rounded-2xl p-5 w-72 shadow-2xl">
        <h4 className="text-sm font-semibold text-white mb-2">{t('membership.leaveConfirmTitle', 'Покинуть организацию?')}</h4>
        <p className="text-xs text-slate-400 mb-4">
          {t('membership.leaveConfirmMsg', 'Вы потеряете доступ к курсам, дневнику и чату этой организации.')}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmLeave(null)}
            className="flex-1 px-3 py-2 text-xs rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 transition"
          >
            {t('common.cancel', 'Отмена')}
          </button>
          <button
            onClick={() => handleLeave(confirmLeave)}
            disabled={switching}
            className="flex-1 px-3 py-2 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition font-medium"
          >
            {switching ? '...' : t('membership.leaveBtn', 'Покинуть')}
          </button>
        </div>
      </div>
    </>
  );

  // ═══ 1 membership: show current org + leave option ═══
  if (memberships.length === 1) {
    const m = currentMembership || memberships[0];
    const canLeave = m.role !== 'owner';
    return (
      <div className="px-3 py-2">
        {leaveModal}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5">
          <Building2 className="w-4 h-4 text-violet-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-300 truncate font-medium">{m.organizationName}</p>
            <p className="text-[10px] text-violet-400 font-medium">{roleLabels[m.role] || m.role}</p>
          </div>
          <div className="flex items-center gap-0.5">
            {canLeave && (
              <button
                onClick={() => setConfirmLeave(m.organizationId)}
                className="p-1 rounded-md hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition"
                title={t('membership.leave', 'Покинуть')}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => navigate('/directory')}
              className="p-1 rounded-md hover:bg-white/10 text-slate-500 hover:text-violet-400 transition"
              title={t('membership.findMore', 'Найти ещё')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══ 2+ memberships: full dropdown switcher ═══
  return (
    <div className="relative px-3 py-2">
      {leaveModal}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition text-left"
      >
        <Building2 className="w-4 h-4 text-violet-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 truncate">
            {currentMembership?.organizationName || t('membership.selectOrg', 'Выберите организацию')}
          </p>
          {currentMembership && (
            <p className="text-[10px] text-violet-400 font-medium">{roleLabels[currentMembership.role] || currentMembership.role}</p>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-full mt-1 bg-[#1a2332] border border-slate-600/30 rounded-xl shadow-xl z-50 py-1 max-h-60 overflow-y-auto">
            {memberships.map((m) => (
              <div key={m.organizationId} className="flex items-center hover:bg-white/5 transition">
                <button
                  onClick={() => handleSwitch(m.organizationId)}
                  disabled={switching}
                  className="flex-1 flex items-center gap-2 px-3 py-2 text-left"
                >
                  <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{m.organizationName || m.organizationId}</p>
                    <p className="text-[10px] text-slate-400">{roleLabels[m.role] || m.role}</p>
                  </div>
                  {m.organizationId === currentOrgId && (
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  )}
                </button>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => { setOpen(false); setConfirmLeave(m.organizationId); }}
                    className="p-1.5 mr-2 rounded-md hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition"
                    title={t('membership.leave', 'Покинуть')}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <div className="border-t border-white/5 mt-1 pt-1">
              <button
                onClick={() => { setOpen(false); navigate('/directory'); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-violet-400 hover:bg-white/5 transition"
              >
                <Plus className="w-4 h-4" />
                {t('membership.browseOrgs', 'Найти организации')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OrgSwitcher;
