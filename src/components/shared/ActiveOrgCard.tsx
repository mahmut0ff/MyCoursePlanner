import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, Loader2 } from 'lucide-react';
import { apiGetMyMemberships } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

interface MembershipItem {
  organizationId: string;
  organizationName?: string;
  role: string;
  status: string;
}

/**
 * Settings card for switching the active organization.
 *
 * Renders nothing unless the user actually holds more than one active membership,
 * so it can be dropped into any settings surface safely. Mirrors ActiveRoleCard.
 *
 * The sidebar now carries the branch (филиал) switcher instead — organization
 * switching is rare and belongs in settings, not in the primary navigation. This
 * replaces the old StudentOrgFilter, which sat on individual student pages.
 */
const ActiveOrgCard: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const { organizationId, switchOrganization } = useAuth();
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    apiGetMyMemberships()
      .then((data: any) => {
        setMemberships((Array.isArray(data) ? data : []).filter((m: any) => m.status === 'active'));
      })
      .catch(() => {});
  }, []);

  // Only members of several organizations get the switcher.
  if (memberships.length < 2) return null;

  const handleSwitch = async (orgId: string) => {
    if (orgId === organizationId || switching) return;
    setSwitching(orgId);
    try {
      await switchOrganization(orgId);
      // Full reload so route guards, sidebar, branch scope and data contexts all
      // re-derive against the new organization.
      window.location.reload();
    } catch (e) {
      console.error('Switch org failed:', e);
      setSwitching(null);
    }
  };

  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 ${className || ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-teal-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {t('org.activeOrg', 'Активный учебный центр')}
        </h2>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {t('org.switchHint', 'Вы состоите в нескольких учебных центрах. Выберите, в каком работать — интерфейс переключится сразу.')}
      </p>
      <div className="flex gap-2 flex-wrap">
        {memberships.map((m) => {
          const isActive = m.organizationId === organizationId;
          const isLoading = switching === m.organizationId;
          return (
            <button
              key={m.organizationId}
              type="button"
              onClick={() => handleSwitch(m.organizationId)}
              disabled={!!switching}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 max-w-full ${
                isActive
                  ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 ring-1 ring-teal-400/40'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              } disabled:opacity-60`}
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <Building2 className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{m.organizationName || m.organizationId}</span>
              {isActive && !isLoading && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveOrgCard;
