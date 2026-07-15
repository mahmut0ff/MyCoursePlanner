import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import AccessDenied from '../ui/AccessDenied';
import type { RbacAction } from '../../lib/rbac';

interface PermissionRouteProps {
  resource: string;
  action?: RbacAction;
  children: React.ReactNode;
}

/**
 * Granular route guard. Full-access roles (admin / owner / super_admin) always pass.
 * Everyone else must hold `resource:action` in their resolved RBAC set, so a custom
 * role or a per-member override that revokes a module blocks the page itself — not
 * just the sidebar link. Waits for the (optional) custom-role fetch so it never
 * flashes "denied" before permissions have resolved.
 */
const PermissionRoute: React.FC<PermissionRouteProps> = ({ resource, action = 'read', children }) => {
  const { role } = useAuth();
  const { can, loaded } = usePermissions();

  if (role === 'admin' || role === 'super_admin') return <>{children}</>;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
      </div>
    );
  }

  if (!can(resource, action)) return <AccessDenied />;

  return <>{children}</>;
};

export default PermissionRoute;
