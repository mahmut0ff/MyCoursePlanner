import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { apiGetMyMemberships, apiSwitchOrg } from '../../lib/api';

interface MembershipItem {
  organizationId: string;
  organizationName?: string;
  role: string;
  status: string;
}

interface StudentOrgFilterProps {
  currentOrgId?: string;
}

const StudentOrgFilter: React.FC<StudentOrgFilterProps> = ({ currentOrgId }) => {
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

  // Don't show if only 1 org
  if (memberships.length <= 1) return null;

  const currentMembership = memberships.find((m) => m.organizationId === currentOrgId);

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrgId) { setOpen(false); return; }
    setSwitching(true);
    try {
      await apiSwitchOrg(orgId);
      setOpen(false);
      window.location.reload();
    } catch (e) {
      console.error('Switch org failed:', e);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <Building2 className="w-3.5 h-3.5 text-primary-500" />
        <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[200px]">
          {currentMembership?.organizationName || t('studentFilter.selectOrg', 'Выберите учебный центр')}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1 min-w-[220px] max-h-48 overflow-y-auto">
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {t('studentFilter.yourOrgs', 'Ваши учебные центры')}
            </p>
            {memberships.map((m) => (
              <button
                key={m.organizationId}
                onClick={() => handleSwitch(m.organizationId)}
                disabled={switching}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left transition"
              >
                <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">
                  {m.organizationName || m.organizationId}
                </span>
                {m.organizationId === currentOrgId && (
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default StudentOrgFilter;
