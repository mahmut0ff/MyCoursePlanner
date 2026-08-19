/**
 * Приём домашних заданий из Telegram.
 *
 * Ученики не заходят в веб-приложение — сдача целиком живёт в боте: ученик
 * выбирает задание кнопкой, шлёт текст/фото/документ, бот складывает всё в тот
 * же `homework_submissions`, что и раньше. Поэтому проверка ДЗ, ИИ-разбор и
 * журнал работают без изменений — меняется только точка входа.
 *
 * Запросы намеренно однополевые (equality или array-contains) и досортированы
 * в памяти: составные индексы в этом проекте не деплоятся, и запрос с двумя
 * полями упал бы в проде, а не на сборке.
 */
import { adminDb, uploadServerFile } from './firebase-admin';
import { notifyOrgAdmins } from './notifications';

/** Сколько заданий показываем кнопками — больше в одном экране бесполезно. */
const MAX_OPEN_HOMEWORK = 8;
/** Telegram отдаёт боту файлы не больше 20 МБ. */
const MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;
/** Черновик сдачи живёт полчаса: дальше проще переспросить, чем угадывать. */
const DRAFT_TTL_MS = 30 * 60 * 1000;

const DRAFTS = 'homeworkDrafts';
const SUBMISSIONS = 'homework_submissions';

export interface OpenHomework {
  lessonId: string;
  lessonTitle: string;
  homeworkTitle: string;
  description: string;
  dueDate: string | null;
  points: number;
  groupId: string | null;
  groupName: string | null;
  submissionId: string | null;
  submittedAt: string | null;
  isGraded: boolean;
  finalScore: number | null;
}

/** Просрочено ли задание на данный момент (нет срока — не просрочено). */
export function isOverdue(dueDate: string | null, now = new Date()): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return now.getTime() > due.getTime();
}

/**
 * Открытые задания ученика: уроки его групп, у которых заполнен блок `homework`.
 * Уже сданные не исчезают — ученик вправе дослать файл или переделать работу,
 * поэтому они возвращаются с пометкой о сдаче, а оценённые уходят в конец списка.
 */
export async function listOpenHomework(orgId: string, studentUid: string): Promise<OpenHomework[]> {
  const groupSnap = await adminDb.collection('groups')
    .where('studentIds', 'array-contains', studentUid).get().catch(() => null);
  const groups = (groupSnap?.docs || [])
    .filter(d => (d.data()?.organizationId || '') === orgId)
    .map(d => ({ id: d.id, name: String(d.data()?.name || '') }));
  if (groups.length === 0) return [];

  // array-contains-any берёт до 30 значений за один запрос — групп у ученика единицы.
  const groupIds = groups.slice(0, 30).map(g => g.id);
  const lessonSnap = await adminDb.collection('lessons')
    .where('groupIds', 'array-contains-any', groupIds).get().catch(() => null);

  const lessons = (lessonSnap?.docs || [])
    .map(d => ({ id: d.id, ...(d.data() || {}) } as any))
    .filter(l => (l.organizationId || '') === orgId)
    .filter(l => l.status !== 'draft')
    .filter(l => l.homework && (l.homework.title || l.homework.description));
  if (lessons.length === 0) return [];

  const subSnap = await adminDb.collection(SUBMISSIONS)
    .where('studentId', '==', studentUid).get().catch(() => null);
  const byLesson = new Map<string, any>();
  for (const d of (subSnap?.docs || [])) {
    const s = d.data() || {};
    if ((s.organizationId || '') !== orgId) continue;
    byLesson.set(String(s.lessonId), { id: d.id, ...s });
  }

  const items: OpenHomework[] = lessons.map(l => {
    const sub = byLesson.get(l.id) || null;
    const group = groups.find(g => (l.groupIds || []).includes(g.id)) || null;
    return {
      lessonId: l.id,
      lessonTitle: String(l.title || 'Урок'),
      homeworkTitle: String(l.homework?.title || 'Домашнее задание'),
      description: String(l.homework?.description || ''),
      dueDate: l.homework?.dueDate || null,
      points: Number(l.homework?.points) > 0 ? Number(l.homework.points) : 10,
      groupId: group?.id || null,
      groupName: group?.name || null,
      submissionId: sub?.id || null,
      submittedAt: sub?.submittedAt || null,
      isGraded: sub?.status === 'graded',
      finalScore: typeof sub?.finalScore === 'number' ? sub.finalScore : null,
    };
  });

  // Сначала то, что горит: несданное с ближайшим сроком, оценённое — в конец.
  const weight = (i: OpenHomework) => (i.isGraded ? 2 : i.submissionId ? 1 : 0);
  items.sort((a, b) => {
    if (weight(a) !== weight(b)) return weight(a) - weight(b);
    const da = a.dueDate || '9999';
    const db = b.dueDate || '9999';
    return da.localeCompare(db);
  });
  return items.slice(0, MAX_OPEN_HOMEWORK);
}

