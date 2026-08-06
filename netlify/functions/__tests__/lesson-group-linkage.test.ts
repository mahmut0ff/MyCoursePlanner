/**
 * `groupNames` обязан идти вровень с `groupIds` — индекс в индекс.
 *
 * В фильтре «Уроки» в селекте вместо названия группы появился сырой id
 * документа. Причина не в фильтре: редактор собирал имена сам, из своего списка
 * групп, а тот отфильтрован активным филиалом. Группу, которую он не видел,
 * `.filter(Boolean)` выбрасывал ИЗ ИМЁН, оставляя её id В `groupIds` — массивы
 * разъезжались, каждое следующее имя доставалось чужой группе, а последнему id
 * имени уже не хватало, и в интерфейс уезжал ключ базы.
 *
 * Теперь имена берутся из документов групп на сервере. Здесь закреплено главное
 * свойство: длины совпадают, и i-е имя принадлежит i-му id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn(), batch: vi.fn(), getAll: vi.fn() },
  getDocsByIds: vi.fn(),
}));

import { resolveGroupLinkage } from '../api-lessons';
import { getDocsByIds } from '../utils/firebase-admin';

/** Stub the groups collection: id -> document data. */
const mockGroups = (groups: Record<string, any>) => (getDocsByIds as any).mockResolvedValue(groups);
const g = (name: string, organizationId = 'org-1') => ({ name, organizationId });

beforeEach(() => vi.clearAllMocks());

describe('resolveGroupLinkage', () => {
  it('pairs every id with its own name', async () => {
    mockGroups({ g1: g('PE1'), g2: g('Махмутов А') });
    const out = await resolveGroupLinkage(['g1', 'g2'], 'org-1');
    expect(out).toEqual({ groupIds: ['g1', 'g2'], groupNames: ['PE1', 'Махмутов А'] });
  });

  it('never returns arrays of different lengths, whatever is missing', async () => {
    // g2 deleted, g4 belongs to another tenant — the pair must stay aligned.
    mockGroups({ g1: g('PE1'), g3: g('Махмутов А'), g4: g('Чужая', 'org-2') });
    const out = await resolveGroupLinkage(['g1', 'g2', 'g3', 'g4'], 'org-1');
    expect(out.groupIds).toEqual(['g1', 'g3']);
    expect(out.groupNames).toEqual(['PE1', 'Махмутов А']);
    expect(out.groupIds.length).toBe(out.groupNames.length);
  });

  it('keeps the slot of a group whose name is empty rather than shifting the rest', async () => {
    mockGroups({ g1: g(''), g2: g('PE1') });
    const out = await resolveGroupLinkage(['g1', 'g2'], 'org-1');
    expect(out.groupIds).toEqual(['g1', 'g2']);
    expect(out.groupNames).toEqual(['', 'PE1']);
  });

  it('resolves a group with no organizationId of its own (legacy document)', async () => {
    mockGroups({ g1: { name: 'Старая группа' } });
    expect(await resolveGroupLinkage(['g1'], 'org-1')).toEqual({ groupIds: ['g1'], groupNames: ['Старая группа'] });
  });

  it('dedupes and trims the incoming ids', async () => {
    mockGroups({ g1: g('PE1') });
    const out = await resolveGroupLinkage([' g1 ', 'g1'], 'org-1');
    expect(out).toEqual({ groupIds: ['g1'], groupNames: ['PE1'] });
    expect(getDocsByIds).toHaveBeenCalledWith('groups', ['g1']);
  });

  it.each([
    ['undefined', undefined],
    ['a string', 'g1'],
    ['an empty array', []],
    ['junk entries only', ['', '   ', null, 7]],
  ])('returns an empty linkage for %s without touching Firestore', async (_label, input) => {
    const out = await resolveGroupLinkage(input as unknown, 'org-1');
    expect(out).toEqual({ groupIds: [], groupNames: [] });
    expect(getDocsByIds).not.toHaveBeenCalled();
  });
});
