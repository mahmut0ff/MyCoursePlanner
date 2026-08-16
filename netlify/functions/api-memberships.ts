/**
 * API: Memberships — manage user ↔ organization relationships.
 *
 * GET    ?action=orgMembers&orgId=X         → list org members (org admin/owner)
 * GET    ?action=myMemberships              → list current user's memberships
 * GET    ?action=publicMembers&orgId=X      → list public org members (for public profile)
 * POST   ?action=leave                      → user leaves an org
 * POST   ?action=remove                     → org removes a member
 * POST   ?action=restore                    → org restores an expelled student
 * POST   ?action=changeRole                 → set member's role(s) (single or multi-role)
 * POST   ?action=switchOrg                  → switch user's active org context
 * POST   ?action=switchRole                 → switch caller's active role within their active org
 * GET    ?action=memberRoles&orgId&userId   → a member's role set (for multi-role assignment UI)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import type { AuthUser } from './utils/auth';
import { verifyAuth, isSuperAdmin, getMembershipData, memberHoldsRole, resolveOrgGrants, standingIsRosterManager, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { notifyOrgAdmins } from './utils/notifications';
import { isDebtBearingPlan, isUntouchedPlan, planDebt } from './utils/payment-plans';

const now = () => new Date().toISOString();

// Helper: get membership
async function getMembership(userId: string, orgId: string) {
  const doc = await adminDb.collection('users').doc(userId)
    .collection('memberships').doc(orgId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

// Helper: get user's role in an org.
// Reads via getMembershipData so staff whose membership only exists in the
// org-side mirror (managers created before the dual-write fix) still resolve.
async function getOrgRole(userId: string, orgId: string): Promise<string | null> {
  const m = await getMembershipData(userId, orgId);
  if (!m || m.status !== 'active') return null;
  return m.role || null;
}

/**
 * Какой раздел прав распоряжается судьбой этого участника.
 *
 * Отчисление и удаление — операции над РОСТЕРОМ, а не над «участниками вообще»,
 * поэтому спрашиваем то же право, что и экран, с которого действие запускают:
 * студентов закрывает раздел «Студенты», преподавателей — «Преподаватели»,
 * управленцев — «Команда и роли». Так галочка, поставленная директором в /team,
 * действительно означает то, что про неё написано в каталоге.
 *
 * Лестница идёт от старшей роли к младшей, а не наоборот: у мульти-ролевого
 * участника решает САМАЯ привилегированная его роль. Иначе достаточно было бы
 * выдать человеку вдобавок роль студента, чтобы его стало можно убрать правом на
 * контингент — то есть «Студенты: удаление» дотягивалось бы до руководства.
 */
function rosterResourceFor(member: { role?: string; roles?: string[] }): string {
  if (memberHoldsRole(member, ['owner', 'admin'])) return 'team';
  // Преподаватель-управленец удаляется со страницы «Преподаватели», где кнопка
  // закрыта правом teachers:delete — сервер должен спрашивать то же самое.
  if (memberHoldsRole(member, ['teacher', 'mentor'])) return 'teachers';
  if (memberHoldsRole(member, ['manager'])) return 'team';
  return 'students';
}

/**
 * Право на действие с участником — по гранту, а не по названию роли.
 *
 * Раньше здесь стоял захардкоженный список ['admin','owner','manager']. Из-за
 * него весь RBAC мимо этих трёх ручек проходил впустую: сотруднику выдавали в
 * /team кастомную роль с «Студенты: удаление», интерфейс честно показывал ему
 * «Отчислить» (клиент-то спрашивает грант), а сервер отвечал 403 «insufficient
 * role» — потому что в членстве у него значилось, например, 'teacher'. Тем же
 * молчаливым способом отваливался мульти-ролевой участник: getOrgRole читает
 * только первичный `role`, и менеджер с primary 'teacher' прав не имел.
 *
 * Гранты резолвим для ОРГАНИЗАЦИИ ИЗ ЗАПРОСА, а не для активной организации
 * вызывающего: у ручек org приходит телом, и эти две могут не совпадать.
 */
