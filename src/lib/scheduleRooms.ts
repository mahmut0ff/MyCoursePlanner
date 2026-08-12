/**
 * Разбор расписания по кабинетам: одна таблица на кабинет вместо одной общей.
 *
 * Главное требование — занятие попадает РОВНО в одну секцию. Иначе одноимённые
 * кабинеты двух филиалов («Каб. 301» в обоих зданиях) показали бы один и тот же
 * урок дважды, и по таблицам нельзя было бы посчитать нагрузку.
 *
 * Совпадение кабинета ищем теми же двумя ключами, что и остальной модуль
 * (см. lib/classrooms.ts): сначала ссылка classroomId, потом нормализованное
 * название. Пока идёт переезд со свободного текста на справочник, часть занятий
 * подписана только текстом — они обязаны оказаться в секции своего кабинета, а
 * не в отдельной «прочей».
 */
import { normalizeRoom } from './classrooms';
import type { Classroom, ScheduleEvent } from '../types';

/** Секция занятий, которым кабинет не назначен. Всегда последняя. */
export const NO_ROOM = '__none__';

/** Префикс ключа для кабинета, которого нет в справочнике (старый свободный текст). */
const TEXT_PREFIX = 'txt:';

export type RoomSectionKind =
  /** Кабинет из справочника. */
  | 'room'
  /** Подпись есть, кабинета в справочнике нет: архивный или ещё не заведённый. */
  | 'legacy'
  /** Кабинет не указан. */
  | 'none';

export interface RoomSection {
  /** Для кабинета справочника — его id: совпадает со значением фильтра кабинетов. */
  key: string;
  kind: RoomSectionKind;
  /** Пусто у секции 'none' — подпись ей даёт интерфейс (перевод). */
  title: string;
  classroom: Classroom | null;
  events: ScheduleEvent[];
}

/** Минимум, по которому опознаётся кабинет занятия. */
export interface RoomBearingEvent {
  classroomId?: string | null;
  classroomName?: string;
  location?: string;
  branchId?: string;
}

/**
 * Ключ секции для одного занятия.
 *
 * Ссылка на архивный кабинет (его нет в выданном справочнике) не должна прятать
 * занятие: тогда оно опознаётся по своей подписи, как и любое старое.
 */
export function sectionKeyOf(ev: RoomBearingEvent, classrooms: Classroom[]): string {
  if (ev.classroomId && classrooms.some(c => c.id === ev.classroomId)) return ev.classroomId;

  const label = normalizeRoom(ev.classroomName || ev.location);
  if (!label) return NO_ROOM;

  const byName = classrooms.filter(c => normalizeRoom(c.name) === label);
  if (byName.length) {
    // Одноимённые кабинеты в разных зданиях — берём кабинет своего филиала.
    const sameBranch = byName.find(c => (c.branchId || null) === (ev.branchId || null));
    return (sameBranch || byName[0]).id;
  }
  return TEXT_PREFIX + label;
}

/**
 * Секции в порядке отрисовки: кабинеты справочника (в его же порядке, даже
 * пустые — таблиц столько, сколько кабинетов), затем подписи вне справочника,
 * затем «без кабинета», если такие занятия есть.
 *
 * Пустые секции справочника остаются намеренно: пустой кабинет — это готовое
 * место, куда ставят занятие, а не отсутствующая строка.
 */
export function groupByRoom(events: ScheduleEvent[], classrooms: Classroom[]): RoomSection[] {
  const buckets = new Map<string, ScheduleEvent[]>();
  /** Подпись текстовой секции — в том виде, в каком её ввели. */
  const textTitles = new Map<string, string>();

  for (const ev of events) {
    const key = sectionKeyOf(ev, classrooms);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(ev);
    else buckets.set(key, [ev]);

    if (key.startsWith(TEXT_PREFIX) && !textTitles.has(key)) {
      textTitles.set(key, (ev.classroomName || ev.location || '').trim());
    }
  }

  const rooms: RoomSection[] = classrooms.map(c => ({
    key: c.id,
    kind: 'room' as const,
    title: c.name,
    classroom: c,
    events: buckets.get(c.id) || [],
  }));

  const legacy: RoomSection[] = [...textTitles.entries()]
    .map(([key, title]) => ({
      key,
      kind: 'legacy' as const,
      title,
      classroom: null,
      events: buckets.get(key) || [],
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }));

  const orphans = buckets.get(NO_ROOM) || [];

  return [
    ...rooms,
    ...legacy,
    ...(orphans.length
      ? [{ key: NO_ROOM, kind: 'none' as const, title: '', classroom: null, events: orphans }]
      : []),
  ];
}

/**
 * Поля кабинета для сохранения занятия в эту секцию.
 *
 * `location` держим в синхроне с названием: по нему читают экраны, ещё не
 * знающие о справочнике (см. комментарий у ScheduleEvent.location).
 */
export function roomFieldsOf(section: RoomSection): {
  classroomId: string | null;
  classroomName: string;
  location: string;
} {
  const name = section.classroom?.name ?? (section.kind === 'legacy' ? section.title : '');
  return {
    classroomId: section.classroom?.id ?? null,
    classroomName: name,
    location: name,
  };
}
