/**
 * API: Roles & Permissions (RBAC) — custom org roles + member role assignment.
 * Roles live under organizations/{orgId}/roles. Reads require team:read,
 * writes require org admin/owner. Custom roles need a Professional+ plan.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import {
  verifyAuth, hasRole, can,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';
import { sanitizePermissions, sanitizeOverrides } from './utils/rbac';

const now = () => new Date().toISOString();

const STAFF_ROLES = ['admin', 'owner', 'manager', 'teacher', 'mentor'];

async function rbacPlanAllowed(orgId: string): Promise<boolean> {
  try {
    const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
    const planId = orgDoc.data()?.planId;
    return planId === 'professional' || planId === 'enterprise';
  } catch {
    return false;
  }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const orgId = user.organizationId || '';
  if (!orgId) return forbidden('No organization context');

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const rolesCol = adminDb.collection('organizations').doc(orgId).collection('roles');

  try {
    // ─── List custom roles ───
    // Readable by any org member: the permission context resolves the caller's
    // OWN assigned role from this list, so it must not require team:read (a member
    // with a restrictive role still needs to load that role to apply it).
    if (action === 'list') {
      const snap = await rolesCol.orderBy('createdAt', 'asc').get().catch(() => rolesCol.get());
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return ok({ items });
    }

    // ─── List staff members (for role assignment) ───
    if (action === 'members') {
      if (!can(user, 'team', 'read')) return forbidden('No access to team & roles');
      const snap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
        .where('status', '==', 'active').get();
      let members = snap.docs
        .map(d => d.data())
        // Include anyone whose primary OR secondary (multi-role) role is staff.
        .filter((m: any) => {
          const held = [m.role, ...(Array.isArray(m.roles) ? m.roles : [])].filter(Boolean);
          return held.some((r: string) => STAFF_ROLES.includes(r));
        })
        .map((m: any) => {
          const ov = m.permissionOverrides;
          const overrides = ov && (ov.grants?.length || ov.revokes?.length)
            ? { grants: ov.grants || [], revokes: ov.revokes || [] }
            : null;
          return {
            uid: m.userId, displayName: m.userName, email: m.userEmail,
            role: m.role,
            roles: (Array.isArray(m.roles) && m.roles.length ? m.roles : (m.role ? [m.role] : [])),
            roleId: m.roleId || null,
            overrides,
            branchIds: m.branchIds || [], status: m.status || 'active',
          };
        });

      // Enrich with profile avatar/email/phone
      if (members.length) {
        const uids = members.map(m => m.uid);
        const profileMap = await getDocsByIds('users', uids);
        members = members.map(m => {
          const p = profileMap[m.uid] || {};
          return { ...m, email: m.email || p.email || '', avatarUrl: p.avatarUrl || p.photoURL || '', phone: p.phone || '' };
        });
      }
      return ok({ items: members });
    }

    // ─── Create custom role ───
    if (action === 'create') {
      if (!hasRole(user, 'admin')) return forbidden('Only org admins can manage roles');
      if (!(await rbacPlanAllowed(orgId))) return badRequest('Custom roles require the Professional plan or higher.');
      const body = JSON.parse(event.body || '{}');
      const name = (body.name || '').trim();
      if (!name) return badRequest('Role name is required');
      const permissions = sanitizePermissions(body.permissions);
      const ref = rolesCol.doc();
      const role = {
        name,
        description: (body.description || '').trim(),
        permissions,
        baseRole: body.baseRole || 'manager',
        isSystem: false,
        isDefault: false,
        organizationId: orgId,
        createdAt: now(),
        updatedAt: now(),
      };
      await ref.set(role);
      return ok({ id: ref.id, ...role });
    }

    // ─── Update custom role ───
    if (action === 'update') {
      if (!hasRole(user, 'admin')) return forbidden('Only org admins can manage roles');
      if (!(await rbacPlanAllowed(orgId))) return badRequest('Custom roles require the Professional plan or higher.');
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('Role id is required');
      const ref = rolesCol.doc(body.id);
      const doc = await ref.get();
      if (!doc.exists) return notFound('Role not found');
      if (doc.data()?.isSystem) return badRequest('System roles cannot be edited');
      const update: Record<string, any> = { updatedAt: now() };
      if (body.name !== undefined) update.name = String(body.name).trim();
      if (body.description !== undefined) update.description = String(body.description).trim();
      if (body.permissions !== undefined) update.permissions = sanitizePermissions(body.permissions);
      if (body.baseRole !== undefined) update.baseRole = body.baseRole;
      await ref.update(update);
      return ok({ id: body.id, ...update });
    }

    // ─── Delete custom role ───
    if (action === 'delete') {
      if (!hasRole(user, 'admin')) return forbidden('Only org admins can manage roles');
      const body = JSON.parse(event.body || '{}');
      const id = body.id || params.id;
      if (!id) return badRequest('Role id is required');
      const ref = rolesCol.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return notFound('Role not found');
      if (doc.data()?.isSystem) return badRequest('System roles cannot be deleted');

      // Block deletion while assigned — surface an actionable reason.
      const assigned = await adminDb.collection('orgMembers').doc(orgId).collection('members')
        .where('roleId', '==', id).limit(1).get();
      if (!assigned.empty) {
        return badRequest('Эта роль назначена сотрудникам. Сначала переназначьте их на другую роль.');
      }
      await ref.delete();
      return ok({ id, deleted: true });
    }

    // ─── Assign a role to a member ───
    if (action === 'assign') {
      if (!hasRole(user, 'admin')) return forbidden('Only org admins can assign roles');
      if (!(await rbacPlanAllowed(orgId))) return badRequest('Custom roles require the Professional plan or higher.');
      const body = JSON.parse(event.body || '{}');
      const uid = body.uid;
      const roleId: string | null = body.roleId || null;
      if (!uid) return badRequest('uid is required');

      // Validate the target role exists (when not clearing) and capture its base role.
      let baseRole: string | null = null;
      if (roleId) {
        const roleDoc = await rolesCol.doc(roleId).get();
        if (!roleDoc.exists) return notFound('Role not found');
        baseRole = roleDoc.data()?.baseRole || 'manager';
      }

      const memberRef = adminDb.collection('orgMembers').doc(orgId).collection('members').doc(uid);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) return notFound('Member not found');

      const update: Record<string, any> = { roleId: roleId, updatedAt: now() };
      // Assigning a custom role makes its base an actual switchable app role for the
      // member: add it to roles[] so they can switch into it and appear in its lists.
      // (The role's fine-grained permissions already apply via roleId.)
      if (baseRole) {
        const md: any = memberDoc.data() || {};
        const currentRoles: string[] = Array.isArray(md.roles) && md.roles.length
          ? md.roles
          : (md.role ? [md.role] : []);
        if (!currentRoles.includes(baseRole)) update.roles = [...currentRoles, baseRole];
      }

      await memberRef.update(update);
      // Mirror to user-side membership for role resolution in verifyAuth.
      await adminDb.collection('users').doc(uid).collection('memberships').doc(orgId)
        .set(update, { merge: true });

      return ok({ uid, roleId, roles: update.roles });
    }

    // ─── Set per-member permission overrides (grant/revoke on top of the role) ───
    if (action === 'setOverrides') {
      if (!hasRole(user, 'admin')) return forbidden('Only org admins can adjust member permissions');
      if (!(await rbacPlanAllowed(orgId))) return badRequest('Тонкая настройка прав требует тариф Профессиональный или выше.');
      const body = JSON.parse(event.body || '{}');
      const uid = body.uid;
      if (!uid) return badRequest('uid is required');

      // Normalize against the catalog; store empty arrays (treated as "no override") when cleared.
      const sanitized = sanitizeOverrides(body);
      const clean = { grants: sanitized.grants || [], revokes: sanitized.revokes || [] };

      const memberRef = adminDb.collection('orgMembers').doc(orgId).collection('members').doc(uid);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) return notFound('Member not found');

      const update = { permissionOverrides: clean, updatedAt: now() };
      await memberRef.update(update);
      // Mirror to the user-side membership so verifyAuth resolves the caller's own grants.
      await adminDb.collection('users').doc(uid).collection('memberships').doc(orgId)
        .set(update, { merge: true });

      const hasAny = clean.grants.length > 0 || clean.revokes.length > 0;
      return ok({ uid, permissionOverrides: hasAny ? clean : null });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (e: any) {
    console.error(`api-roles error [${action}]:`, e);
    return jsonResponse(500, { error: e.message || 'Internal server error' });
  }
};

export { handler };
