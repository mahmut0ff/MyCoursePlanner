/**
 * API: AI Assistant — in-app agentic copilot for org staff (the floating chat).
 *
 * Architecture: a Gemini function-calling loop over a permission-gated tool
 * registry. READ tools run immediately inside the loop (results are compacted
 * before being fed back to the model). WRITE tools are NEVER executed by the
 * model directly — the loop returns them as pending actions, the UI shows a
 * confirmation card, and only an explicit `execute` request performs the write.
 *
 * Zero business-logic duplication: every tool dispatches a synthetic event to
 * the REAL endpoint handler (api-org, api-branches, api-finance-*), so the
 * assistant inherits the exact same RBAC checks, branch scoping, seat limits,
 * payment-plan syncing and notifications as the buttons in the UI. On top of
 * that, the tool list itself is pre-filtered by the caller's RBAC grants, so
 * the model never even sees tools the user could not run.
 *
 * Actions:
 *   • capabilities (GET) — the caller's available tools (for suggestion chips)
 *   • chat (POST)        — one agentic turn: {messages, lang} → {reply, actions?}
 *   • execute (POST)     — run one confirmed write tool: {tool, args}
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { SchemaType } from '@google/generative-ai';
import {
  verifyAuth, jsonResponse, ok, badRequest, unauthorized, forbidden,
  isStaff, can, hasRole, hasPermission, type AuthUser,
} from './utils/auth';
import { generateWithFallback, hasGeminiKey, aiAllowed, recordAiUsage } from './utils/ai';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import { handler as orgHandler } from './api-org';
import { handler as branchesHandler } from './api-branches';
import { handler as financePlansHandler } from './api-finance-plans';
import { handler as financeTxHandler } from './api-finance-transactions';
import { handler as financeMetricsHandler } from './api-finance-metrics';

const MAX_LOOPS = 5;          // read-tool rounds per turn
const MAX_LIST = 30;          // rows fed back to the model per read tool
const MAX_HISTORY = 30;       // chat turns accepted from the client

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch to real endpoint handlers via synthetic events
// ─────────────────────────────────────────────────────────────────────────────

class ToolError extends Error {
  status: number;
  payload: any;
  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Invoke another Netlify function handler in-process, preserving the caller's
 * Authorization header so the target endpoint re-verifies and re-authorizes
 * exactly as if the UI had called it.
 */