/** Найти одно задание ученика по уроку — при нажатии кнопки и при досылке файла. */
export async function findHomework(orgId: string, studentUid: string, lessonId: string): Promise<OpenHomework | null> {
  const items = await listOpenHomework(orgId, studentUid);
  return items.find(i => i.lessonId === lessonId) || null;
}

export function escapeHtml(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Подпись кнопки: срок и статус видно до нажатия, иначе выбор вслепую. */
export function homeworkButtonLabel(i: OpenHomework): string {
  const mark = i.isGraded ? '✅' : i.submissionId ? '📨' : isOverdue(i.dueDate) ? '🔴' : '📝';
  const due = i.dueDate ? ` · до ${String(i.dueDate).slice(0, 10)}` : '';
  const title = i.homeworkTitle || i.lessonTitle;
  const short = title.length > 40 ? `${title.slice(0, 39)}…` : title;
  return `${mark} ${short}${due}`;
}

/** Inline-клавиатура выбора задания. callback_data: hw:p:<lessonId>. */
export function homeworkKeyboard(items: OpenHomework[]) {
  return {
    inline_keyboard: items.map(i => [{ text: homeworkButtonLabel(i), callback_data: `hw:p:${i.lessonId}` }]),
  };
}

/** Человекочитаемое описание задания — показываем после выбора кнопки. */
export function renderHomeworkCard(i: OpenHomework): string {
  const lines = [`📝 <b>${escapeHtml(i.homeworkTitle)}</b>`];
  if (i.lessonTitle && i.lessonTitle !== i.homeworkTitle) lines.push(`<i>Урок: ${escapeHtml(i.lessonTitle)}</i>`);
  if (i.groupName) lines.push(`<i>Группа: ${escapeHtml(i.groupName)}</i>`);
  if (i.description) lines.push('', escapeHtml(i.description.slice(0, 600)));
  if (i.dueDate) {
    lines.push('', isOverdue(i.dueDate)
      ? `🔴 Срок вышел: ${String(i.dueDate).slice(0, 10)} — сдать всё ещё можно, работу отметят как позднюю.`
      : `🗓 Срок: до ${String(i.dueDate).slice(0, 10)}`);
  }
  if (i.isGraded) lines.push('', `✅ Уже оценено${i.finalScore !== null ? `: ${i.finalScore} из ${i.points}` : ''}.`);
  else if (i.submissionId) lines.push('', '📨 Работа уже отправлена — можете дослать файлы или переделать.');
  lines.push('', 'Присылайте ответ: текстом, фото или файлом. Можно несколькими сообщениями.');
  return lines.join('\n');
}

// ─────────────────────────── черновик сдачи ───────────────────────────

export interface HomeworkDraft {
  chatId: string;
  lessonId: string;
  studentUid: string;
  orgId: string;
  updatedAt: string;
}

export async function setDraft(chatId: string, draft: Omit<HomeworkDraft, 'chatId' | 'updatedAt'>): Promise<void> {
  await adminDb.collection(DRAFTS).doc(chatId).set(
    { ...draft, chatId, updatedAt: new Date().toISOString() },
    { merge: true },
  ).catch(() => {});
}

/**
 * Живой черновик этого чата, без проверки владельца.
 * Один doc-get по ключу чата — дешевле, чем резолвить ученика на каждое
 * сообщение, поэтому вебхук сначала заглядывает сюда и только потом решает,
 * стоит ли вообще поднимать профиль.
 */
export async function peekDraft(chatId: string): Promise<HomeworkDraft | null> {
  const snap = await adminDb.collection(DRAFTS).doc(chatId).get().catch(() => null);
  if (!snap?.exists) return null;
  const d = snap.data() as HomeworkDraft;
  if (!d?.lessonId) return null;
  const age = Date.now() - new Date(d.updatedAt || 0).getTime();
  if (!Number.isFinite(age) || age > DRAFT_TTL_MS) return null;
  return d;
}

/** Активный черновик этого чата, либо null (протух / нет / чужой ученик). */
export async function getDraft(chatId: string, studentUid: string): Promise<HomeworkDraft | null> {
  const d = await peekDraft(chatId);
  return d && d.studentUid === studentUid ? d : null;
}

export async function clearDraft(chatId: string): Promise<void> {
  await adminDb.collection(DRAFTS).doc(chatId).delete().catch(() => {});
}

// ─────────────────────────── приём вложений ───────────────────────────

export type TelegramFileKind = 'photo' | 'document' | 'video' | 'audio' | 'voice';

export interface TelegramFileRef {
  fileId: string;
  kind: TelegramFileKind;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

/** Вложение из сообщения Telegram, или null если приложить нечего. */
export function extractFileRef(message: any): TelegramFileRef | null {
  if (!message) return null;
  if (Array.isArray(message.photo) && message.photo.length) {
    // Последний размер — самый крупный: работу присылают, чтобы её прочли.
    const best = message.photo[message.photo.length - 1];
    return { fileId: best.file_id, kind: 'photo', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: best.file_size };
  }
  if (message.document) {
    return {
      fileId: message.document.file_id, kind: 'document',
      fileName: message.document.file_name || 'document',
      mimeType: message.document.mime_type, fileSize: message.document.file_size,
    };
  }
  if (message.video) {
    return { fileId: message.video.file_id, kind: 'video', fileName: message.video.file_name || 'video.mp4', mimeType: message.video.mime_type || 'video/mp4', fileSize: message.video.file_size };
  }
  if (message.audio) {
    return { fileId: message.audio.file_id, kind: 'audio', fileName: message.audio.file_name || 'audio.mp3', mimeType: message.audio.mime_type || 'audio/mpeg', fileSize: message.audio.file_size };
  }
  if (message.voice) {
    return { fileId: message.voice.file_id, kind: 'voice', fileName: 'voice.ogg', mimeType: message.voice.mime_type || 'audio/ogg', fileSize: message.voice.file_size };
  }
  return null;
}

/** Тип вложения в терминах карточки сдачи (совпадает с веб-загрузками). */
function attachmentType(ref: TelegramFileRef, mime: string): 'image' | 'video' | 'audio' | 'archive' | 'document' {
  if (ref.kind === 'photo' || mime.startsWith('image/')) return 'image';
  if (ref.kind === 'video' || mime.startsWith('video/')) return 'video';
  if (ref.kind === 'audio' || ref.kind === 'voice' || mime.startsWith('audio/')) return 'audio';
  if (/zip|rar|7z|tar/.test(mime)) return 'archive';
  return 'document';
}

function safeName(name: string): string {
  return String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
}

/**
 * Скачать файл из Telegram и положить в Storage.
 * Возвращает null, если файл слишком большой или Telegram его не отдал —
 * сдача при этом не срывается, ученику отвечают текстом.
 */
export async function storeTelegramFile(
  botToken: string, ref: TelegramFileRef, lessonId: string, studentUid: string,
): Promise<{ url: string; name: string; size: number; type: string } | null> {
  if (ref.fileSize && ref.fileSize > MAX_TELEGRAM_FILE_BYTES) return null;
  try {
    const metaRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(ref.fileId)}`);
    const meta: any = await metaRes.json();
    const filePath = meta?.result?.file_path;
    if (!filePath) return null;

    const binRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!binRes.ok) return null;
    const buffer = Buffer.from(await binRes.arrayBuffer());
    if (buffer.length > MAX_TELEGRAM_FILE_BYTES) return null;

    const ext = (String(filePath).match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0];
    const base = safeName(ref.fileName || `tg${ext}`);
    const name = /\.[A-Za-z0-9]{1,8}$/.test(base) ? base : `${base}${ext}`;
    const mime = ref.mimeType || binRes.headers.get('content-type') || 'application/octet-stream';

    const stored = await uploadServerFile(
      `homeworks/${lessonId}/${studentUid}-${Date.now()}-${name}`, buffer, mime,
    );
    return { url: stored.url, name, size: stored.size, type: attachmentType(ref, mime) };
  } catch (e) {
    console.error('storeTelegramFile failed:', e);
    return null;
  }
}

/** Преподаватели урока + автор — кому показать, что работу сдали. */
async function resolveLessonTeacherIds(lessonId: string): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const lessonSnap = await adminDb.collection('lessons').doc(lessonId).get();
    if (!lessonSnap.exists) return [];
    const lesson = lessonSnap.data() || {};
    if (lesson.authorId) ids.add(String(lesson.authorId));
    const groupIds: string[] = Array.isArray(lesson.groupIds) ? lesson.groupIds : [];
    const groups = await Promise.all(
      groupIds.slice(0, 20).map(gid => adminDb.collection('groups').doc(gid).get().catch(() => null)),
    );
    for (const g of groups) {
      const teacherIds = g?.data()?.teacherIds;
      if (Array.isArray(teacherIds)) teacherIds.forEach((id: any) => { if (id) ids.add(String(id)); });
    }
  } catch { /* уведомление не вправе ломать приём работы */ }
  return [...ids];
}

export interface IngestResult {
  submissionId: string;
  isNew: boolean;
  isLate: boolean;
  attachmentCount: number;
}

/**
 * Записать присланное в сдачу: одна работа на (урок + ученик), как и в вебе.
 * Повторные сообщения дополняют её — ученик шлёт фото по одному, и каждое
 * новое не должно затирать предыдущее.
 */
export async function ingestHomeworkPart(opts: {
  orgId: string;
  studentUid: string;
  studentName: string;
  chatId: string;
  homework: OpenHomework;
  text?: string;
  attachment?: { url: string; name: string; size: number; type: string } | null;
}): Promise<IngestResult> {
  const { orgId, studentUid, studentName, chatId, homework } = opts;
  const now = new Date().toISOString();
  const isLate = isOverdue(homework.dueDate);

  const existing = await adminDb.collection(SUBMISSIONS)
    .where('lessonId', '==', homework.lessonId)
    .where('studentId', '==', studentUid)
    .limit(1).get();

  const newAttachments = opts.attachment ? [opts.attachment] : [];

  if (!existing.empty) {
    const ref = existing.docs[0].ref;
    const prev = existing.docs[0].data() || {};
    const prevAttachments = Array.isArray(prev.attachments) ? prev.attachments : [];
    const mergedText = [prev.content, opts.text].filter(Boolean).join('\n').trim();
    const attachments = [...prevAttachments, ...newAttachments];

    await ref.update({
      content: mergedText,
      attachments,
      // Работу дополнили — преподаватель должен увидеть её снова непроверенной.
      status: 'pending',
      source: 'telegram',
      telegramChatId: chatId,
      isLate,
      studentName: studentName || prev.studentName || '',
      submittedAt: now,
      maxPoints: prev.maxPoints || homework.points,
      updatedAt: now,
    });
    notifyStaff(orgId, homework, studentName, studentUid, false).catch(() => {});
    return { submissionId: ref.id, isNew: false, isLate, attachmentCount: attachments.length };
  }

  const doc = {
    lessonId: homework.lessonId,
    lessonTitle: homework.lessonTitle,
    groupId: homework.groupId || '',
    groupName: homework.groupName || '',
    studentId: studentUid,
    studentName: studentName || '',
    organizationId: orgId,
    content: opts.text || '',
    attachments: newAttachments,
    status: 'pending' as const,
    source: 'telegram' as const,
    telegramChatId: chatId,
    isLate,
    submittedAt: now,
    updatedAt: now,
    maxPoints: homework.points,
  };
  const ref = await adminDb.collection(SUBMISSIONS).add(doc);
  notifyStaff(orgId, homework, studentName, studentUid, true).catch(() => {});
  return { submissionId: ref.id, isNew: true, isLate, attachmentCount: newAttachments.length };
}

async function notifyStaff(
  orgId: string, homework: OpenHomework, studentName: string, studentUid: string, isNew: boolean,
): Promise<void> {
  const teacherIds = await resolveLessonTeacherIds(homework.lessonId);
  await notifyOrgAdmins(
    orgId, 'homework_submitted',
    isNew ? 'Новое домашнее задание' : 'Домашнее задание обновлено',
    `${studentName || 'Ученик'} ${isNew ? 'сдал(а)' : 'обновил(а)'} ДЗ через Telegram: ${homework.homeworkTitle}`,
    '/homework/review',
    teacherIds.filter(id => id !== studentUid),
  );
}

/** Подтверждение ученику после приёма — что именно засчитано. */
export function renderAcceptedText(homework: OpenHomework, res: IngestResult): string {
  const lines = [
    res.isNew ? '✅ <b>Работа принята!</b>' : '✅ <b>Работа дополнена!</b>',
    `📝 ${escapeHtml(homework.homeworkTitle)}`,
  ];
  if (res.attachmentCount) lines.push(`📎 Файлов в работе: ${res.attachmentCount}`);
  if (res.isLate) lines.push('🔴 Отправлено после срока — преподаватель увидит пометку.');
  lines.push('', 'Можете дослать ещё файлы к этой же работе или нажать /dz, чтобы выбрать другое задание.');
  return lines.join('\n');
}
