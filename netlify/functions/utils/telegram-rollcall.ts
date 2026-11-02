/**
 * Перекличка кнопками в Telegram — без AI и на любом тарифе.
 *
 * /otmetka → группы преподавателя (сегодняшние занятия первыми) → список
 * студентов, где все по умолчанию «были»; нажатие переключает «не был» →
 * «Сохранить». Сохранение идёт тем же путём, что у копилота (applyJournalUpserts:
 * ключ журнала organizationId+courseId+studentId+date), плюс запись «урок
 * состоялся» в lessonSessions — те же поля и тот же дедуп (org, группа, дата),
 * что у api-gradebook bulkAttendance. По ней вечерний journal-reminders понимает,
 * что журнал заполнен.
 *
 * Черновик живёт в rollcallDrafts/{chatId}: callback_data ограничена 64 байтами,
 * поэтому в кнопке только индекс студента, а состав и отметки — в документе.
 */
import { adminDb } from './firebase-admin';
import { createNotification } from './notifications';
import { orgTodayISO, loadScheduleEvents } from './schedule-context';
import { applyJournalUpserts, logJournalActivity, can, type StaffContext, type RosterStudent } from './copilot-actions';

const DRAFTS = 'rollcallDrafts';
const MAX_GROUPS = 10;
const MAX_STUDENTS = 60; // 30 рядов кнопок — дальше Telegram-клавиатура неудобна
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const now = () => new Date().toISOString();

export interface RollcallDraft {
  uid: string;
  orgId: string;
  groupId: string;
  groupName: string;
  courseId: string;
  courseName: string;
  date: string;
  students: { id: string; name: string }[];
  absent: string[];
  updatedAt: string;
}

type Keyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

/** Сегодняшнее занятие события: еженедельное по дню недели или разовое по дате. */
function isToday(ev: { recurring?: boolean | null; dayOfWeek?: number | null; date?: string | null }, today: string): boolean {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return ev.recurring ? ev.dayOfWeek === dow : ev.date === today;
}

/** Группы, которые сотрудник может отметить: свои (директору — все), только с курсом. Сегодняшние — первыми. */
export async function listRollcallGroups(staff: StaffContext): Promise<{ id: string; label: string }[]> {
  const today = orgTodayISO();
  const [groupSnap, events] = await Promise.all([
    adminDb.collection('groups').where('organizationId', '==', staff.orgId).get(),
    loadScheduleEvents(staff.orgId),
  ]);
  const timeByGroup = new Map<string, string>();
  for (const ev of events) {
    if (!ev.groupId || !isToday(ev, today)) continue;
    const t = (ev.startTime || '').trim();
    const prev = timeByGroup.get(ev.groupId);
    if (prev === undefined || t < prev) timeByGroup.set(ev.groupId, t);
  }
  const groups = groupSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(g => g.courseId && (g.studentIds || []).length > 0)
    .filter(g => (g.teacherIds || []).includes(staff.uid) || (staff.isDirector && timeByGroup.has(g.id)));
  groups.sort((a, b) => {
    const ta = timeByGroup.get(a.id), tb = timeByGroup.get(b.id);
    if (ta !== undefined && tb !== undefined) return ta.localeCompare(tb);
    if (ta !== undefined) return -1;
    if (tb !== undefined) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
  });
  return groups.slice(0, MAX_GROUPS).map(g => {
    const t = timeByGroup.get(g.id);
    return { id: g.id, label: `${t !== undefined ? `🟢 ${t} ` : ''}${g.name || 'Группа'}` };
  });
}

export function groupPickerKeyboard(groups: { id: string; label: string }[]): Keyboard {
  return { inline_keyboard: groups.map(g => [{ text: g.label, callback_data: `att:g:${g.id}` }]) };
}

