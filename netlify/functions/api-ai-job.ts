import type { Handler, HandlerEvent } from '@netlify/functions';
import { verifyAuth, ok, unauthorized, badRequest, jsonResponse } from './utils/auth';
import { adminDb } from './utils/firebase-admin';
import { aiJobDocId, AI_JOB_ID_RE, type AIJobStatus } from './utils/ai-jobs';

/**
 * Статус фоновой ИИ-генерации. Клиент опрашивает этот эндпоинт, пока
 * `api-ai-generate-background` считает.
 *
 * `pending` = документа ещё нет: фоновая функция стоит в очереди Netlify или
 * только стартует. Это не ошибка — ошибкой её делает только клиентский таймаут.
 *
 * Читаем строго свою задачу: id документа собирается из uid токена, а не из
 * того, что прислали, поэтому подобрать чужой jobId бессмысленно.
 */
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const jobId = event.queryStringParameters?.jobId || '';
  if (!AI_JOB_ID_RE.test(jobId)) return badRequest('Invalid jobId');

  const snap = await adminDb.collection('aiJobs').doc(aiJobDocId(user.uid, jobId)).get();
  if (!snap.exists) return ok({ status: 'pending' as AIJobStatus });

  const job = snap.data() || {};
  const status = (job.status || 'pending') as AIJobStatus;

  if (status === 'done') {
    let data: any = null;
    try {
      data = JSON.parse(job.resultJson || 'null');
    } catch {
      return ok({ status: 'error' as AIJobStatus, error: 'Результат генерации повреждён.' });
    }
    return ok({ status, data });
  }

  if (status === 'error') return ok({ status, error: job.error || 'Ошибка генерации.' });

  return ok({ status });
};

export { handler };
