import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiGetRoles } from '../lib/api';
import { resolvePermissionSet, type OrgRole, type RbacAction } from '../lib/rbac';

interface PermissionsContextType {
  /** True once the (optional) custom-role lookup has settled. */
  loaded: boolean;
  /** Display name of the user's assigned custom role, if any. */
  roleName: string;
  /** Granular check: does the user have `resource:action`? */
  can: (resource: string, action?: RbacAction) => boolean;
  canRead: (resource: string) => boolean;
  canWrite: (resource: string) => boolean;
  canDelete: (resource: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  loaded: false,
  roleName: '',
  can: () => false,
  canRead: () => false,
  canWrite: () => false,
  canDelete: () => false,
});

export const usePermissions = () => useContext(PermissionsContext);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, organizationId, permissions: legacyPerms, membershipRoleId, loading } = useAuth();
  const [customRole, setCustomRole] = useState<OrgRole | null>(null);
  const [roleName, setRoleName] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      setLoaded(false);
      // Admins/super admins are full-access; members without a custom role use
      // system defaults. Neither needs a roles fetch.
      if (!organizationId || !membershipRoleId || role === 'super_admin' || role === 'admin') {
        if (!cancelled) { setCustomRole(null); setRoleName(''); setLoaded(true); }
        return;
      }
      try {
        const res = await apiGetRoles();
        const found = (res.items || []).find((r: any) => r.id === membershipRoleId) || null;
        if (!cancelled) { setCustomRole(found); setRoleName(found?.name || ''); }
      } catch {
        if (!cancelled) setCustomRole(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    if (!loading) resolve();
    return () => { cancelled = true; };
  }, [organizationId, membershipRoleId, role, loading]);

  const permSet = useMemo(
    () => resolvePermissionSet({ baseRole: role, customRole, legacyManagerPerms: legacyPerms }),
    [role, customRole, legacyPerms],
  );

  const value = useMemo<PermissionsContextType>(() => ({
    loaded,
    roleName,
    can: (resource: string, action: RbacAction = 'read') => permSet.has(`${resource}:${action}`),
    canRead: (resource: string) => permSet.has(`${resource}:read`),
    canWrite: (resource: string) => permSet.has(`${resource}:write`),
    canDelete: (resource: string) => permSet.has(`${resource}:delete`),
  }), [permSet, loaded, roleName]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};
