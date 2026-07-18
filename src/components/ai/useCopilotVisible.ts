import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';

/**
 * Whether the floating AI copilot FAB is currently on screen.
 *
 * Extracted from AdminCopilotWidget because a second caller now needs it: the
 * FAB is `fixed` at the bottom-right with `z-[60]`, so any surface that puts its
 * own control in that corner has to reserve the space or the FAB silently eats
 * the click. The support composer's send button did exactly that.
 *
 * Both callers must agree, hence one source of truth — a copy of this condition
 * in the composer would drift the next time the gate changes (it already moved
 * from a role list to the `ai` grant once).
 */
export function useCopilotVisible(): boolean {
  const { isSuperAdmin, organizationId } = useAuth();
  const { canRead, loaded: permsLoaded } = usePermissions();

  // Gated on the `ai` grant rather than a role list, so this follows RBAC like every
  // other module: admins always pass, managers hold it by default (revocable on
  // /team), and teachers/students hold it only if an admin deliberately grants it.
  // Waiting for `permsLoaded` keeps the button from flashing in before the grants
  // that would hide it have arrived.
  return !isSuperAdmin && !!organizationId && organizationId !== 'personal'
    && permsLoaded && canRead('ai');
}
