/**
 * API: Кабинеты — справочник физических помещений организации.
 *
 * Не путать с api-rooms.ts: там экзаменационные комнаты (коллекция examRooms).
 * Здесь — аудитории, к которым привязываются занятия расписания.
 *
 * Кабинет принадлежит филиалу, поэтому список слушается переключателя филиалов
 * в сайдбаре ровно так же, как остальные branch-scoped модули.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import {
  verifyAuth, isStaff, can, resolveBranchFilter,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';
import { normalizeRoom } from './utils/classrooms';

const COLLECTION = 'classrooms';
const now = () => new Date().toISOString();

function orgQuery(collection: string, orgId: string) {
  return adminDb.collection(collection).where('organizationId', '==', orgId);
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!user.organizationId) return forbidden();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const orgId = user.organizationId;

  // RBAC: мутации требуют соответствующий грант (админы проходят внутри can()).
  if (event.httpMethod === 'POST') {
    if (action === 'archive') {
      if (!can(user, 'classrooms', 'delete')) return forbidden('Недостаточно прав для этого действия');
    } else if (['create', 'update'].includes(action)) {
      if (!can(user, 'classrooms', 'write')) return forbidden('Недостаточно прав для этого действия');
    }
  }

  try {
    // ═══ СПИСОК КАБИНЕТОВ ═══
    if (action === 'list' && event.httpMethod === 'GET') {
      if (!isStaff(user)) return forbidden();
      if (!can(user, 'classrooms', 'read')) return forbidden('Недостаточно прав для этого действия');

      // Равенства без orderBy — составные индексы в проекте не выкатываются,
      // поэтому сортируем в памяти.
      let query = orgQuery(COLLECTION, orgId).where('isActive', '==', true);

      const scope = resolveBranchFilter(user, params.branchId);
      if (scope === '__DENIED__') return ok([]);
      if (typeof scope === 'string') query = query.where('branchId', '==', scope) as any;

      const snap = await query.get();
      let list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      // Массив = «все доступные мне филиалы». Кабинет без филиала не приписан ни к
      // какому зданию, и под конкретным филиалом его показывать нельзя — но при
      // «мои филиалы» он остаётся видимым, иначе его будет негде исправить.
      if (Array.isArray(scope)) {
        list = list.filter((c: any) => !c.branchId || scope.includes(c.branchId));
      }

      list.sort((a: any, b: any) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'ru', { numeric: true }));

      return ok(list);
    }

    // ═══ ОДИН КАБИНЕТ ═══
    if (action === 'get' && event.httpMethod === 'GET') {
      if (!isStaff(user)) return forbidden();
      if (!can(user, 'classrooms', 'read')) return forbidden('Недостаточно прав для этого действия');
      const { id } = params;
      if (!id) return badRequest('id required');

      const doc = await adminDb.collection(COLLECTION).doc(id).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId !== orgId) return forbidden();

      return ok({ id: doc.id, ...doc.data() });
    }

    // ═══ СОЗДАНИЕ ═══
    if (action === 'create' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { name, branchId, capacity, floor, color, isVirtual, notes } = body;
      if (!name || !String(name).trim()) return badRequest('name required');

      const nameKey = normalizeRoom(name);
      const dup = await findDuplicate(orgId, nameKey, branchId || null);
      if (dup) return badRequest(`Кабинет «${dup.name}» в этом филиале уже есть`);

      if (branchId) {
        const branchDoc = await adminDb.collection('branches').doc(branchId).get();
        if (!branchDoc.exists || branchDoc.data()?.organizationId !== orgId) {
          return badRequest('Филиал не найден');
        }
      }

      const data: any = {
        organizationId: orgId,
        branchId: branchId || null,
        name: String(name).trim(),
        nameKey,
        capacity: capacity === undefined || capacity === null || capacity === '' ? null : Number(capacity),
        floor: floor || null,
        color: color || null,
        isVirtual: isVirtual === true,
        notes: notes || '',
        isActive: true,
        createdAt: now(),
        updatedAt: now(),
      };

      const ref = await adminDb.collection(COLLECTION).add(data);
      return ok({ id: ref.id, ...data });
    }

    // ═══ ИЗМЕНЕНИЕ ═══
    if (action === 'update' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { id, name, branchId, capacity, floor, color, isVirtual, notes, isActive } = body;
      if (!id) return badRequest('id required');

      const doc = await adminDb.collection(COLLECTION).doc(id).get();
      if (!doc.exists) return notFound();
      const before = doc.data()!;
      if (before.organizationId !== orgId) return forbidden();

      const updates: any = { updatedAt: now() };
      if (name !== undefined) {
        if (!String(name).trim()) return badRequest('name required');
        updates.name = String(name).trim();
        updates.nameKey = normalizeRoom(name);
      }
      if (branchId !== undefined) updates.branchId = branchId || null;

      // Переименование или переезд в другой филиал не должны создать двойника.
      if (updates.nameKey !== undefined || updates.branchId !== undefined) {
        const nextKey = updates.nameKey ?? before.nameKey;
        const nextBranch = updates.branchId !== undefined ? updates.branchId : (before.branchId || null);
        const dup = await findDuplicate(orgId, nextKey, nextBranch, id);
        if (dup) return badRequest(`Кабинет «${dup.name}» в этом филиале уже есть`);
      }

      if (capacity !== undefined) {
        updates.capacity = capacity === null || capacity === '' ? null : Number(capacity);
      }
      if (floor !== undefined) updates.floor = floor || null;
      if (color !== undefined) updates.color = color || null;
      if (isVirtual !== undefined) updates.isVirtual = isVirtual === true;
      if (notes !== undefined) updates.notes = notes || '';
      if (isActive !== undefined) updates.isActive = isActive === true;

      await doc.ref.update(updates);

      // Подпись кабинета продублирована в событиях расписания — обновляем её,
      // иначе в сетке останется старое имя.
      if (updates.name !== undefined) {
        await renameOnEvents(orgId, id, updates.name);
      }

      return ok({ id: doc.id, ...before, ...updates });
    }

    // ═══ АРХИВАЦИЯ (мягкое удаление) ═══
    if (action === 'archive' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');

      const doc = await adminDb.collection(COLLECTION).doc(body.id).get();
      if (!doc.exists) return notFound();
      if (doc.data()?.organizationId !== orgId) return forbidden();

      // Занятия не трогаем: они сохраняют classroomName и остаются читаемыми,
      // но кабинет пропадает из выбора. Сообщаем, скольким занятиям он назначен.
      const usedSnap = await orgQuery('scheduleEvents', orgId)
        .where('classroomId', '==', body.id).get();

      await doc.ref.update({ isActive: false, updatedAt: now() });
      return ok({ archived: true, affectedEvents: usedSnap.size });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-classrooms error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

/**
 * Одноимённый кабинет в том же филиале. Только равенства — без составного индекса;
 * сравнение по филиалу делаем в памяти, потому что null-филиал в запросе неудобен.
 */
async function findDuplicate(
  orgId: string, nameKey: string, branchId: string | null, excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  if (!nameKey) return null;
  const snap = await orgQuery(COLLECTION, orgId).where('nameKey', '==', nameKey).get();
  for (const doc of snap.docs) {
    if (doc.id === excludeId) continue;
    const d = doc.data() as any;
    if (d.isActive === false) continue;
    if ((d.branchId || null) === branchId) return { id: doc.id, name: d.name };
  }
  return null;
}

/** Переименование кабинета догоняет денормализованную подпись в событиях. */
async function renameOnEvents(orgId: string, classroomId: string, name: string) {
  const snap = await orgQuery('scheduleEvents', orgId)
    .where('classroomId', '==', classroomId).get();
  if (snap.empty) return;

  // Firestore разрешает 500 операций в батче.
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = adminDb.batch();
    for (const doc of docs.slice(i, i + 400)) {
      // location держим в синхроне: по нему читают все экраны, ещё не знающие о справочнике.
      batch.update(doc.ref, { classroomName: name, location: name, updatedAt: now() });
    }
    await batch.commit();
  }
}

export { handler };
