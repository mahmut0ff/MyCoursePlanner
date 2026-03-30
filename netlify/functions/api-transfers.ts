import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, jsonResponse } from './utils/auth';
import { FieldValue } from 'firebase-admin/firestore';

const NOTIFICATIONS = 'notifications';
const LESSONS = 'lessons';
const MATERIALS = 'materials';
const USERS = 'users';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // 1. ПРЕПОДАВАТЕЛЬ СОЗДАЕТ ЗАПРОС НА КОПИРОВАНИЕ ИЗ ОРГАНИЗАЦИИ
    if (action === 'request_transfer' && event.httpMethod === 'POST') {
      const { transferType, sourceId, targetId, orgId, sourceTitle } = body;
      if (!transferType || !sourceId || !orgId) return badRequest('Missing required fields');

      // Находим всех админов и менеджеров организации
      const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
      if (!orgDoc.exists) return badRequest('Org not found');
      
      const snap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
        .where('status', '==', 'active')
        .where('role', 'in', ['admin', 'manager', 'owner'])
        .get();

      let adminIds = snap.docs.map(d => d.data().userId);
      
      if (adminIds.length === 0) {
        // Fallback: If no dedicated admins found but the user is making the request, let them receive it
        // (This can happen in newly created orgs or solo owner setups)
        adminIds = [user.uid];
      }

      // Создаем уведомление-заявку для каждого админа
      const batch = adminDb.batch();
      
      const reqTitle = transferType === 'material_to_lesson' ? 'Запрос на копирование материала' : 'Запрос на копирование урока';
      const reqMessage = `Преподаватель ${user.email} запрашивает перенос "${sourceTitle}" в личное пространство.`;

      // Генерируем уникальный ID заявки (чтобы связать уведомления)
      const requestId = adminDb.collection(NOTIFICATIONS).doc().id;

      let hasAdded = false;
      for (const adminId of adminIds) {
        const notifRef = adminDb.collection(NOTIFICATIONS).doc();
        batch.set(notifRef, {
          type: 'transfer_request',
          title: reqTitle,
          message: reqMessage,
          recipientId: adminId,
          read: false,
          createdAt: new Date().toISOString(),
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
        hasAdded = true;
      }

      if (hasAdded) {
        await batch.commit();
      }

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

      let successMessage = '';

      if (decision === 'approve') {
        if (transferType === 'material_to_lesson') {
          // Скопировать материал в массив вложений урока (targetId)
          const materialDoc = await adminDb.collection(MATERIALS).doc(sourceId).get();
          const lessonDoc = await adminDb.collection(LESSONS).doc(targetId).get();
          
          if (!materialDoc.exists || !lessonDoc.exists) {
             return badRequest('Source or target not found');
          }
          
          const mat = materialDoc.data()!;
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
          if (!srcLessonDoc.exists) return badRequest('Lesson not found');
          
          const srcLesson = srcLessonDoc.data()!;
          
          const newLessonData = {
            ...srcLesson,
            title: `${srcLesson.title} (Копия)`,
            organizationId: null, // removing from org
            branchId: null,
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
      const allReqNotes = await adminDb.collection(NOTIFICATIONS)
        .where('metadata.requestId', '==', requestId).get();
      
      const batch = adminDb.batch();
      allReqNotes.docs.forEach(d => {
        batch.update(d.ref, { 
          'metadata.status': decision === 'approve' ? 'approved' : 'rejected',
          read: true // auto-read for all admins so they don't see it hanging
        });
      });
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
