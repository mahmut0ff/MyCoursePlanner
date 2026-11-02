import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, resolveOrgGrants, resolveOrgRole, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';
import { LESSONS_COLLECTION } from './utils/lessons';
import { FieldValue } from 'firebase-admin/firestore';

const NOTIFICATIONS = 'notifications';
const LESSONS = LESSONS_COLLECTION;
const MATERIALS = 'materials';
const USERS = 'users';

/**
 * Кто одобряет переносы. Получателей заявки ищем по роли членства (владелец —
 * отдельная роль), а право решать проверяем по роли приложения, к которой
 * resolveOrgGrants сводит те же роли (владелец → admin).
 */
const APPROVER_MEMBER_ROLES = ['admin', 'manager', 'owner'];
const APPROVER_ROLES = ['super_admin', 'admin', 'manager'];

/**
 * Можно ли отдать автору заявки материалы организации: он её активный участник —
 * или суперадмин, которого resolveOrgGrants пропускает и к самой заявке.
 */
async function requesterInOrg(requesterId: string, orgId: string): Promise<boolean> {
  if ((await resolveOrgRole(requesterId, orgId)).role) return true;
  const requester = await adminDb.collection(USERS).doc(requesterId).get();
  return requester.data()?.role === 'super_admin';
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized(event);

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // 1. ПРЕПОДАВАТЕЛЬ СОЗДАЕТ ЗАПРОС НА КОПИРОВАНИЕ ИЗ ОРГАНИЗАЦИИ
    if (action === 'request_transfer' && event.httpMethod === 'POST') {
      const { transferType, sourceId, targetId, orgId, sourceTitle } = body;
      if (!transferType || !sourceId || !orgId) return badRequest('Missing required fields');

      // Организация приходит телом запроса — сверяем её с членством: просить
      // перенос можно только из той организации, где состоишь сам.
      const standing = await resolveOrgGrants(user, orgId);
      if (!standing) return forbidden('Вы не состоите в этой организации');

      // Находим всех админов и менеджеров организации
      const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
      if (!orgDoc.exists) return badRequest('Org not found');
      
      const snap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
        .where('status', '==', 'active')
        .where('role', 'in', APPROVER_MEMBER_ROLES)
        .get();

      const adminIds = new Set<string>(snap.docs.map(d => d.data().userId).filter(Boolean));
      // Запасного пути «некому одобрить — пусть заявку получит сам автор» больше нет:
      // автор сам же её и одобрял, то есть перенос из организации без активных
      // админов не требовал ничьего согласия. Себе заявка приходит, только если
      // автор и так вправе одобрять переносы этой организации.
      if (APPROVER_ROLES.includes(standing.role)) adminIds.add(user.uid);
      if (adminIds.size === 0) {
        return jsonResponse(409, { error: 'В организации нет администратора или менеджера, который мог бы одобрить перенос' });
      }

      // Создаем уведомление-заявку для каждого админа
      const batch = adminDb.batch();
      
      const reqTitle = transferType === 'material_to_lesson' ? 'Запрос на копирование материала' : 'Запрос на копирование урока';
      const reqMessage = `Преподаватель ${user.email} запрашивает перенос "${sourceTitle}" в личное пространство.`;

      // Генерируем уникальный ID заявки (чтобы связать уведомления)
      const requestId = adminDb.collection(NOTIFICATIONS).doc().id;

      for (const adminId of adminIds) {
        const notifRef = adminDb.collection(NOTIFICATIONS).doc();
        batch.set(notifRef, {
          type: 'transfer_request',
          title: reqTitle,
          message: reqMessage,
          recipientId: adminId,
          read: false,
          createdAt: new Date().toISOString(),
          link: '/notifications',
          metadata: {
            requestId, // Grouping ID
            transferType,
            sourceId,
            targetId,
            sourceTitle,
            requesterId: user.uid,
            requesterEmail: user.email,
            orgId,
            status: 'pending' // pending, approved, rejected
          }
        });
      }

      await batch.commit();

      return ok({ success: true, requestId });
    }

    // 2. АДМИН ОДОБРЯЕТ/ОТКЛОНЯЕТ ЗАПРОС
    if (action === 'resolve_transfer' && event.httpMethod === 'POST') {
      const { notificationId, decision } = body; // decision: 'approve' | 'reject'
      if (!notificationId || !decision) return badRequest('Missing parameters');

      const notifDoc = await adminDb.collection(NOTIFICATIONS).doc(notificationId).get();
      if (!notifDoc.exists) return badRequest('Notification not found');
      
      const notifData = notifDoc.data()!;
      if (notifData.type !== 'transfer_request') return badRequest('Not a transfer request');
      if (notifData.recipientId !== user.uid) return badRequest('Not your notification');
      if (notifData.metadata?.status !== 'pending') return badRequest('Request already resolved');

      const meta = notifData.metadata;
      const { transferType, sourceId, targetId, requesterId, sourceTitle, requestId } = meta;

      // Заявка — документ уведомления, а его получатель по правилам Firestore может
      // переписать в нём любое поле, включая type и metadata. Поэтому, кто решает и
      // в чью пользу, сверяется заново с живым членством, а не берётся из заявки:
      // решает только тот, кто сейчас одобряет переносы этой организации, а копию
      // получает только её участник. Заявки, которые прежний запасной путь
      // адресовал самому автору, на этом и останавливаются.
      if (!meta.orgId || !requesterId) return badRequest('В заявке не указаны организация или автор');
      const approver = await resolveOrgGrants(user, meta.orgId);
      if (!approver || !APPROVER_ROLES.includes(approver.role)) {
        return forbidden('Решать по заявкам на перенос может только администратор или менеджер этой организации');
      }
      if (decision === 'approve' && !(await requesterInOrg(requesterId, meta.orgId))) {
        return badRequest('Автор заявки не состоит в этой организации');
      }

      let successMessage = '';

      if (decision === 'approve') {
        if (transferType === 'material_to_lesson') {
          // Скопировать материал в массив вложений урока (targetId)
          const materialDoc = await adminDb.collection(MATERIALS).doc(sourceId).get();
          const lessonDoc = await adminDb.collection(LESSONS).doc(targetId).get();
          
          if (!materialDoc.exists || !lessonDoc.exists) {
             return badRequest('Исходный материал или целевой урок не найдены');
          }

          const mat = materialDoc.data()!;
          const targetLesson = lessonDoc.data()!;
          // Одобрение не проверяло, ЧТО именно одобряют: оба id пришли из заявки.
          // Пока путь читал несуществующую коллекцию `lessons`, до копирования не
          // доходило; теперь доходит — поэтому документы сверяются с заявкой:
          // материал той организации, чей админ одобряет, урок — личный урок автора.
          if ((mat.organizationId || '') !== meta.orgId) {
            return badRequest('Материал не принадлежит этой организации');
          }
          if (targetLesson.authorId !== requesterId || targetLesson.organizationId) {
            return badRequest('Материал можно перенести только в собственный личный урок');
          }
          const newAttachment = {
            id: adminDb.collection(LESSONS).doc().id, // fake id for attachment
            name: mat.title,
            url: mat.url,
            storagePath: mat.url,
            type: mat.mimeType || 'unknown',
            size: mat.sizeBytes || 0,
            uploadedAt: new Date().toISOString()
          };

          await adminDb.collection(LESSONS).doc(targetId).update({
            attachments: FieldValue.arrayUnion(newAttachment)
          });

          successMessage = `Вложение "${sourceTitle}" добавлено в ваш урок.`;

        } else if (transferType === 'lesson_to_personal') {
          // Клонировать весь урок
          const srcLessonDoc = await adminDb.collection(LESSONS).doc(sourceId).get();
          if (!srcLessonDoc.exists) return badRequest('Урок не найден или был удалён');
          
          const srcLesson = srcLessonDoc.data()!;
          // Та же сверка, что и у материала: копируется урок организации, чей админ одобряет.
          if ((srcLesson.organizationId || '') !== meta.orgId) {
            return badRequest('Урок не принадлежит этой организации');
          }

          const newLessonData = {
            ...srcLesson,
            title: `${srcLesson.title} (Копия)`,
            organizationId: null, // removing from org
            branchId: null,
            // Личная копия не привязана к группам организации — иначе она всплыла бы
            // в списке уроков группы (api-lessons ?groupId=) у сотрудников и учеников.
            groupIds: [],
            groupNames: [],
            authorId: requesterId,
            authorName: meta.requesterEmail,
            status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          delete (newLessonData as any).id;
          
          await adminDb.collection(LESSONS).add(newLessonData);
          successMessage = `Урок "${sourceTitle}" скопирован в ваши личные материалы.`;
        }
      }

      // Отправляем уведомление автору запроса
      if (requesterId) {
        await adminDb.collection(NOTIFICATIONS).add({
          type: 'system',
          title: decision === 'approve' ? 'Заявка одобрена' : 'Заявка отклонена',
          message: decision === 'approve' ? successMessage : `Запрос на перенос "${sourceTitle}" был отклонен.`,
          recipientId: requesterId,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      // Найти все уведомления с этим же requestId и пометить как resolved
      const batch = adminDb.batch();
      
      if (requestId) {
        const allReqNotes = await adminDb.collection(NOTIFICATIONS)
          .where('metadata.requestId', '==', requestId).get();
        allReqNotes.docs.forEach(d => {
          batch.update(d.ref, { 
            'metadata.status': decision === 'approve' ? 'approved' : 'rejected',
            read: true
          });
        });
      } else {
        batch.update(adminDb.collection(NOTIFICATIONS).doc(notificationId), {
          'metadata.status': decision === 'approve' ? 'approved' : 'rejected',
          read: true
        });
      }
      
      await batch.commit();

      return ok({ success: true });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-transfers error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