async function requireMemberPermission(
  user: AuthUser,
  orgId: string,
  member: { role?: string; roles?: string[] },
  action: 'write' | 'delete',
): Promise<ReturnType<typeof forbidden> | null> {
  const standing = await resolveOrgGrants(user, orgId);
  if (!standing) return forbidden();
  const resource = rosterResourceFor(member);
  // Над студентами — тот же двойной гейт, что на createStudent и на группах:
  // «ведение контингента» решает, НА КОГО распространяются полномочия (вся
  // организация, а не только свои группы), а students:* — что именно можно.
  // Иначе преподаватель, которому выдали students:delete для своих подопечных,
  // мог бы отчислить кого угодно в организации.
  if (resource === 'students' && !standingIsRosterManager(standing)) {
    return forbidden('Нужно право «Контингент: полное управление» — оно открывает работу со всем ростером организации, а не только со своими группами.');
  }
  // Отказ называет недостающую галочку. Директор, выдавший роль, иначе видит
  // только «недостаточно прав» и не знает, что именно дописать в /team.
  if (!standing.grants.has(`${resource}:${action}`)) {
    return forbidden(`Недостаточно прав: нужно «${RESOURCE_LABEL[resource]}: ${ACTION_LABEL[action]}».`);
  }
  return null;
}