async function dispatch(
  fn: Handler,
  event: HandlerEvent,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  params: Record<string, string>,
  body?: any,
): Promise<any> {
  const res: any = await (fn as any)(
    {
      ...event,
      httpMethod: method,
      queryStringParameters: params,
      body: body !== undefined ? JSON.stringify(body) : null,
    },
    {} as any,
  );
  let data: any = {};
  try { data = JSON.parse(res?.body || '{}'); } catch { /* non-JSON body */ }
  if (!res || res.statusCode >= 400) {
    throw new ToolError(res?.statusCode || 500, data?.error || 'Ошибка выполнения', data);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: any) => String(s || '').toLowerCase().trim();
const matches = (query: any, ...fields: any[]) => {
  const q = norm(query);
  if (!q) return true;
  return fields.some(f => norm(f).includes(q));
};
/** Trim a list for the model: first MAX_LIST rows + total count. */
const page = <T>(rows: T[]) => ({
  total: rows.length,
  showing: Math.min(rows.length, MAX_LIST),
  items: rows.slice(0, MAX_LIST),
});
const str = (v: any) => (v === undefined || v === null ? '' : String(v));
const joinNames = (list: string[], max = 5) =>
  list.slice(0, max).join(', ') + (list.length > max ? ` и ещё ${list.length - max}` : '');

// ─────────────────────────────────────────────────────────────────────────────
// Tool registry
// ─────────────────────────────────────────────────────────────────────────────

interface ToolSpec {
  name: string;
  kind: 'read' | 'write';
  /** Destructive — the UI renders a red confirmation. */
  danger?: boolean;
  /** RBAC gate mirroring the target endpoint's own guard. */
  allowed: (u: AuthUser) => boolean;
  /** Gemini function declaration (without `name`). */
  decl: { description: string; parameters?: any };
  /** Human confirmation-card summary (Russian; the UI shows raw args too). */
  summary: (args: any) => string;
  /** Execute (reads: inside the loop; writes: only from `execute`). */
  run: (user: AuthUser, event: HandlerEvent, args: any) => Promise<any>;
}

const S = SchemaType;
const kindPerm = (kind: any): 'students' | 'teachers' => (kind === 'teacher' ? 'teachers' : 'students');
const financeRead = (u: AuthUser) => !hasRole(u, 'teacher', 'student') && hasPermission(u, 'finances') && can(u, 'finances', 'read');
const financeWrite = (u: AuthUser) => !hasRole(u, 'teacher', 'student') && hasPermission(u, 'finances') && can(u, 'finances', 'write');

const TOOLS: ToolSpec[] = [
  // ═══ READ ═══
  {
    name: 'list_students',
    kind: 'read',
    allowed: u => can(u, 'students', 'read'),
    decl: {
      description: 'Найти студентов по имени/телефону или показать список. ВСЕГДА вызывай перед действиями над студентами, чтобы получить их id.',
      parameters: {
        type: S.OBJECT,
        properties: {
          query: { type: S.STRING, description: 'Подстрока имени или телефона. Пусто — все студенты.' },
          groupId: { type: S.STRING, description: 'Показать только студентов этой группы (id из list_groups).' },
          branchId: { type: S.STRING, description: 'Фильтр по филиалу (id из list_branches).' },
        },
      },
    },
    summary: () => 'Поиск студентов',
    run: async (_u, event, args) => {
      const params: Record<string, string> = { action: 'students' };
      if (args.branchId) params.branchId = str(args.branchId);
      let rows: any[] = await dispatch(orgHandler, event, 'GET', params);
      if (args.groupId) {
        const g = await dispatch(orgHandler, event, 'GET', { action: 'group', id: str(args.groupId) });
        const inGroup = new Set(g.studentIds || []);
        rows = rows.filter(r => inGroup.has(r.uid));
      }
      rows = rows.filter(r => matches(args.query, r.displayName, r.phone));
      return page(rows.map(r => ({
        id: r.uid, name: r.displayName, phone: r.phone || '', status: r.status || 'active',
      })));
    },
  },
  {
    name: 'list_teachers',
    kind: 'read',
    allowed: u => can(u, 'teachers', 'read'),
    decl: {
      description: 'Список преподавателей центра (или поиск по имени). Вызывай, чтобы получить id преподавателя.',
      parameters: {
        type: S.OBJECT,
        properties: { query: { type: S.STRING, description: 'Подстрока имени. Пусто — все.' } },
      },
    },
    summary: () => 'Поиск преподавателей',
    run: async (_u, event, args) => {
      const rows: any[] = await dispatch(orgHandler, event, 'GET', { action: 'teachers' });
      return page(rows
        .filter(r => matches(args.query, r.displayName, r.phone))
        .map(r => ({ id: r.uid, name: r.displayName, phone: r.phone || '', role: r.role })));
    },
  },
  {
    name: 'list_groups',
    kind: 'read',
    allowed: u => can(u, 'groups', 'read'),
    decl: {
      description: 'Список групп (или поиск по названию/курсу). Вызывай, чтобы получить id группы.',
      parameters: {
        type: S.OBJECT,
        properties: {
          query: { type: S.STRING, description: 'Подстрока названия группы или курса.' },
          courseId: { type: S.STRING, description: 'Только группы этого курса.' },
          branchId: { type: S.STRING, description: 'Только группы этого филиала.' },
        },
      },
    },
    summary: () => 'Поиск групп',
    run: async (_u, event, args) => {
      const params: Record<string, string> = { action: 'groups' };
      if (args.courseId) params.courseId = str(args.courseId);
      if (args.branchId) params.branchId = str(args.branchId);
      const rows: any[] = await dispatch(orgHandler, event, 'GET', params);
      return page(rows
        .filter(r => matches(args.query, r.name, r.courseName))
        .map(r => ({
          id: r.id, name: r.name, courseName: (r.courseName || '').trim(), courseId: r.courseId,
          students: (r.studentIds || []).length, status: r.status || 'active', branchId: r.branchId || null,
        })));
    },
  },
  {
    name: 'get_group',
    kind: 'read',
    allowed: u => can(u, 'groups', 'read'),
    decl: {
      description: 'Полный состав одной группы: студенты (с id) и преподаватели.',
      parameters: {
        type: S.OBJECT,
        properties: { groupId: { type: S.STRING, description: 'Id группы из list_groups.' } },
        required: ['groupId'],
      },
    },
    summary: () => 'Состав группы',
    run: async (_u, event, args) => {
      const g = await dispatch(orgHandler, event, 'GET', { action: 'group', id: str(args.groupId) });
      const ids: string[] = [...(g.studentIds || []), ...(g.teacherIds || [])];
      const profiles = await getDocsByIds('users', ids, ['displayName', 'phone']);
      const nameOf = (id: string) => profiles[id]?.displayName || id;
      return {
        id: g.id, name: g.name, courseName: (g.courseName || '').trim(), courseId: g.courseId,
        status: g.status || 'active', branchId: g.branchId || null,
        teachers: (g.teacherIds || []).map((id: string) => ({ id, name: nameOf(id) })),
        students: (g.studentIds || []).map((id: string) => ({ id, name: nameOf(id), phone: profiles[id]?.phone || '' })),
      };
    },
  },
  {
    name: 'list_courses',
    kind: 'read',
    allowed: u => can(u, 'courses', 'read'),
    decl: {
      description: 'Список курсов центра с ценами. Вызывай, чтобы получить id курса.',
      parameters: {
        type: S.OBJECT,
        properties: { query: { type: S.STRING, description: 'Подстрока названия.' } },
      },
    },
    summary: () => 'Список курсов',
    run: async (_u, event, args) => {
      const rows: any[] = await dispatch(orgHandler, event, 'GET', { action: 'courses' });
      return page(rows
        .filter(r => matches(args.query, r.title, r.subject))
        .map(r => ({
          id: r.id, title: (r.title || '').trim(), price: r.price || 0,
          paymentFormat: r.paymentFormat || 'one-time', status: r.status, branchId: r.branchId || null,
        })));
    },
  },
  {
    name: 'list_branches',
    kind: 'read',
    allowed: u => can(u, 'branches', 'read'),
    decl: { description: 'Список филиалов центра (id и название).' },
    summary: () => 'Список филиалов',
    run: async (_u, event) => {
      const res = await dispatch(branchesHandler, event, 'GET', { action: 'list' });
      const rows: any[] = res.branches || res || [];
      return page(rows.map((b: any) => ({ id: b.id, name: b.name, city: b.city || '' })));
    },
  },
  {
    name: 'get_schedule',
    kind: 'read',
    allowed: u => can(u, 'schedule', 'read'),
    decl: {
      description: 'Расписание занятий за период (по умолчанию — ближайшие 7 дней).',
      parameters: {
        type: S.OBJECT,
        properties: {
          from: { type: S.STRING, description: 'Начало периода YYYY-MM-DD (по умолчанию сегодня).' },
          to: { type: S.STRING, description: 'Конец периода YYYY-MM-DD (по умолчанию +7 дней).' },
          groupId: { type: S.STRING, description: 'Только занятия этой группы.' },
        },
      },
    },
    summary: () => 'Просмотр расписания',
    run: async (_u, event, args) => {
      const today = new Date().toISOString().slice(0, 10);
      const weekAhead = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
      const from = str(args.from) || today;
      const to = str(args.to) || weekAhead;
      const groupParam: Record<string, string> = args.groupId ? { groupId: str(args.groupId) } : {};
      // The api-org date-range branch only returns one-off (dated) events; the
      // recurring weekly grid lives behind mode=timetable. Fetch both and merge
      // so "расписание на сегодня" also includes the weekly lessons.
      const [dated, recurring] = await Promise.all([
        dispatch(orgHandler, event, 'GET', { action: 'schedule', from, to, ...groupParam }),
        dispatch(orgHandler, event, 'GET', { action: 'schedule', mode: 'timetable', ...groupParam }),
      ]);
      const map = (e: any) => ({
        id: e.id, title: e.title, date: e.date || null, dayOfWeek: e.recurring ? e.dayOfWeek : undefined,
        recurring: !!e.recurring,
        time: `${e.startTime || ''}${e.endTime ? '–' + e.endTime : ''}`,
        group: e.groupName || '', teacher: e.teacherName || '', location: e.location || '', type: e.type || 'lesson',
      });
      // Only recurring days that actually fall inside the requested window.
      const daysInWindow = new Set<number>();
      const span = Math.min(7, Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1);
      for (let i = 0; i < Math.max(1, span); i++) {
        const d = new Date(Date.parse(from) + i * 86400_000);
        daysInWindow.add((d.getUTCDay() + 6) % 7); // JS 0=Sun → 0=Mon
      }
      const recurringRows = (recurring as any[]).filter((e: any) => daysInWindow.has(e.dayOfWeek));
      return page([...(dated as any[]), ...recurringRows].map(map));
    },
  },
  {
    name: 'dashboard_stats',
    kind: 'read',
    allowed: u => can(u, 'dashboard', 'read'),
    decl: { description: 'Сводка по центру: количество студентов, преподавателей, курсов, групп, уроков, экзаменов.' },
    summary: () => 'Сводка по центру',
    run: (_u, event) => dispatch(orgHandler, event, 'GET', { action: 'dashboardStats' }),
  },
  {
    name: 'finance_metrics',
    kind: 'read',
    allowed: financeRead,
    decl: {
      description: 'Финансовые показатели: доход, расход, прибыль, активная задолженность.',
      parameters: {
        type: S.OBJECT,
        properties: {
          period: { type: S.STRING, description: 'current_month | last_month | quarter | half_year | year | all. По умолчанию current_month.' },
          branchId: { type: S.STRING, description: 'Фильтр по филиалу.' },
        },
      },
    },
    summary: () => 'Финансовые показатели',
    run: (_u, event, args) => {
      const params: Record<string, string> = { period: str(args.period) || 'current_month' };
      if (args.branchId) params.branchId = str(args.branchId);
      return dispatch(financeMetricsHandler, event, 'GET', params);
    },
  },
  {
    name: 'list_payment_plans',
    kind: 'read',
    allowed: financeRead,
    decl: {
      description: 'Планы оплат студентов; с onlyDebtors=true — список должников (кто и сколько должен).',
      parameters: {
        type: S.OBJECT,
        properties: {
          studentId: { type: S.STRING, description: 'Планы одного студента.' },
          onlyDebtors: { type: S.BOOLEAN, description: 'true — только должники (долг > 0).' },
          branchId: { type: S.STRING, description: 'Фильтр по филиалу.' },
        },
      },
    },
    summary: () => 'Планы оплат / должники',
    run: async (_u, event, args) => {
      const params: Record<string, string> = {};
      if (args.studentId) params.studentId = str(args.studentId);
      if (args.branchId) params.branchId = str(args.branchId);
      const res = await dispatch(financePlansHandler, event, 'GET', params);
      let rows: any[] = res.plans || res || [];
      rows = rows.map((p: any) => ({
        planId: p.id, studentId: p.studentId, student: p.studentName || p.studentId,
        course: (p.courseName || '').trim(), total: p.totalAmount || 0, paid: p.paidAmount || 0,
        debt: Math.max(0, (p.totalAmount || 0) - (p.paidAmount || 0)), status: p.status, deadline: p.deadline || null,
      }));
      if (args.onlyDebtors) rows = rows.filter(r => r.debt > 0 && r.status !== 'cancelled');
      rows.sort((a, b) => b.debt - a.debt);
      return page(rows);
    },
  },

  // ═══ WRITE (two-phase: proposed by the model → confirmed by the user) ═══
  {
    name: 'create_student',
    kind: 'write',
    allowed: u => hasRole(u, 'admin', 'manager') && can(u, 'students', 'write'),
    decl: {
      description: 'Добавить нового студента (запись без логина). Перед добавлением проверь через list_students, нет ли уже такого — чтобы не создать дубль.',
      parameters: {
        type: S.OBJECT,
        properties: {
          displayName: { type: S.STRING, description: 'Фамилия и имя студента.' },
          phone: { type: S.STRING, description: 'Телефон.' },
          enrollmentDate: { type: S.STRING, description: 'Дата зачисления YYYY-MM-DD (по умолчанию сегодня).' },
          groupId: { type: S.STRING, description: 'Сразу зачислить в группу (id из list_groups).' },
          branchId: { type: S.STRING, description: 'Филиал (id из list_branches).' },
        },
        required: ['displayName'],
      },
    },
    summary: a => `Добавить студента «${a.displayName}»${a.phone ? `, тел. ${a.phone}` : ''}`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'createStudent' }, {
      displayName: str(args.displayName).trim(),
      phone: str(args.phone),
      enrollmentDate: str(args.enrollmentDate) || new Date().toISOString().slice(0, 10),
      ...(args.groupId ? { groupId: str(args.groupId) } : {}),
      ...(args.branchId ? { branchIds: [str(args.branchId)], primaryBranchId: str(args.branchId) } : {}),
    }),
  },
  {
    name: 'bulk_create_students',
    kind: 'write',
    allowed: u => hasRole(u, 'admin', 'manager') && can(u, 'students', 'write'),
    decl: {
      description: 'Массово добавить нескольких студентов одной операцией (например, продиктованный список).',
      parameters: {
        type: S.OBJECT,
        properties: {
          students: {
            type: S.ARRAY,
            description: 'Список студентов.',
            items: {
              type: S.OBJECT,
              properties: {
                displayName: { type: S.STRING, description: 'Фамилия и имя.' },
                phone: { type: S.STRING, description: 'Телефон.' },
              },
              required: ['displayName'],
            },
          },
          groupId: { type: S.STRING, description: 'Сразу зачислить всех в группу.' },
          branchId: { type: S.STRING, description: 'Филиал для всех.' },
          enrollmentDate: { type: S.STRING, description: 'Дата зачисления YYYY-MM-DD для всех.' },
        },
        required: ['students'],
      },
    },
    summary: a => `Добавить ${a.students?.length || 0} студентов: ${joinNames((a.students || []).map((s: any) => s.displayName))}`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'bulkCreateStudents' }, {
      students: (args.students || []).map((s: any) => ({ displayName: str(s.displayName).trim(), phone: str(s.phone) })),
      ...(args.groupId ? { groupId: str(args.groupId) } : {}),
      ...(args.branchId ? { branchIds: [str(args.branchId)], primaryBranchId: str(args.branchId) } : {}),
      ...(args.enrollmentDate ? { enrollmentDate: str(args.enrollmentDate) } : {}),
    }),
  },
  {
    name: 'update_student',
    kind: 'write',
    allowed: u => isStaff(u) && can(u, 'students', 'write'),
    decl: {
      description: 'Изменить данные студента: имя, телефон или дату зачисления.',
      parameters: {
        type: S.OBJECT,
        properties: {
          uid: { type: S.STRING, description: 'Id студента из list_students.' },
          displayName: { type: S.STRING, description: 'Новое имя.' },
          phone: { type: S.STRING, description: 'Новый телефон.' },
          enrollmentDate: { type: S.STRING, description: 'Новая дата зачисления YYYY-MM-DD.' },
        },
        required: ['uid'],
      },
    },
    summary: a => `Изменить данные студента (${['displayName', 'phone', 'enrollmentDate'].filter(k => a[k]).join(', ')})`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'updateStudent' }, {
      uid: str(args.uid),
      ...(args.displayName ? { displayName: str(args.displayName).trim() } : {}),
      ...(args.phone !== undefined ? { phone: str(args.phone) } : {}),
      ...(args.enrollmentDate ? { enrollmentDate: str(args.enrollmentDate) } : {}),
    }),
  },
  {
    name: 'create_teacher',
    kind: 'write',
    allowed: u => hasRole(u, 'admin', 'manager') && can(u, 'teachers', 'write'),
    decl: {
      description: 'Добавить нового преподавателя (запись без логина).',
      parameters: {
        type: S.OBJECT,
        properties: {
          displayName: { type: S.STRING, description: 'Фамилия и имя преподавателя.' },
          phone: { type: S.STRING, description: 'Телефон.' },
          branchId: { type: S.STRING, description: 'Филиал.' },
        },
        required: ['displayName'],
      },
    },
    summary: a => `Добавить преподавателя «${a.displayName}»`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'createTeacher' }, {
      displayName: str(args.displayName).trim(),
      phone: str(args.phone),
      ...(args.branchId ? { branchIds: [str(args.branchId)], primaryBranchId: str(args.branchId) } : {}),
    }),
  },
  {
    name: 'delete_members',
    kind: 'write',
    danger: true,
    allowed: u => isStaff(u) && (can(u, 'students', 'delete') || can(u, 'teachers', 'delete')),
    decl: {
      description: 'Безвозвратно удалить студентов или преподавателей из центра (включая массовое удаление). Сначала найди их id через list_students / list_teachers.',
      parameters: {
        type: S.OBJECT,
        properties: {
          kind: { type: S.STRING, description: '"student" или "teacher".' },
          uids: { type: S.ARRAY, description: 'Список id удаляемых.', items: { type: S.STRING } },
          names: { type: S.ARRAY, description: 'Имена удаляемых (для показа пользователю), в том же порядке.', items: { type: S.STRING } },
        },
        required: ['kind', 'uids'],
      },
    },
    summary: a => `УДАЛИТЬ ${a.uids?.length || 0} ${a.kind === 'teacher' ? 'преподавателей' : 'студентов'}: ${joinNames(a.names || a.uids || [])}`,
    run: async (u, event, args) => {
      if (!can(u, kindPerm(args.kind), 'delete')) throw new ToolError(403, 'Недостаточно прав для этого действия');
      return dispatch(orgHandler, event, 'POST', { action: 'bulkDeleteMembers' }, {
        kind: args.kind === 'teacher' ? 'teacher' : 'student',
        uids: (args.uids || []).map(str),
      });
    },
  },
  {
    name: 'move_to_group',
    kind: 'write',
    allowed: u => isStaff(u) && (can(u, 'students', 'write') || can(u, 'teachers', 'write')),
    decl: {
      description: 'Перевести студентов (или преподавателей) в другую группу: они покинут все прочие группы и окажутся в указанной.',
      parameters: {
        type: S.OBJECT,
        properties: {
          kind: { type: S.STRING, description: '"student" (по умолчанию) или "teacher".' },
          uids: { type: S.ARRAY, description: 'Id переводимых.', items: { type: S.STRING } },
          names: { type: S.ARRAY, description: 'Их имена (для показа пользователю).', items: { type: S.STRING } },
          groupId: { type: S.STRING, description: 'Id группы-назначения.' },
          groupName: { type: S.STRING, description: 'Название группы-назначения (для показа пользователю).' },
        },
        required: ['uids', 'groupId'],
      },
    },
    summary: a => `Перевести ${joinNames(a.names || a.uids || [])} в группу «${a.groupName || a.groupId}»`,
    run: async (u, event, args) => {
      if (!can(u, kindPerm(args.kind), 'write')) throw new ToolError(403, 'Недостаточно прав для этого действия');
      return dispatch(orgHandler, event, 'POST', { action: 'bulkSetGroup' }, {
        kind: args.kind === 'teacher' ? 'teacher' : 'student',
        uids: (args.uids || []).map(str),
        groupId: str(args.groupId),
      });
    },
  },
  {
    name: 'move_to_branch',
    kind: 'write',
    allowed: u => isStaff(u) && (can(u, 'students', 'write') || can(u, 'teachers', 'write')),
    decl: {
      description: 'Перевести студентов (или преподавателей) в другой филиал.',
      parameters: {
        type: S.OBJECT,
        properties: {
          kind: { type: S.STRING, description: '"student" (по умолчанию) или "teacher".' },
          uids: { type: S.ARRAY, description: 'Id переводимых.', items: { type: S.STRING } },
          names: { type: S.ARRAY, description: 'Их имена (для показа пользователю).', items: { type: S.STRING } },
          branchId: { type: S.STRING, description: 'Id филиала-назначения из list_branches.' },
          branchName: { type: S.STRING, description: 'Название филиала (для показа пользователю).' },
        },
        required: ['uids', 'branchId'],
      },
    },
    summary: a => `Перевести ${joinNames(a.names || a.uids || [])} в филиал «${a.branchName || a.branchId}»`,
    run: async (u, event, args) => {
      if (!can(u, kindPerm(args.kind), 'write')) throw new ToolError(403, 'Недостаточно прав для этого действия');
      return dispatch(orgHandler, event, 'POST', { action: 'bulkSetBranch' }, {
        kind: args.kind === 'teacher' ? 'teacher' : 'student',
        uids: (args.uids || []).map(str),
        branchId: str(args.branchId),
      });
    },
  },
  {
    name: 'create_group',
    kind: 'write',
    allowed: u => isStaff(u) && can(u, 'groups', 'write'),
    decl: {
      description: 'Создать новую группу на курсе. courseId найди через list_courses; преподавателя — через list_teachers.',
      parameters: {
        type: S.OBJECT,
        properties: {
          name: { type: S.STRING, description: 'Название группы.' },
          courseId: { type: S.STRING, description: 'Id курса.' },
          courseName: { type: S.STRING, description: 'Название курса (для показа пользователю).' },
          teacherIds: { type: S.ARRAY, description: 'Id преподавателей группы.', items: { type: S.STRING } },
          studentIds: { type: S.ARRAY, description: 'Id студентов для зачисления.', items: { type: S.STRING } },
          branchId: { type: S.STRING, description: 'Филиал группы.' },
        },
        required: ['name', 'courseId'],
      },
    },
    summary: a => `Создать группу «${a.name}» на курсе «${(a.courseName || a.courseId || '').trim()}»${a.studentIds?.length ? ` (${a.studentIds.length} студ.)` : ''}`,
    run: async (u, event, args) => {
      // Denormalized courseName like the UI sends — resolve server-side so the
      // model can't mislabel a group. Only trust the title of a course that
      // belongs to the caller's org (never leak a foreign tenant's course name).
      const course = await adminDb.collection('courses').doc(str(args.courseId)).get();
      const ownCourse = course.exists && course.data()!.organizationId === u.organizationId;
      return dispatch(orgHandler, event, 'POST', { action: 'createGroup' }, {
        name: str(args.name).trim(),
        courseId: str(args.courseId),
        courseName: ownCourse ? course.data()!.title || '' : '',
        teacherIds: (args.teacherIds || []).map(str),
        studentIds: (args.studentIds || []).map(str),
        ...(args.branchId ? { branchId: str(args.branchId) } : {}),
      });
    },
  },
  {
    name: 'update_group',
    kind: 'write',
    allowed: u => isStaff(u) && can(u, 'groups', 'write'),
    decl: {
      description: 'Изменить группу: название, состав студентов/преподавателей (передавай ПОЛНЫЙ новый список id), статус или филиал. Для добавления/удаления студента возьми текущий состав через get_group и передай изменённый полный список.',
      parameters: {
        type: S.OBJECT,
        properties: {
          id: { type: S.STRING, description: 'Id группы.' },
          groupName: { type: S.STRING, description: 'Текущее название группы (для показа пользователю).' },
          name: { type: S.STRING, description: 'Новое название.' },
          studentIds: { type: S.ARRAY, description: 'ПОЛНЫЙ новый список id студентов.', items: { type: S.STRING } },
          teacherIds: { type: S.ARRAY, description: 'ПОЛНЫЙ новый список id преподавателей.', items: { type: S.STRING } },
          status: { type: S.STRING, description: 'active | completed | archived.' },
          branchId: { type: S.STRING, description: 'Новый филиал.' },
        },
        required: ['id'],
      },
    },
    summary: a => `Изменить группу «${a.groupName || a.id}» (${['name', 'studentIds', 'teacherIds', 'status', 'branchId'].filter(k => a[k] !== undefined).join(', ')})`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'updateGroup' }, {
      id: str(args.id),
      ...(args.name ? { name: str(args.name).trim() } : {}),
      ...(args.studentIds ? { studentIds: args.studentIds.map(str) } : {}),
      ...(args.teacherIds ? { teacherIds: args.teacherIds.map(str) } : {}),
      ...(args.status ? { status: str(args.status) } : {}),
      ...(args.branchId !== undefined ? { branchId: str(args.branchId) || null } : {}),
    }),
  },
  {
    name: 'delete_group',
    kind: 'write',
    danger: true,
    allowed: u => isStaff(u) && can(u, 'groups', 'delete'),
    decl: {
      description: 'Безвозвратно удалить группу (студенты остаются в центре).',
      parameters: {
        type: S.OBJECT,
        properties: {
          id: { type: S.STRING, description: 'Id группы.' },
          groupName: { type: S.STRING, description: 'Название группы (для показа пользователю).' },
        },
        required: ['id'],
      },
    },
    summary: a => `УДАЛИТЬ группу «${a.groupName || a.id}»`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'deleteGroup' }, { id: str(args.id) }),
  },
  {
    name: 'create_course',
    kind: 'write',
    allowed: u => isStaff(u) && can(u, 'courses', 'write'),
    decl: {
      description: 'Создать новый курс.',
      parameters: {
        type: S.OBJECT,
        properties: {
          title: { type: S.STRING, description: 'Название курса.' },
          price: { type: S.NUMBER, description: 'Цена (0 — бесплатный).' },
          paymentFormat: { type: S.STRING, description: 'one-time — разовая оплата, monthly — помесячная. По умолчанию monthly.' },
          description: { type: S.STRING, description: 'Описание.' },
          subject: { type: S.STRING, description: 'Предмет.' },
          branchId: { type: S.STRING, description: 'Филиал.' },
        },
        required: ['title'],
      },
    },
    summary: a => `Создать курс «${a.title}»${a.price ? `, ${a.price}/${a.paymentFormat === 'one-time' ? 'разово' : 'мес'}` : ''}`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'createCourse' }, {
      title: str(args.title).trim(),
      description: str(args.description),
      subject: str(args.subject),
      price: Number(args.price) || 0,
      paymentFormat: args.paymentFormat === 'one-time' ? 'one-time' : 'monthly',
      status: 'published',
      ...(args.branchId ? { branchId: str(args.branchId) } : {}),
    }),
  },
  {
    name: 'update_course',
    kind: 'write',
    allowed: u => hasRole(u, 'admin', 'manager') && can(u, 'courses', 'write'),
    decl: {
      description: 'Изменить курс: название, цену, формат оплаты, статус.',
      parameters: {
        type: S.OBJECT,
        properties: {
          id: { type: S.STRING, description: 'Id курса.' },
          courseTitle: { type: S.STRING, description: 'Текущее название (для показа пользователю).' },
          title: { type: S.STRING, description: 'Новое название.' },
          price: { type: S.NUMBER, description: 'Новая цена.' },
          paymentFormat: { type: S.STRING, description: 'one-time | monthly.' },
          status: { type: S.STRING, description: 'draft | published | archived.' },
        },
        required: ['id'],
      },
    },
    summary: a => `Изменить курс «${(a.courseTitle || a.id || '').trim()}» (${['title', 'price', 'paymentFormat', 'status'].filter(k => a[k] !== undefined).join(', ')})`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'updateCourse' }, {
      id: str(args.id),
      ...(args.title ? { title: str(args.title).trim() } : {}),
      ...(args.price !== undefined ? { price: Number(args.price) || 0 } : {}),
      ...(args.paymentFormat ? { paymentFormat: str(args.paymentFormat) } : {}),
      ...(args.status ? { status: str(args.status) } : {}),
    }),
  },
  {
    name: 'delete_course',
    kind: 'write',
    danger: true,
    allowed: u => isStaff(u) && can(u, 'courses', 'delete'),
    decl: {
      description: 'Безвозвратно удалить курс.',
      parameters: {
        type: S.OBJECT,
        properties: {
          id: { type: S.STRING, description: 'Id курса.' },
          courseTitle: { type: S.STRING, description: 'Название курса (для показа пользователю).' },
        },
        required: ['id'],
      },
    },
    summary: a => `УДАЛИТЬ курс «${(a.courseTitle || a.id || '').trim()}»`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'deleteCourse' }, { id: str(args.id) }),
  },
  {
    name: 'create_event',
    kind: 'write',
    allowed: u => hasRole(u, 'admin', 'manager') && can(u, 'schedule', 'write'),
    decl: {
      description: 'Добавить занятие в расписание — разовое (date) или еженедельное (recurring + dayOfWeek). Система проверит конфликты преподавателя/группы/кабинета.',
      parameters: {
        type: S.OBJECT,
        properties: {
          title: { type: S.STRING, description: 'Название занятия.' },
          date: { type: S.STRING, description: 'Дата YYYY-MM-DD (для разового).' },
          recurring: { type: S.BOOLEAN, description: 'true — еженедельное.' },
          dayOfWeek: { type: S.NUMBER, description: 'День недели для recurring: 0=Пн … 6=Вс.' },
          startTime: { type: S.STRING, description: 'Начало HH:MM.' },
          endTime: { type: S.STRING, description: 'Конец HH:MM.' },
          groupId: { type: S.STRING, description: 'Id группы.' },
          groupName: { type: S.STRING, description: 'Название группы (для показа пользователю).' },
          teacherId: { type: S.STRING, description: 'Id преподавателя.' },
          teacherName: { type: S.STRING, description: 'Имя преподавателя.' },
          location: { type: S.STRING, description: 'Кабинет/место.' },
          force: { type: S.BOOLEAN, description: 'true — создать несмотря на конфликт (только если пользователь явно попросил).' },
        },
        required: ['title', 'startTime'],
      },
    },
    summary: a => `Занятие «${a.title}» ${a.recurring ? `еженедельно (${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][a.dayOfWeek] || a.dayOfWeek})` : a.date || ''} в ${a.startTime}${a.groupName ? `, группа «${a.groupName}»` : ''}`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'createEvent' }, {
      title: str(args.title).trim(),
      startTime: str(args.startTime),
      ...(args.endTime ? { endTime: str(args.endTime) } : {}),
      ...(args.recurring
        ? { recurring: true, dayOfWeek: Number(args.dayOfWeek) || 0 }
        : { date: str(args.date) || new Date().toISOString().slice(0, 10) }),
      ...(args.groupId ? { groupId: str(args.groupId), groupName: str(args.groupName) } : {}),
      ...(args.teacherId ? { teacherId: str(args.teacherId), teacherName: str(args.teacherName) } : {}),
      ...(args.location ? { location: str(args.location) } : {}),
      ...(args.force ? { force: true } : {}),
    }),
  },
  {
    name: 'delete_event',
    kind: 'write',
    danger: true,
    allowed: u => hasRole(u, 'admin', 'manager') && can(u, 'schedule', 'delete'),
    decl: {
      description: 'Удалить занятие из расписания (id из get_schedule). Группа получит уведомление об отмене.',
      parameters: {
        type: S.OBJECT,
        properties: {
          id: { type: S.STRING, description: 'Id занятия.' },
          eventTitle: { type: S.STRING, description: 'Название занятия (для показа пользователю).' },
        },
        required: ['id'],
      },
    },
    summary: a => `УДАЛИТЬ занятие «${a.eventTitle || a.id}» из расписания`,
    run: (_u, event, args) => dispatch(orgHandler, event, 'POST', { action: 'deleteEvent' }, { id: str(args.id) }),
  },
  {
    name: 'record_payment',
    kind: 'write',
    allowed: financeWrite,
    decl: {
      description: 'Записать оплату от студента (приход). Если у студента есть план оплаты (list_payment_plans), передай planId — оплата погасит долг по нему.',
      parameters: {
        type: S.OBJECT,
        properties: {
          studentId: { type: S.STRING, description: 'Id студента.' },
          studentName: { type: S.STRING, description: 'Имя студента (для показа пользователю).' },
          amount: { type: S.NUMBER, description: 'Сумма оплаты.' },
          planId: { type: S.STRING, description: 'Id плана оплаты из list_payment_plans.' },
          date: { type: S.STRING, description: 'Дата YYYY-MM-DD (по умолчанию сегодня).' },
          description: { type: S.STRING, description: 'Комментарий.' },
          paymentMethod: { type: S.STRING, description: 'cash | card | transfer. По умолчанию cash.' },
        },
        required: ['studentId', 'amount'],
      },
    },
    summary: a => `Оплата ${a.amount} от «${a.studentName || a.studentId}»${a.planId ? ' (в счёт плана)' : ''}`,
    run: (u, event, args) => dispatch(financeTxHandler, event, 'POST', {}, {
      type: 'income',
      amount: Number(args.amount),
      date: str(args.date) || new Date().toISOString().slice(0, 10),
      categoryId: 'course_fee',
      studentId: str(args.studentId),
      ...(args.planId ? { paymentPlanId: str(args.planId) } : {}),
      // Stamp the recorder's branch so branch-scoped finance views (which filter
      // by branchId) still show AI-recorded payments.
      ...(u.primaryBranchId ? { branchId: u.primaryBranchId } : {}),
      description: str(args.description),
      paymentMethod: ['cash', 'card', 'transfer'].includes(args.paymentMethod) ? args.paymentMethod : 'cash',
    }),
  },
];