export function rollcallText(d: RollcallDraft): string {
  const [, m, day] = d.date.split('-');
  const present = d.students.length - d.absent.length;
  return `🗓 <b>Перекличка</b> · ${esc(d.groupName)} · ${day}.${m}\n\n`
    + 'Нажмите на тех, кого <b>не было</b>. ✅ был · ❌ не был\n\n'
    + `Пришли: ${present} из ${d.students.length}`;
}

export function rollcallKeyboard(d: RollcallDraft): Keyboard {
  const absent = new Set(d.absent);
  const rows: Keyboard['inline_keyboard'] = [];
  d.students.forEach((s, i) => {
    const btn = { text: `${absent.has(s.id) ? '❌' : '✅'} ${s.name}`, callback_data: `att:t:${i}` };
    if (i % 2 === 0) rows.push([btn]); else rows[rows.length - 1].push(btn);
  });
  rows.push([{ text: '↺ Все были', callback_data: 'att:all' }, { text: '💾 Сохранить', callback_data: 'att:s' }]);
  return { inline_keyboard: rows };
}

/** Открыть перекличку по группе. Строка — причина отказа для пользователя. */
export async function startRollcall(staff: StaffContext, chatId: string, groupId: string): Promise<RollcallDraft | string> {
  if (!can(staff, 'gradebook', 'write')) return 'У вас нет прав на отметку посещаемости.';
  const gSnap = await adminDb.collection('groups').doc(groupId).get();
  const g: any = gSnap.exists ? gSnap.data() : null;
  if (!g || g.organizationId !== staff.orgId) return 'Группа не найдена.';
  if (!staff.isDirector && !(g.teacherIds || []).includes(staff.uid)) return 'Это не ваша группа.';
  if (!g.courseId) return 'У группы не указан курс — отметьте посещаемость в веб-журнале.';

  const ids: string[] = [...new Set<string>(g.studentIds || [])].slice(0, MAX_STUDENTS);
  if (!ids.length) return 'В группе нет студентов.';
  const docs = await adminDb.getAll(...ids.map(id => adminDb.collection('users').doc(id)));
  const students = docs
    .map(d => ({ id: d.id, name: String((d.data() as any)?.displayName || '').trim() || 'Студент' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const draft: RollcallDraft = {
    uid: staff.uid, orgId: staff.orgId, groupId, groupName: g.name || 'Группа',
    courseId: g.courseId, courseName: g.courseName || '', date: orgTodayISO(),
    students, absent: [], updatedAt: now(),
  };
  await adminDb.collection(DRAFTS).doc(chatId).set(draft);
  return draft;
}

/** Черновик этого сотрудника, если он ещё свежий. */
async function loadDraft(chatId: string, uid: string): Promise<RollcallDraft | null> {
  const snap = await adminDb.collection(DRAFTS).doc(chatId).get();
  const d = snap.exists ? (snap.data() as RollcallDraft) : null;
  if (!d || d.uid !== uid || Date.now() - Date.parse(d.updatedAt) > DRAFT_TTL_MS) return null;
  return d;
}

/** Переключить «был/не был» у студента по индексу кнопки, либо сбросить всех в «были». */
export async function toggleRollcall(chatId: string, uid: string, index: number | 'all'): Promise<RollcallDraft | null> {
  const d = await loadDraft(chatId, uid);
  if (!d) return null;
  if (index === 'all') d.absent = [];
  else {
    const s = d.students[index];
    if (!s) return d;
    d.absent = d.absent.includes(s.id) ? d.absent.filter(x => x !== s.id) : [...d.absent, s.id];
  }
  d.updatedAt = now();
  await adminDb.collection(DRAFTS).doc(chatId).set(d);
  return d;
}

/**
 * «Урок состоялся» — зеркало api-gradebook bulkAttendance: дедуп по (org, группа,
 * дата); teacherId — отметивший, если он ведёт группу, иначе единственный
 * преподаватель группы, иначе null; длительность и источник — из расписания.
 */
async function upsertLessonSession(staff: StaffContext, d: RollcallDraft, headcount: number): Promise<void> {
  const gSnap = await adminDb.collection('groups').doc(d.groupId).get();
  const g: any = gSnap.data() || {};
  const teacherIds: string[] = Array.isArray(g.teacherIds) ? g.teacherIds : [];
  const teacherId = teacherIds.includes(staff.uid) ? staff.uid : teacherIds.length === 1 ? teacherIds[0] : null;
  const common = {
    teacherId, branchId: g.branchId ?? null, courseId: d.courseId, headcount,
    status: 'held', confirmedBy: staff.uid, confirmedAt: now(),
  };
  const existing = await adminDb.collection('lessonSessions')
    .where('organizationId', '==', d.orgId).where('groupId', '==', d.groupId).where('date', '==', d.date)
    .limit(1).get();
  if (!existing.empty) {
    await existing.docs[0].ref.update({ ...common, updatedAt: now() });
    return;
  }
  const evSnap = await adminDb.collection('scheduleEvents')
    .where('organizationId', '==', d.orgId).where('groupId', '==', d.groupId).get();
  const evs = evSnap.docs.map(x => ({ id: x.id, ...(x.data() as any) }));
  const match = evs.find(e => !e.recurring && e.date === d.date) ?? evs.find(e => e.recurring && isToday(e, d.date));
  await adminDb.collection('lessonSessions').add({
    ...common, organizationId: d.orgId, groupId: d.groupId, date: d.date,
    durationMinutes: typeof match?.duration === 'number' ? match.duration : null,
    sourceEventId: match?.id ?? null, createdAt: now(),
  });
}

/** Сохранить перекличку. Возвращает текст для чата. */
export async function saveRollcall(staff: StaffContext, chatId: string): Promise<string> {
  if (!can(staff, 'gradebook', 'write')) return '⚠️ У вас нет прав на отметку посещаемости.';
  const d = await loadDraft(chatId, staff.uid);
  if (!d) return '⌛ Перекличка устарела. Начните заново: /otmetka';

  const absent = new Set(d.absent);
  const items = d.students.map(s => ({
    entry: { studentId: s.id, name: s.name, groupId: d.groupId, groupName: d.groupName, courseId: d.courseId, courseName: d.courseName } as RosterStudent,
    patch: { attendance: absent.has(s.id) ? 'absent' as const : 'present' as const },
  }));
  const { okIds, failed } = await applyJournalUpserts(staff, d.date, items);
  if (okIds.size === 0) return '⚠️ Не удалось сохранить перекличку. Попробуйте ещё раз.';

  const presentOk = d.students.filter(s => !absent.has(s.id) && okIds.has(s.id)).length;
  await upsertLessonSession(staff, d, presentOk)
    .catch(e => console.warn('rollcall: lessonSession failed (non-fatal):', e));
  await logJournalActivity(staff, 'attendance_marked', okIds.size, { date: d.date, mode: 'bulk', groupId: d.groupId });

  for (const s of d.students) {
    if (!absent.has(s.id) || !okIds.has(s.id)) continue;
    createNotification({
      recipientId: s.id, type: 'attendance_absent', title: 'Пропуск занятия',
      message: `Вы отмечены отсутствующим на занятии${d.courseName ? ` «${d.courseName}»` : ''} (${d.date})`,
      organizationId: staff.orgId,
    }).catch(() => {});
  }
  await adminDb.collection(DRAFTS).doc(chatId).delete().catch(() => {});

  const missed = d.students.filter(s => absent.has(s.id)).map(s => esc(s.name));
  let out = `✅ <b>Перекличка сохранена</b> · ${esc(d.groupName)}\nПришли: ${presentOk} из ${d.students.length}`;
  if (missed.length) out += `\nНе было: ${missed.join(', ')} — им и родителям ушло уведомление.`;
  if (failed.length) out += `\n\n⚠️ Не записались: ${failed.join(', ')}. Проверьте в веб-журнале.`;
  return out;
}
