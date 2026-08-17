/**
 * Расписание для Telegram-копилотов — общий источник правды для директора,
 * преподавателя, ученика и родителя.
 *
 * До этого расписание видел ТОЛЬКО продающий бот организации (sales-copilot,
 * find_nearest_group). Внутренние копилоты о занятиях не знали ничего: на «когда
 * у меня завтра урок», «какое расписание у группы A2», «кто ведёт в 18:00»
 * ответить было нечем — при том, что веб-ассистент те же данные отдаёт
 * (api-ai-assistant → get_schedule). Этот модуль закрывает разрыв.
 *
 * Модель данных `scheduleEvents` (см. api-org.ts, action=createEvent):
 *   • еженедельное занятие: recurring:true + dayOfWeek (0=Пн..6=Вс), date:null;
 *   • разовое: recurring:false + date:'YYYY-MM-DD';
 *   • время — startTime/endTime в формате 'HH:MM';
 *   • кабинет — classroomName, продублированный в location (см. memory о справочнике).
 *
 * Развёртка ведётся в КАЛЕНДАРЕ ОРГАНИЗАЦИИ (UTC+6, как весь остальной контур:
 * finance-period.ts, payroll-engine.ts, src/lib/payment-plans.ts). Функции
 * Netlify исполняются в UTC, поэтому с 18:00 UTC «сегодня» уезжало бы на день
 * назад от Бишкека — бот называл бы занятия не того дня, а проверить его
 * ученику неоткуда.
 *
 * Все чтения — по одному полю (organizationId), без составных индексов: их в
 * этом проекте не деплоят.
 */
import { adminDb } from './firebase-admin';

/** 0=Пн .. 6=Вс — соглашение проекта (см. lesson-reminders.ts). */
export const WEEKDAYS_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

/** Смещение календаря организации от UTC. Появится часовой пояс у организации — менять здесь и в финансовых утилитах. */
const ORG_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Сколько дней вперёд показываем по умолчанию (неделя — привычный горизонт «что у нас на неделе»). */
export const DEFAULT_SCHEDULE_DAYS = 7;

/** Потолок строк в одном блоке расписания, чтобы промпт не раздувался у большого центра. */
const DEFAULT_MAX_LINES = 90;

/** Минимальная форма документа `scheduleEvents`, нужная для развёртки и вывода. */
export interface ScheduleEventLite {
  recurring?: boolean | null;
  dayOfWeek?: number | null;    // 0=Пн..6=Вс, у еженедельных
  date?: string | null;         // 'YYYY-MM-DD', у разовых
  startTime?: string | null;    // 'HH:MM'
  endTime?: string | null;      // 'HH:MM'
  title?: string | null;
  type?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  courseName?: string | null;
  teacherId?: string | null;
  teacherName?: string | null;
  classroomName?: string | null;
  location?: string | null;
}

/** Конкретное занятие в конкретный календарный день. */
export interface ScheduleOccurrence {
  date: string;        // 'YYYY-MM-DD' в календаре организации
  weekday: number;     // 0=Пн..6=Вс
  startTime: string;   // 'HH:MM'
  endTime: string;     // 'HH:MM' или ''
  title: string;
  groupName: string;
  teacherName: string;
  place: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Календарные компоненты момента ГЛАЗАМИ ОРГАНИЗАЦИИ. */
function orgParts(now: Date): { y: number; m: number; day: number } {
  const s = new Date(now.getTime() + ORG_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), day: s.getUTCDate() };
}

/** Сегодняшняя дата в календаре организации ('YYYY-MM-DD'). */
export function orgTodayISO(now: Date = new Date()): string {
  const { y, m, day } = orgParts(now);
  return `${y}-${pad2(m + 1)}-${pad2(day)}`;
}

interface OrgDay { iso: string; weekday: number; }

/** `days` подряд идущих дней организации, начиная с сегодняшнего. */
function orgCalendar(now: Date, days: number): OrgDay[] {
  const { y, m, day } = orgParts(now);
  const out: OrgDay[] = [];
  for (let i = 0; i < days; i++) {
    // Date.UTC сам переносит через границы месяца и года.
    const d = new Date(Date.UTC(y, m, day + i));
    out.push({
      iso: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
      weekday: (d.getUTCDay() + 6) % 7,
    });
  }
  return out;
}