const REGISTRY = new Map(TOOLS.map(t => [t.name, t]));

// ─────────────────────────────────────────────────────────────────────────────
// The agentic turn
// ─────────────────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = { ru: 'русском', en: 'английском', kg: 'кыргызском' };

function buildSystemInstruction(user: AuthUser, orgName: string, toolNames: string[], lang: string) {
  const today = new Date();
  const dows = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  return [
    `Ты — AI-ассистент администратора учебного центра «${orgName}» на платформе SabakHub.`,
    `С тобой говорит сотрудник: ${user.displayName || 'сотрудник'} (роль: ${user.role}). Сегодня ${today.toISOString().slice(0, 10)}, ${dows[today.getDay()]}.`,
    '',
    'Правила работы:',
    '1. Прежде чем выполнять действие над людьми/группами/курсами — ВСЕГДА найди их через инструменты чтения (list_students, list_groups, list_courses…) и используй настоящие id. НИКОГДА не выдумывай id.',
    '2. Действия-изменения не выполняются сразу: интерфейс покажет пользователю карточку подтверждения. Поэтому НЕ спрашивай «вы уверены?» — просто вызывай инструмент. В аргументы *Name/*Title передавай реальные названия — их увидит пользователь.',
    '3. Если найдено несколько подходящих людей (тёзки) — уточни у пользователя, кого он имел в виду, показав варианты с телефонами.',
    '4. Если данных недостаточно (нет обязательного поля) — задай короткий уточняющий вопрос.',
    '5. Если инструмент вернул ошибку или пустой результат — честно скажи об этом.',
    `6. Отвечай кратко и по делу, на ${LANG_NAMES[lang] || LANG_NAMES.ru} языке. Для списков используй маркированные строки, важное выделяй **жирным**. Не используй таблицы и заголовки.`,
    '7. Ты работаешь только с данными этого центра. На посторонние темы отвечай, что ты ассистент центра.',
    '',
    `Доступные тебе инструменты (по правам пользователя): ${toolNames.join(', ')}.`,
    'Если пользователь просит то, на что у него нет прав (нет соответствующего инструмента) — скажи, что у него нет прав на это действие.',
  ].join('\n');
}