// Названия из каталога ролей (src/lib/rbac.ts) — отказ должен звучать теми же
// словами, что подписаны у галочек в /team.
const RESOURCE_LABEL: Record<string, string> = {
  students: 'Студенты',
  teachers: 'Преподаватели',
  team: 'Команда и роли',
};
const ACTION_LABEL: Record<'write' | 'delete', string> = {
  write: 'изменение',
  delete: 'удаление',
};

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  // Public endpoint: list public org members (teachers)
  if (event.httpMethod === 'GET' && action === 'publicMembers') {
    if (!params.orgId) return badRequest('orgId required');
    // Check org is public
    const orgDoc = await adminDb.collection('organizations').doc(params.orgId).get();
    if (!orgDoc.exists) return notFound('Organization not found');
    const org = orgDoc.data()!;
    if (!org.isPublic && org.status !== 'active') return forbidden();

    const snap = await adminDb.collection('orgMembers').doc(params.orgId)
      .collection('members')
      .where('status', '==', 'active')
      .where('role', 'in', ['teacher', 'mentor', 'owner', 'admin'])
      .get();

    let members = snap.docs.map((d: any) => ({
      id: d.id,
      userId: d.data().userId,
      userName: d.data().userName,
      role: d.data().role,
    }));

    // Enrich with avatarUrl from users collection
    if (members.length > 0) {
      const uids = members.map((m: any) => m.userId).filter(Boolean);
      const profileMap = await getDocsByIds('users', uids);
      members = members.map((m: any) => {
        const p = profileMap[m.userId] || {};
        return { ...m, avatarUrl: p.avatarUrl || '' };
      });
    }

    return ok(members);
  }

  // All other actions require auth
  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  try {
    // ═══ GET: My memberships ═══
    if (event.httpMethod === 'GET' && action === 'myMemberships') {
      const snap = await adminDb.collection('users').doc(user.uid)
        .collection('memberships')
        .where('status', 'in', ['active', 'invited', 'pending'])
        .get();
      let memberships = snap.docs.map((d: any) => ({ id: d.id, organizationId: d.id, ...d.data() }));

      // Self-heal: memberships created via the org admin panel (createTeacher /
      // createStudent / createManager) historically omitted organizationName, so
      // the org switcher fell back to showing the raw org id. Backfill the name
      // from the organizations collection for any doc still missing it.
      const missingIds = memberships.filter((m: any) => !m.organizationName).map((m: any) => m.organizationId);
      if (missingIds.length) {
        const orgMap = await getDocsByIds('organizations', missingIds, ['name']);
        memberships = memberships.map((m: any) =>
          m.organizationName ? m : { ...m, organizationName: orgMap[m.organizationId]?.name || '' }
        );
      }

      return ok(memberships);
    }

    // ═══ GET: A specific member's role set in an org (for the multi-role assignment UI) ═══
    if (event.httpMethod === 'GET' && action === 'memberRoles') {
      if (!params.orgId || !params.userId) return badRequest('orgId and userId required');
      const callerRole = await getOrgRole(user.uid, params.orgId);
      if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();
      const m = await getMembership(params.userId, params.orgId) as any;
      if (!m) return ok({ role: null, roles: [] });
      const roles = Array.isArray(m.roles) && m.roles.length ? m.roles : (m.role ? [m.role] : []);
      return ok({ role: m.role || null, roles });
    }

    // ═══ GET: Org members ═══
    if (event.httpMethod === 'GET' && action === 'orgMembers') {
      if (!params.orgId) return badRequest('orgId required');
      // Must be admin/owner/teacher of the org, or super_admin
      const callerRole = await getOrgRole(user.uid, params.orgId);
      if (!isSuperAdmin(user) && !callerRole) return forbidden();

      const statusFilter = params.status || 'active';
      let query: any = adminDb.collection('orgMembers').doc(params.orgId)
        .collection('members');

      if (statusFilter !== 'all') {
        query = query.where('status', '==', statusFilter);
      }

      if (params.role) {
        query = query.where('role', '==', params.role);
      }

      const snap = await query.get();
      let members = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      // Enrich with avatarUrl, phone from users collection
      if (members.length > 0) {
        const uids = members.map((m: any) => m.userId).filter(Boolean);
        const profileMap = await getDocsByIds('users', uids);
        members = members.map((m: any) => {
          const p = profileMap[m.userId] || {};
          return { 
            ...m, 
            displayName: m.userName || p.displayName || '', 
            email: m.userEmail || p.email || '', 
            avatarUrl: p.avatarUrl || '', 
            phone: p.phone || '', 
            city: p.city || '' 
          };
        });
      }

      return ok(members);
    }

    // ═══ GET: Teacher's own students (from their groups) ═══
    if (event.httpMethod === 'GET' && action === 'teacherStudents') {
      if (!params.orgId) return badRequest('orgId required');
      const orgId = params.orgId;
      const callerRole = await getOrgRole(user.uid, orgId);
      if (!callerRole) return forbidden();

      // 1. Get groups where teacher is assigned
      const groupsSnap = await adminDb.collection('groups')
        .where('organizationId', '==', orgId)
        .get();
      const teacherGroups = groupsSnap.docs.filter((d: any) => {
        const data = d.data();
        const tIds: string[] = data.teacherIds || [];
        return tIds.includes(user.uid) || data.createdBy === user.uid;
      });

      // 2. Collect unique studentIds
      const studentIdSet = new Set<string>();
      for (const g of teacherGroups) {
        const ids: string[] = g.data().studentIds || [];
        ids.forEach(id => { if (id) studentIdSet.add(id); });
      }
      if (studentIdSet.size === 0) return ok([]);

      // 3. Fetch only those students from orgMembers
      const studentIds = Array.from(studentIdSet);
      const memberChunks: string[][] = [];
      for (let i = 0; i < studentIds.length; i += 10) memberChunks.push(studentIds.slice(i, i + 10));
      const memberSnaps = await Promise.all(memberChunks.map((b) =>
        adminDb.collection('orgMembers').doc(orgId).collection('members').where('userId', 'in', b).get()));
      let allStudents: any[] = memberSnaps.flatMap((snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));

      // 4. Enrich with profile data
      if (allStudents.length > 0) {
        const uids = allStudents.map((m: any) => m.userId).filter(Boolean);
        const profileMap = await getDocsByIds('users', uids);
        allStudents = allStudents.map((m: any) => {
          const p = profileMap[m.userId] || {};
          return { 
            ...m, 
            displayName: m.userName || p.displayName || '', 
            email: m.userEmail || p.email || '', 
            avatarUrl: p.avatarUrl || '', 
            phone: p.phone || '', 
            city: p.city || '' 
          };
        });
      }

      return ok(allStudents);
    }

    // ═══ POST: Leave org ═══
    if (event.httpMethod === 'POST' && action === 'leave') {
      const body = JSON.parse(event.body || '{}');
      if (!body.organizationId) return badRequest('organizationId required');

      const membership = await getMembership(user.uid, body.organizationId) as any;
      if (!membership || membership.status !== 'active') return badRequest('Not an active member');
      if (membership.role === 'owner') return badRequest('Owner cannot leave. Transfer ownership first.');

      const ts = now();
      const newStatus = membership.role === 'student' ? 'expelled' : 'left';
      const update = { status: newStatus, leftAt: ts, updatedAt: ts };
      await adminDb.collection('users').doc(user.uid)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(user.uid).update(update);

      // If this was the active org, switch to another
      const userDoc = await adminDb.collection('users').doc(user.uid).get();
      if (userDoc.data()?.activeOrgId === body.organizationId) {
        const otherMemberships = await adminDb.collection('users').doc(user.uid)
          .collection('memberships').where('status', '==', 'active').limit(1).get();

        const nextOrgId = otherMemberships.empty ? '' : otherMemberships.docs[0].id;
        await adminDb.collection('users').doc(user.uid).update({
          activeOrgId: nextOrgId,
          organizationId: nextOrgId,
          updatedAt: ts,
        });
      }

      notifyOrgAdmins(
        body.organizationId, 'invite_declined' as any,
        'Участник покинул организацию',
        `${user.displayName || user.email} покинул(а) организацию`,
        '/students',
      ).catch(() => {});

      // Уход по собственной инициативе закрывает ставку так же, как удаление
      // менеджером: иначе ведомость продолжала бы начислять ушедшему.
      const leftRulesClosed = await closeTeacherRules(body.organizationId, user.uid).catch(() => 0);

      return ok({ left: true, rulesClosed: leftRulesClosed });
    }

    // ═══ POST: Remove member ═══
    /**
     * Убирает ставку преподавателя, покидающего организацию.
     *
     * Строки ведомости строятся ИЗ СТАВОК, а членство payroll-engine использует
     * лишь для диагностики «нет ставки». Поэтому увольнение не влияло на
     * зарплату вообще: ставка «30 000 в месяц» оставалась, и 1-го числа крон
     * payroll-accrual создавал ведомость со строкой уволенного — с его именем
     * (users-док никуда не делся) и полной суммой. Директор утверждал ведомость
     * и выплачивал деньги человеку, который здесь больше не работает.
     *
     * Удаляем, а не помечаем: у ставки больше нет ни статуса, ни срока
     * действия — «убрать ставку» и есть способ прекратить начисления. Историю
     * это не трогает: уже посчитанные ведомости несут замороженный снапшот и
     * карточку ставки не читают. Незакрытый ТЕКУЩИЙ месяц после этого
     * начислится нулём, поэтому увольнять правильно после расчёта месяца — на
     * это и рассчитан порядок «Рассчитать → Утвердить → Выплатить».
     */
    async function closeTeacherRules(organizationId: string, userId: string): Promise<number> {
      // Роль НЕ проверяем. Ставка не появляется сама: если она есть, её завёл
      // человек — и не важно, числится ли владелец 'teacher', 'mentor' или
      // преподающим 'admin'. Прежняя проверка ролей молча пропускала как раз
      // последний случай, а завести такому сотруднику ставку интерфейс
      // позволяет.
      // Только равенства — составной индекс не нужен (CLAUDE.md).
      const snap = await adminDb.collection('compensationRules')
        .where('organizationId', '==', organizationId)
        .where('teacherId', '==', userId)
        .get();
      if (snap.empty) return 0;
      const batch = adminDb.batch();
      for (const d of snap.docs) batch.delete(d.ref);
      await batch.commit();
      return snap.size;
    }

    if (event.httpMethod === 'POST' && action === 'remove') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');

      // Право спрашиваем ПОСЛЕ того, как узнали, кого убираем: раздел прав
      // зависит от роли цели (см. rosterResourceFor).
      const targetMembership = await getMembership(body.userId, body.organizationId) as any;
      if (!targetMembership) return notFound('Member not found');
      // Владельца не убирает никто — даже суперадмин: сначала передача владения.
      // memberHoldsRole, а не `role === 'owner'`: у мульти-ролевого владельца
      // первичной может стоять другая роль, и прежняя проверка его пропускала.
      if (memberHoldsRole(targetMembership, ['owner'])) return badRequest('Cannot remove organization owner');

      // Отчисление — это `delete` по каталогу («Удаление и отчисление студентов»),
      // а не `write`: перевести студента в другую группу и убрать его из
      // организации — разные полномочия.
      const denied = await requireMemberPermission(user, body.organizationId, targetMembership, 'delete');
      if (denied) return denied;

      const ts = now();
      const newStatus = targetMembership.role === 'student' ? 'expelled' : 'removed';
      const update = { status: newStatus, leftAt: ts, updatedAt: ts };
      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).update(update);

      const rulesClosed = await closeTeacherRules(body.organizationId, body.userId).catch(() => 0);

      return ok({ removed: true, rulesClosed });
    }

    // ═══ POST: Restore an expelled student ═══
    // Отчисление — единственное действие над студентом, которое до сих пор было
    // необратимым: вернуть его можно было только заведя заново, потеряв журнал и
    // историю оплат. Восстановление намеренно уже, чем remove: только студенты и
    // только из 'expelled'. Возвращать сюда сотрудников нельзя — их доступ живёт
    // в RBAC, а не в статусе членства.
    if (event.httpMethod === 'POST' && action === 'restore') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');

      const targetMembership = await getMembership(body.userId, body.organizationId) as any;
      if (!targetMembership) return notFound('Member not found');
      if (targetMembership.role !== 'student') return badRequest('Only students can be restored');
      if (targetMembership.status !== 'expelled') return badRequest('Member is not expelled');

      // Восстановление ничего не разрушает — это `write`, как и правка карточки.
      const denied = await requireMemberPermission(user, body.organizationId, targetMembership, 'write');
      if (denied) return denied;

      const ts = now();
      const update = { status: 'active', leftAt: null, updatedAt: ts };
      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).update(update);

      return ok({ restored: true });
    }

    // ═══ POST: Delete member permanently ═══
    if (event.httpMethod === 'POST' && action === 'delete') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');

      const targetMembership = await getMembership(body.userId, body.organizationId) as any;
      if (!targetMembership) return notFound('Member not found');
      if (memberHoldsRole(targetMembership, ['owner'])) return badRequest('Cannot remove organization owner');

      const denied = await requireMemberPermission(user, body.organizationId, targetMembership, 'delete');
      if (denied) return denied;

      // ── Долг нельзя удалить вместе с человеком ──
      // Полное удаление стирало обе записи членства и не трогало счета вовсе.
      // После этого долг продолжал считаться в «Дебиторской задолженности» и в
      // «Должниках» (api-finance-metrics читает только счета, без джойна с
      // членством), а сам человек исчезал из ростера, из списка учеников и из
      // рисков. Директор видел сумму и не мог найти, чья она и как её закрыть.
      //
      // Поэтому спрашиваем: либо разберитесь со счетами, либо подтвердите
      // удаление — тогда нетронутые счета списываются, как при выходе из группы.
      // Оплаченные частично не трогаем никогда: за ними стоят настоящие деньги.
      const plansSnap = await adminDb.collection('studentPaymentPlans')
        .where('organizationId', '==', body.organizationId)
        .where('studentId', '==', body.userId)
        .get();
      const debtPlans = plansSnap.docs.filter(d => isDebtBearingPlan(d.data()));
      if (debtPlans.length > 0 && body.force !== true) {
        const debtTotal = debtPlans.reduce((sum, d) => sum + planDebt(d.data()), 0);
        return jsonResponse(409, {
          error: `У этого участника есть неоплаченные счета: ${debtPlans.length} на сумму ${debtTotal}. `
            + 'После удаления долг останется в отчётах, а закрыть его будет негде. '
            + 'Примите оплату, спишите счета — или подтвердите удаление, и нетронутые счета спишутся автоматически.',
          code: 'member_has_debt',
          debtPlans: debtPlans.length,
          debtTotal,
        });
      }
      if (debtPlans.length > 0) {
        const writeOff = adminDb.batch();
        let cancelled = 0;
        for (const d of debtPlans) {
          if (!isUntouchedPlan(d.data())) continue;
          writeOff.update(d.ref, { status: 'cancelled', updatedAt: now() });
          cancelled++;
        }
        if (cancelled > 0) await writeOff.commit().catch(console.error);
      }

      // Ставки закрываем ДО удаления членства: после него роль уже не прочитать,
      // а ставка осталась бы активной навсегда — её владельца больше нет ни в
      // одном списке, и заметить строку в ведомости было бы неоткуда.
      const rulesClosed = await closeTeacherRules(body.organizationId, body.userId).catch(() => 0);

      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).delete();
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).delete();

      return ok({ deleted: true, rulesClosed });
    }

    // ═══ POST: Change role (single legacy `newRole`, or multi-role `roles[]`) ═══
    if (event.httpMethod === 'POST' && action === 'changeRole') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId || (!body.newRole && !Array.isArray(body.roles))) {
        return badRequest('userId, organizationId, and newRole or roles[] required');
      }

      const callerRole = await getOrgRole(user.uid, body.organizationId);
      if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();

      const validRoles = ['student', 'teacher', 'mentor', 'manager', 'admin'];
      // Accept a single role (legacy) or a set of roles (multi-role membership).
      const roles: string[] = Array.isArray(body.roles) && body.roles.length
        ? [...new Set(body.roles as string[])]
        : [body.newRole];
      const invalid = roles.filter((r) => !validRoles.includes(r));
      if (invalid.length) return badRequest(`Invalid role(s): ${invalid.join(', ')}`);
      if (roles.length === 0) return badRequest('At least one role required');

      const ts = now();
      // `role` stays the primary (roles[0]) for back-compat; `roles` is the full set.
      const update = { role: roles[0], roles, updatedAt: ts };

      // Upsert with merge rather than update() so assigning roles never throws on a
      // membership doc that only exists in one mirror (or not yet at all). When the
      // doc is new we seed identity fields from the user's profile.
      const existing = await getMembership(body.userId, body.organizationId) as any;
      const targetUserDoc = await adminDb.collection('users').doc(body.userId).get();
      const targetUserData = targetUserDoc.data() || {};
      const baseIdentity = existing ? {} : {
        userId: body.userId,
        userEmail: targetUserData.email || '',
        userName: targetUserData.displayName || targetUserData.email || '',
        organizationId: body.organizationId,
        organizationName: targetUserData.organizationName || '',
        status: 'active',
        joinMethod: 'admin_assigned',
        joinedAt: ts,
        createdAt: ts,
      };
      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).set({ ...baseIdentity, ...update }, { merge: true });
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).set({ ...baseIdentity, ...update }, { merge: true });

      // Keep the flat users.role in sync with the primary role so the member's
      // default landing role matches the set — but only when this org is their
      // active context, and never downgrade a platform super_admin. Preserve the
      // member's current active role if it's still granted (don't yank them out).
      const roleMap: Record<string, string> = { owner: 'admin', admin: 'admin', manager: 'manager', teacher: 'teacher', mentor: 'teacher', student: 'student' };
      const activeOrgId = targetUserData.activeOrgId || targetUserData.organizationId;
      if (activeOrgId === body.organizationId && targetUserData.role !== 'super_admin') {
        const primaryAppRole = roleMap[roles[0]] || roles[0];
        const allowedApp = [...new Set(roles.map((r) => roleMap[r] || r))];
        const current = targetUserData.activeRole || targetUserData.role || '';
        const nextActiveRole = allowedApp.includes(current) ? current : primaryAppRole;
        await adminDb.collection('users').doc(body.userId).update({
          role: nextActiveRole,
          activeRole: nextActiveRole,
          updatedAt: ts,
        });
      }

      return ok({ roleChanged: true, role: roles[0], roles });
    }

    // ═══ POST: Set branch assignment ═══
    if (event.httpMethod === 'POST' && action === 'setBranchAssignment') {
      const body = JSON.parse(event.body || '{}');
      if (!body.userId || !body.organizationId) return badRequest('userId and organizationId required');
      if (!Array.isArray(body.branchIds)) return badRequest('branchIds must be an array');

      const callerRole = await getOrgRole(user.uid, body.organizationId);
      if (!isSuperAdmin(user) && !['admin', 'owner'].includes(callerRole || '')) return forbidden();

      // Validate all branchIds belong to this org
      if (body.branchIds.length > 0) {
        const branchesSnap = await adminDb.collection('branches')
          .where('organizationId', '==', body.organizationId)
          .where('isActive', '==', true).get();
        const validIds = new Set(branchesSnap.docs.map(d => d.id));
        const invalid = body.branchIds.filter((id: string) => !validIds.has(id));
        if (invalid.length > 0) return badRequest(`Invalid branchIds: ${invalid.join(', ')}`);
      }

      // Validate primaryBranchId is in branchIds
      const primaryBranchId = body.primaryBranchId || (body.branchIds.length > 0 ? body.branchIds[0] : null);
      if (primaryBranchId && !body.branchIds.includes(primaryBranchId)) {
        return badRequest('primaryBranchId must be included in branchIds');
      }

      const ts = now();
      const update = { branchIds: body.branchIds, primaryBranchId, updatedAt: ts };

      await adminDb.collection('users').doc(body.userId)
        .collection('memberships').doc(body.organizationId).update(update);
      await adminDb.collection('orgMembers').doc(body.organizationId)
        .collection('members').doc(body.userId).update(update);

      return ok({ updated: true, branchIds: body.branchIds, primaryBranchId });
    }

    // ═══ POST: Switch active org ═══
    if (event.httpMethod === 'POST' && action === 'switchOrg') {
      const body = JSON.parse(event.body || '{}');
      if (!body.organizationId) return badRequest('organizationId required');

      const ts = now();

      // Switch to Personal Workspace
      if (body.organizationId === 'personal') {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const userData = userDoc.data() || {};
        
        const personalRole = userData.role === 'student' ? 'student' : 'teacher';
        await adminDb.collection('users').doc(user.uid).update({
          activeOrgId: '',
          organizationId: '',
          organizationName: '',
          // default fallback role, will be overridden later if they join another org
          role: personalRole,
          activeRole: personalRole, // reset any stale multi-role selection
          updatedAt: ts,
        });

        return ok({
          switched: true,
          activeOrgId: '',
          role: userData.role === 'student' ? 'student' : 'teacher',
          organizationName: '',
        });
      }

      // Verify user has active membership
      const membership = await getMembership(user.uid, body.organizationId) as any;
      if (!membership || membership.status !== 'active') return badRequest('Not an active member of this org');

      const switchedRole = membership.role === 'owner' ? 'admin' : membership.role;
      await adminDb.collection('users').doc(user.uid).update({
        activeOrgId: body.organizationId,
        // Keep legacy fields in sync
        organizationId: body.organizationId,
        organizationName: membership.organizationName || '',
        role: switchedRole,
        activeRole: switchedRole, // reset role selection to the new org's primary role
        updatedAt: ts,
      });

      return ok({
        switched: true,
        activeOrgId: body.organizationId,
        role: membership.role,
        organizationName: membership.organizationName,
      });
    }

    // ═══ POST: Switch active role (within the caller's active org) ═══
    if (event.httpMethod === 'POST' && action === 'switchRole') {
      const body = JSON.parse(event.body || '{}');
      if (!body.role) return badRequest('role required');

      const userDoc = await adminDb.collection('users').doc(user.uid).get();
      const userData = userDoc.data() || {};
      const orgId = userData.activeOrgId || userData.organizationId;
      if (!orgId) return badRequest('No active organization to switch role in');

      const membership = await getMembership(user.uid, orgId) as any;
      if (!membership || membership.status !== 'active') return badRequest('Not an active member of this org');

      // Map membership roles → app roles, then verify the requested role is one the
      // membership actually grants. This is the server-side anti-escalation guard.
      const roleMap: Record<string, string> = { owner: 'admin', admin: 'admin', manager: 'manager', teacher: 'teacher', mentor: 'teacher', student: 'student' };
      const membershipRoles: string[] = Array.isArray(membership.roles) && membership.roles.length
        ? membership.roles
        : (membership.role ? [membership.role] : []);
      const allowed = [...new Set(membershipRoles.map((r) => roleMap[r] || r))];
      // An assigned custom RBAC role's base role is also switchable.
      if (membership.roleId) {
        try {
          const roleDoc = await adminDb.collection('organizations').doc(orgId).collection('roles').doc(membership.roleId).get();
          const base = roleDoc.exists ? (roleDoc.data()?.baseRole || null) : null;
          if (base) { const mb = roleMap[base] || base; if (!allowed.includes(mb)) allowed.push(mb); }
        } catch { /* ignore — fall back to membership roles only */ }
      }
      if (!allowed.includes(body.role)) return forbidden('You do not hold that role in this organization');

      const ts = now();
      await adminDb.collection('users').doc(user.uid).update({
        activeRole: body.role,
        role: body.role, // keep legacy flat field in sync so route guards / sidebar react
        updatedAt: ts,
      });

      return ok({ switched: true, role: body.role, activeRole: body.role });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (e: any) {
    console.error(`api-memberships error [${action}]:`, e);
    return jsonResponse(500, { error: e.message || 'Internal server error' });
  }
};

export { handler };
