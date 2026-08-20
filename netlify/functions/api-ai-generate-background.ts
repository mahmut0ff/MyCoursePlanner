import type { Handler, HandlerEvent } from '@netlify/functions';
import { verifyAuth, isStaff, jsonResponse } from './utils/auth';
import { adminDb } from './utils/firebase-admin';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { hasGeminiKey, recordAiUsage } from './utils/ai';
import { generateAIContent, AIGenerateError } from './utils/ai-generate';
import { aiJobDocId, AI_JOB_ID_RE } from './utils/ai-jobs';

/**
 * Тяжёлая ИИ-генерация (экзамен/викторина по лекции, урок+квиз) — фоновая
 * функция Netlify: до 15 минут вместо 10 секунд у синхронной.
 *
 * Суффикс `-background` в имени файла — и есть переключатель: Netlify отвечает
 * клиенту 202 сразу, а хендлер продолжает работать. Возвращаемое значение никто
 * не читает, поэтому единственный канал наружу — документ `aiJobs/{uid}__{jobId}`,
 * который опрашивает `api-ai-job`. Отсюда правило: после того как uid известен,
 * любая ветка обязана дописать в этот документ либо результат, либо ошибку,
 * иначе клиент будет ждать до собственного таймаута и покажет пустоту.
 *
 * jobId генерирует клиент, но в id документа он склеен с uid — чужую задачу
 * подсунутым jobId не перезаписать и не прочитать.
 */
const handler: Handler = async (event: HandlerEvent) => {
  const user = await verifyAuth(event);
  // Без uid писать некуда: документ некому адресовать. Клиент отвалится по
  // своему таймауту — это единственный случай, когда он не увидит причину.
  if (!user) return jsonResponse(401, { error: 'Unauthorized' });

  let jobId = '';
  let jobRef: FirebaseFirestore.DocumentReference | null = null;

  const fail = async (message: string) => {
    if (jobRef) {
      await jobRef.set(
        { status: 'error', error: message, updatedAt: new Date().toISOString() },
        { merge: true },
      ).catch((e) => console.error('[ai-job] failed to write error state:', e));
    }
    return jsonResponse(200, { error: message });
  };

  try {
    const body = JSON.parse(event.body || '{}');
    const { prompt, type = 'quiz', fileUrl } = body;
    jobId = typeof body.jobId === 'string' ? body.jobId : '';

    if (!AI_JOB_ID_RE.test(jobId)) return jsonResponse(400, { error: 'Invalid jobId' });

    jobRef = adminDb.collection('aiJobs').doc(aiJobDocId(user.uid, jobId));
    await jobRef.set({
      uid: user.uid,
      orgId: user.organizationId || null,
      type,
      status: 'running',
      hasFile: !!fileUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (!isStaff(user) && user.role !== 'teacher') {
      return fail('Генерация доступна только сотрудникам и преподавателям.');
    }

    const rlKey = getRateLimitKey(event, user.uid);
    if (rateLimiters.ai.isLimited(rlKey)) {
      return fail('Слишком много запросов к ИИ. Подождите минуту и повторите.');
    }

    if (!hasGeminiKey()) return fail('GEMINI_API_KEY не настроен на сервере.');
    if (!prompt && !fileUrl) return fail('Нужен промпт или файл.');

    const data = await generateAIContent({ prompt, type, fileUrl });
    recordAiUsage(user.organizationId, `generate_${type}`);

    // Результат кладём строкой: у Firestore нет вложенных массивов, а в ответе
    // ИИ они встречаются (варианты ответов внутри вопросов внутри списка).
    await jobRef.set(
      { status: 'done', resultJson: JSON.stringify(data), updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return jsonResponse(200, { ok: true });
  } catch (err: any) {
    console.error('AI background generation error:', err);
    if (err instanceof AIGenerateError) return fail(err.message);
    return fail(err?.message || 'Внутренняя ошибка генерации.');
  }
};

export { handler };