/** Client history → SDK contents, guaranteed to start with a user turn. */
function toContents(history: Array<{ role: string; content: string }>): any[] {
  const contents = (history || [])
    .slice(-MAX_HISTORY)
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content).slice(0, 8000) }] }));
  while (contents.length && contents[0].role === 'model') contents.shift();
  return contents;
}

async function runChatTurn(user: AuthUser, event: HandlerEvent, body: any) {
  const lang = ['ru', 'en', 'kg'].includes(body.lang) ? body.lang : 'ru';
  const orgDoc = await adminDb.collection('organizations').doc(user.organizationId!).get();
  const orgName = orgDoc.data()?.name || 'учебный центр';

  const available = TOOLS.filter(t => t.allowed(user));
  const decls = available.map(t => ({ name: t.name, ...t.decl }));
  const systemInstruction = buildSystemInstruction(user, orgName, available.map(t => t.name), lang);

  const contents = toContents(body.messages);
  if (!contents.length) return badRequest('messages required');

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const result = await generateWithFallback(
      { systemInstruction, ...(decls.length ? { tools: [{ functionDeclarations: decls }] } : {}) },
      { contents },
    );
    const resp = result.response;
    // Both accessors throw (GoogleGenerativeAIResponseError) when the candidate
    // has a bad finish reason (SAFETY/RECITATION/LANGUAGE) or the prompt was
    // blocked — so guard them and degrade gracefully instead of 500-ing.
    let calls: Array<{ name: string; args: any }> = [];
    let text = '';
    try { calls = resp.functionCalls?.() || []; } catch { calls = []; }
    try { text = resp.text() || ''; } catch { /* function-call-only or blocked */ }

    if (!calls.length) {
      recordAiUsage(user.organizationId, 'assistant');
      return ok({ reply: text || 'Не удалось сформировать ответ — попробуйте переформулировать.' });
    }

    const writes = calls.filter(c => REGISTRY.get(c.name)?.kind === 'write');
    const reads = calls.filter(c => REGISTRY.get(c.name)?.kind === 'read');

    // Write-only batch → stop the loop and hand it to the user to confirm.
    // (A batch that MIXES reads and writes falls through: we run the reads and
    // ask the model to re-issue the writes with resolved args, so a write never
    // gets confirmed on data it hasn't actually looked up yet.)
    if (writes.length && !reads.length) {
      recordAiUsage(user.organizationId, 'assistant');
      const actions = writes
        .filter(c => REGISTRY.get(c.name)!.allowed(user))
        .map(c => {
          const spec = REGISTRY.get(c.name)!;
          return { tool: c.name, args: c.args || {}, summary: spec.summary(c.args || {}), danger: !!spec.danger };
        });
      if (!actions.length) return ok({ reply: 'У вас нет прав на это действие.' });
      return ok({ reply: text, actions });
    }

    // Execute reads, feed results back, continue the loop. Every functionCall in
    // the model turn needs a matching functionResponse, so writes in a mixed
    // batch get a "re-issue after reviewing the reads" note rather than running.
    contents.push({ role: 'model', parts: calls.map(c => ({ functionCall: { name: c.name, args: c.args || {} } })) });
    const parts: any[] = [];
    for (const c of calls) {
      const spec = REGISTRY.get(c.name);
      let payload: any;
      if (spec && spec.kind === 'write') {
        payload = { note: 'Действие не выполнено: сначала изучи результаты чтения выше, затем вызови это действие ещё раз — интерфейс покажет пользователю подтверждение.' };
      } else if (!spec || spec.kind !== 'read' || !spec.allowed(user)) {
        payload = { error: 'Инструмент недоступен' };
      } else {
        try {
          payload = await spec.run(user, event, c.args || {});
        } catch (e: any) {
          payload = { error: e?.message || 'Ошибка выполнения' };
        }
      }
      parts.push({ functionResponse: { name: c.name, response: { result: payload } } });
    }
    contents.push({ role: 'function', parts });
  }

  recordAiUsage(user.organizationId, 'assistant');
  return ok({ reply: 'Запрос оказался слишком объёмным — уточните, что именно нужно.' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const user = await verifyAuth(event);
    if (!user) return unauthorized();
    // Staff only — students/parents never get the admin copilot.
    if (!isStaff(user)) return forbidden();
    if (!user.organizationId) return badRequest('Нет активной организации');

    let body: any = {};
    try { body = JSON.parse(event.body || '{}'); } catch { /* GET */ }
    const action = event.queryStringParameters?.action || body.action;

    if (action === 'capabilities') {
      return ok({
        tools: TOOLS.filter(t => t.allowed(user)).map(t => ({ name: t.name, kind: t.kind, danger: !!t.danger })),
        aiEnabled: aiAllowed(user),
      });
    }

    // Plan gate + strict AI rate limit for the model-facing actions.
    if (!aiAllowed(user)) return jsonResponse(403, { error: 'AI-ассистент доступен на тарифах Professional и Enterprise.', code: 'plan' });
    if (!hasGeminiKey()) return jsonResponse(500, { error: 'AI временно недоступен' });

    if (action === 'chat') {
      if (rateLimiters.ai.isLimited(getRateLimitKey(event, user.uid))) {
        return jsonResponse(429, { error: 'Слишком много запросов — подождите минуту.' });
      }
      return await runChatTurn(user, event, body);
    }

    if (action === 'execute') {
      const spec = REGISTRY.get(String(body.tool || ''));
      if (!spec || spec.kind !== 'write') return badRequest('Неизвестное действие');
      if (!spec.allowed(user)) return forbidden('Недостаточно прав для этого действия');
      try {
        const result = await spec.run(user, event, body.args || {});
        recordAiUsage(user.organizationId, 'assistant_action');
        return ok({ success: true, result });
      } catch (e: any) {
        if (e instanceof ToolError) {
          // Schedule conflicts (409) come back with details — let the user decide.
          return ok({ success: false, message: e.message, conflicts: e.payload?.conflicts });
        }
        throw e;
      }
    }

    return badRequest('Unknown action');
  } catch (e: any) {
    console.error('api-ai-assistant error:', e);
    return jsonResponse(500, { error: e.message || 'Internal server error' });
  }
};

export { handler };
