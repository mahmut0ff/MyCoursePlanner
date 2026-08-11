/**
 * Кабинеты: нормализация названий и ключи занятости.
 *
 * ВАЖНО: этот файл продублирован в src/lib/classrooms.ts. Функции бандлятся
 * отдельно (в сборку функций попадает только netlify/functions/**), импорт из
 * src/ в этом проекте прецедента не имеет. Расхождение копий стережёт тест
 * src/lib/__tests__/classrooms.parity.test.ts — правьте обе или ни одной.
 */

/** Слова, которыми в названии обозначают сам факт «это кабинет». */
const ROOM_PREFIXES = /^(кабинет|каб-т|каб|аудитория|ауд|класс|room|каб)\s*/;

/**
 * Приводит название кабинета к сравнимому виду: «Каб. 305», «каб 305»,
 * «Кабинет №305» и «305» — это один и тот же кабинет.
 *
 * Если после отбрасывания префикса ничего не осталось (кабинет так и назван —
 * «Кабинет»), возвращаем форму без отбрасывания, иначе все такие кабинеты
 * схлопнулись бы в один пустой ключ.
 */
export function normalizeRoom(s?: string | null): string {
  const base = String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[.,№#"'«»()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';
  const stripped = base.replace(ROOM_PREFIXES, '').trim();
  return stripped || base;
}

export interface RoomBearing {
  classroomId?: string | null;
  classroomName?: string | null;
  location?: string | null;
}

/**
 * Ключи, по которым два события считаются занимающими один кабинет.
 *
 * Пока идёт переезд со свободного текста на справочник, часть событий уже несёт
 * classroomId, а часть — только location. Сравнение по одному полю позволило бы
 * им незаметно занять один и тот же физический кабинет, поэтому у события может
 * быть до двух ключей, и конфликт — это пересечение множеств.
 */
export function roomKeys(e: RoomBearing): string[] {
  const keys: string[] = [];
  if (e.classroomId) keys.push(`id:${e.classroomId}`);
  const txt = normalizeRoom(e.classroomName || e.location);
  if (txt) keys.push(`txt:${txt}`);
  return keys;
}

/** Занимают ли два события один кабинет. */
export function sameRoom(a: RoomBearing, b: RoomBearing): boolean {
  const ka = roomKeys(a);
  if (!ka.length) return false;
  const kb = new Set(roomKeys(b));
  return ka.some(k => kb.has(k));
}
