/**
 * Область видимости ростера: `students:read` — это НЕ право на всю организацию.
 *
 * Преподавателю чтение учеников выдано по умолчанию (TEACHER_DEFAULT), потому
 * что без него не работают журнал, оценки и карточка группы. Но сам список
 * `?action=students` отдавал всю организацию — с телефонами и учениками, которых
 * преподаватель не ведёт. В меню пункта «Студенты» у него нет намеренно
 * (navModel.tsx), однако одной ссылки — например, «Назад» с карточки ученика —
 * хватало, чтобы туда попасть.
 *
 * Правило то же, что и для действий над ростером: без «ведения контингента»
 * область — свои группы, с ним — вся организация (standingIsRosterManager).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memberDocs: Array<{ id: string; data: () => any }> = [];
const groupDocs: Array<{ id: string; data: () => any }> = [];
const groupQuery = vi.fn();
/** orgSettings.teacherGroupManagement — политика «преподаватель ведёт свои группы». */
let teacherGroupManagement = false;

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'groups') {
        return {
          where: vi.fn((field: string, op: string, value: any) => {
            groupQuery(field, op, value);
            return { get: vi.fn().mockResolvedValue({ docs: groupDocs }) };
          }),
        };
      }
      if (name === 'orgSettings') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ teacherGroupManagement }),
            }),
          })),
        };
      }
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            where: vi.fn(function self(this: any) { return this; }),
            get: vi.fn().mockResolvedValue({ docs: memberDocs }),
          })),
        })),
      };
    }),
  },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/auth', async () => {
  const actual = await vi.importActual<any>('../utils/auth');
  return {
    ...actual,
    verifyAuth: vi.fn(),
    getOrgFilter: vi.fn(() => 'org-1'),
    resolveBranchFilter: vi.fn(() => null),
  };
});

import { verifyAuth } from '../utils/auth';
import { handler as orgHandler } from '../api-org';

const event = () => ({
  httpMethod: 'GET',
  queryStringParameters: { action: 'students' },
  headers: {},
  body: null,
}) as any;

const asUser = (role: string, grants: string[]) => {
  (verifyAuth as any).mockResolvedValue({
    uid: 'teacher-1', role, organizationId: 'org-1',
    branchIds: [], primaryBranchId: null, rbac: new Set(grants),
    permissions: {}, customRoleId: null,
  });
};

const names = (res: any): string[] =>
  JSON.parse(res.body).map((s: any) => s.displayName).sort();

describe('api-org ?action=students — область видимости преподавателя', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberDocs.length = 0;
    groupDocs.length = 0;
    teacherGroupManagement = false;

    memberDocs.push(
      { id: 'stud-mine', data: () => ({ userId: 'stud-mine', userName: 'Свой ученик', role: 'student', status: 'active', branchIds: [] }) },
      { id: 'stud-other', data: () => ({ userId: 'stud-other', userName: 'Чужой ученик', role: 'student', status: 'active', branchIds: [] }) },
    );
    groupDocs.push({
      id: 'group-1',
      data: () => ({ organizationId: 'org-1', teacherIds: ['teacher-1'], studentIds: ['stud-mine'] }),
    });
  });

  it('преподаватель получает только учеников своих групп', async () => {
    asUser('teacher', ['students:read']);

    const res: any = await orgHandler(event(), {} as any);

    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(['Свой ученик']);
    // Область берётся из групп, где он преподаёт, — а не из роли и не из филиала.
    expect(groupQuery).toHaveBeenCalledWith('teacherIds', 'array-contains', 'teacher-1');
  });

  it('группа чужой организации не расширяет область', async () => {
    asUser('teacher', ['students:read']);
    groupDocs.push({
      id: 'group-alien',
      data: () => ({ organizationId: 'org-2', teacherIds: ['teacher-1'], studentIds: ['stud-other'] }),
    });

    const res: any = await orgHandler(event(), {} as any);

    expect(names(res)).toEqual(['Свой ученик']);
  });

  it('с «ведением контингента» преподаватель видит весь ростер', async () => {
    asUser('teacher', ['students:read', 'roster_management:write']);

    const res: any = await orgHandler(event(), {} as any);

    expect(names(res)).toEqual(['Свой ученик', 'Чужой ученик']);
    // Группы для этого даже не запрашиваются: область — вся организация.
    expect(groupQuery).not.toHaveBeenCalled();
  });

  it('администратора правило не касается', async () => {
    asUser('admin', ['students:read']);

    const res: any = await orgHandler(event(), {} as any);

    expect(names(res)).toEqual(['Свой ученик', 'Чужой ученик']);
  });

  it('центр с политикой «преподаватель ведёт свои группы» видит ростер целиком', async () => {
    // Иначе набирать состав группы не из кого — привилегия выдана осознанно.
    asUser('teacher', ['students:read']);
    teacherGroupManagement = true;

    const res: any = await orgHandler(event(), {} as any);

    expect(names(res)).toEqual(['Свой ученик', 'Чужой ученик']);
  });

  it('преподаватель без групп не получает никого', async () => {
    asUser('teacher', ['students:read']);
    groupDocs.length = 0;

    const res: any = await orgHandler(event(), {} as any);

    expect(JSON.parse(res.body)).toEqual([]);
  });
});
