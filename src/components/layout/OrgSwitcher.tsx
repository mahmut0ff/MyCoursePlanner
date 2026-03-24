import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronDown, Check, Plus } from 'lucide-react';
import { apiGetMyMemberships, apiSwitchOrg } from '../../lib/api';

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
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    apiGetMyMemberships()
      .then((data: any) => {
        const active = (Array.isArray(data) ? data : []).filter((m: any) => m.status === 'active');
        setMemberships(active);
      })
      .catch(() => {});
  }, []);

  if (memberships.length <= 1) return null; // No switcher needed for 0-1 org

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
      // Force full page reload to reset context
      window.location.reload();
    } catch (e) {
      console.error('Switch org failed:', e);
    } finally {
      setSwitching(false);
    }
  };

  const roleLabels: Record<string, string> = {
    owner: t('membership.owner', 'Владелец'),
    admin: t('membership.admin', 'Админ'),
    teacher: t('membership.teacher', 'Преподаватель'),
    mentor: t('membership.mentor', 'Ментор'),
    student: t('membership.student', 'Студент'),
  };

  return (
    <div className="relative px-3 py-2">
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
              <button
                key={m.organizationId}
                onClick={() => handleSwitch(m.organizationId)}
                disabled={switching}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left transition"
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
            ))}
            <div className="border-t border-white/5 mt-1 pt-1">
              <button
                onClick={() => { setOpen(false); window.location.href = '/organizations'; }}
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
