/**
 * Общий контракт асинхронных ИИ-задач между фоновой генерацией и опросом
 * статуса. Id документа склеен из uid и клиентского jobId: клиент волен
 * придумывать jobId сам, но адресовать чужую задачу у него не выйдет.
 */

/** jobId приходит от клиента и попадает в id документа — только безопасные символы. */
export const AI_JOB_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export const aiJobDocId = (uid: string, jobId: string) => `${uid}__${jobId}`;

export type AIJobStatus = 'pending' | 'running' | 'done' | 'error';