/** 'HH:MM' → минуты от полуночи, либо null, если время непригодно для сортировки. */
function timeKey(raw: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((raw || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function toOccurrence(ev: ScheduleEventLite, day: OrgDay): ScheduleOccurrence {
  return {
    date: day.iso,
    weekday: day.weekday,
    startTime: (ev.startTime || '').trim(),
    endTime: (ev.endTime || '').trim(),
    title: (ev.title || 'Занятие').trim(),
    groupName: (ev.groupName || '').trim(),
    teacherName: (ev.teacherName || '').trim(),
    place: (ev.classroomName || ev.location || '').trim(),
  };
}

/**
 * Развернуть события в конкретные занятия на ближайшие `days` дней (включая
 * сегодняшний целиком — «какое расписание сегодня» спрашивают и в середине дня).
 * Чистая функция: `now` инжектируется, поэтому арифметика дней тестируема.
 */
export function expandSchedule(
  events: ScheduleEventLite[],
  opts: { now?: Date; days?: number } = {},
): ScheduleOccurrence[] {
  const now = opts.now || new Date();
  const days = Math.max(1, opts.days ?? DEFAULT_SCHEDULE_DAYS);

  const weekly = new Map<number, ScheduleEventLite[]>();
  const dated = new Map<string, ScheduleEventLite[]>();
  for (const ev of events || []) {
    if (timeKey(ev.startTime) === null) continue; // без внятного времени занятие не назовёшь
    if (ev.recurring && typeof ev.dayOfWeek === 'number') {
      const list = weekly.get(ev.dayOfWeek) || [];
      list.push(ev);
      weekly.set(ev.dayOfWeek, list);
    } else if (ev.date && /^\d{4}-\d{2}-\d{2}$/.test(ev.date)) {
      const list = dated.get(ev.date) || [];
      list.push(ev);
      dated.set(ev.date, list);
    }
  }

  const out: ScheduleOccurrence[] = [];
  for (const day of orgCalendar(now, days)) {
    const list = [...(weekly.get(day.weekday) || []), ...(dated.get(day.iso) || [])];
    list.sort((a, b) => (timeKey(a.startTime) ?? 0) - (timeKey(b.startTime) ?? 0));
    for (const ev of list) out.push(toOccurrence(ev, day));
  }
  return out;
}

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** «17.08» из «2026-08-17». */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Одна строка занятия: время, название, группа, преподаватель, кабинет — без повторов. */
function occurrenceLine(o: ScheduleOccurrence, opts: { showTeacher: boolean }): string {
  const time = o.endTime ? `${o.startTime}–${o.endTime}` : o.startTime;
  const parts = [o.title];
  if (o.groupName && o.groupName !== o.title) parts.push(o.groupName);
  if (opts.showTeacher && o.teacherName) parts.push(o.teacherName);
  if (o.place) parts.push(o.place);
  return `${time} — ${parts.join(' · ')}`;
}

export interface RenderScheduleOptions {
  now?: Date;
  days?: number;
  maxLines?: number;
  /** Имя преподавателя в строке. Ученику/родителю полезно, преподавателю о себе — нет. */
  showTeacher?: boolean;
  /** 'html' экранирует данные и выделяет дни жирным (для прямой отправки в Telegram). */
  format?: 'text' | 'html';
  /** Что написать, если за весь период нет ни одного занятия. */
  emptyText?: string;
}

/**
 * Отрисовать расписание на ближайшие дни. Пустые дни печатаются явно
 * («занятий нет») — это дешевле одной строки и снимает соблазн у модели
 * додумать занятие там, где его нет.
 */
export function renderSchedule(events: ScheduleEventLite[], opts: RenderScheduleOptions = {}): string {
  const now = opts.now || new Date();
  const days = Math.max(1, opts.days ?? DEFAULT_SCHEDULE_DAYS);
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
  const html = opts.format === 'html';
  const showTeacher = opts.showTeacher !== false;
  const emptyText = opts.emptyText || 'Занятий в расписании на ближайшие дни нет.';

  const occurrences = expandSchedule(events, { now, days });
  if (!occurrences.length) return emptyText;

  const byDate = new Map<string, ScheduleOccurrence[]>();
  for (const o of occurrences) {
    const list = byDate.get(o.date) || [];
    list.push(o);
    byDate.set(o.date, list);
  }

  const calendar = orgCalendar(now, days);
  const out: string[] = [];
  let printed = 0;
  let truncated = false;

  for (let i = 0; i < calendar.length && !truncated; i++) {
    const day = calendar[i];
    const rel = i === 0 ? ' (сегодня)' : i === 1 ? ' (завтра)' : '';
    const rawHeader = `${capitalize(WEEKDAYS_RU[day.weekday])}, ${shortDate(day.iso)}${rel}`;
    const header = html ? `<b>${rawHeader}</b>` : rawHeader;
    const list = byDate.get(day.iso) || [];
    if (!list.length) {
      out.push(`${header}: занятий нет`);
      continue;
    }
    // Потолок режет ПО СТРОКАМ, а не по дням: у большого центра один понедельник
    // может перекрыть лимит целиком, и отбрасывать его весь — значит не показать
    // ничего и сообщить об этом одной строкой.
    if (printed >= maxLines) { truncated = true; break; }
    out.push(`${header}:`);
    for (const o of list) {
      if (printed >= maxLines) { truncated = true; break; }
      const line = occurrenceLine(o, { showTeacher });
      out.push(`• ${html ? esc(line) : line}`);
      printed++;
    }
  }

  if (truncated) out.push(`…дальше не показано; всего занятий за ${days} дн.: ${occurrences.length}`);
  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Чтение из Firestore + область видимости
// ─────────────────────────────────────────────────────────────────────────────

/** Все события расписания организации (одно равенство — индекс не нужен). */
export async function loadScheduleEvents(orgId: string): Promise<ScheduleEventLite[]> {
  const snap = await adminDb.collection('scheduleEvents')
    .where('organizationId', '==', orgId).get().catch(() => null);
  if (!snap) return [];
  return snap.docs.map(d => {
    const e = d.data() as any;
    return {
      recurring: e.recurring ?? null, dayOfWeek: e.dayOfWeek ?? null, date: e.date ?? null,
      startTime: e.startTime ?? null, endTime: e.endTime ?? null,
      title: e.title ?? null, type: e.type ?? null,
      groupId: e.groupId ?? null, groupName: e.groupName ?? null, courseName: e.courseName ?? null,
      teacherId: e.teacherId ?? null, teacherName: e.teacherName ?? null,
      classroomName: e.classroomName ?? null, location: e.location ?? null,
    } as ScheduleEventLite;
  });
}

export interface ScheduleScope {
  /** Группы человека. Пусто — значит по группам не проходит ничего. */
  groupIds?: Iterable<string> | null;
  /** Его же занятия, назначенные лично (у события есть teacherId). */
  teacherId?: string | null;
  /** Общеорганизационные события (без groupId). Веб показывает их всем — зеркалим. */
  includeOrgWide?: boolean;
}

/**
 * Сузить события до тех, что человек и так видит в приложении. Зеркалит фильтр
 * api-org (action=schedule): свои группы + общеорганизационные события + то, что
 * ведёт лично. Копилот не должен показывать больше, чем показывает экран.
 */
export function scopeEvents(events: ScheduleEventLite[], scope: ScheduleScope): ScheduleEventLite[] {
  const ids = new Set(scope.groupIds || []);
  const includeOrgWide = scope.includeOrgWide !== false;
  return (events || []).filter(ev => {
    if (!ev.groupId) return includeOrgWide;
    if (ids.has(ev.groupId)) return true;
    return !!scope.teacherId && ev.teacherId === scope.teacherId;
  });
}

/** Группы организации, где `uid` числится учеником (чтение по одному полю + фильтр в памяти). */
export async function studentGroupIds(orgId: string, uid: string): Promise<string[]> {
  return groupIdsFor(orgId, uid, 'studentIds');
}

/** Группы организации, которые ведёт `uid`. */
export async function teacherGroupIds(orgId: string, uid: string): Promise<string[]> {
  return groupIdsFor(orgId, uid, 'teacherIds');
}

async function groupIdsFor(orgId: string, uid: string, field: 'studentIds' | 'teacherIds'): Promise<string[]> {
  // Читаем группы одним равенством и фильтруем в памяти: `array-contains` вместе
  // с `organizationId` требует составного индекса, а их здесь не деплоят.
  const snap = await adminDb.collection('groups').where('organizationId', '==', orgId).get().catch(() => null);
  if (!snap) return [];
  return snap.docs.filter(d => ((d.data() as any)[field] || []).includes(uid)).map(d => d.id);
}

/**
 * Готовый блок расписания. `scope === 'all'` — весь центр (директор/менеджер),
 * иначе сужаем до групп и личных занятий человека.
 */
export async function buildScheduleText(
  orgId: string, scope: ScheduleScope | 'all', opts: RenderScheduleOptions = {},
): Promise<string> {
  const events = await loadScheduleEvents(orgId);
  return renderSchedule(scope === 'all' ? events : scopeEvents(events, scope), opts);
}

/** Область видимости расписания для сотрудника — как на экране «Расписание». */
export async function resolveStaffScope(
  orgId: string, uid: string, isDirector: boolean,
): Promise<ScheduleScope | 'all'> {
  if (isDirector) return 'all';
  return { groupIds: await teacherGroupIds(orgId, uid), teacherId: uid };
}

/**
 * Готовый блок расписания одного ученика — его группы плюс общеорганизационные
 * занятия. Используют и репетитор ученика, и ответы родителю: у обоих вопрос
 * один и тот же («когда занятия»), значит и данные должны быть одни.
 */
export async function buildStudentScheduleText(
  orgId: string, studentUid: string, opts: RenderScheduleOptions = {},
): Promise<string> {
  const [events, groupIds] = await Promise.all([
    loadScheduleEvents(orgId),
    studentGroupIds(orgId, studentUid),
  ]);
  return renderSchedule(scopeEvents(events, { groupIds, includeOrgWide: true }), {
    emptyText: 'Занятий в расписании на ближайшие дни нет.',
    ...opts,
  });
}
