/**
 * Уроки лежат в `lessonPlans` — с MVP; коллекции `lessons` не существует.
 *
 * Шесть мест в функциях читали `lessons` и получали пустоту без единой ошибки:
 * бот с 19.08.2026 не показал по /dz ни одного задания, ИИ-проверка не видела
 * условия ДЗ, тьютор — уроков, а одобрение переноса отвечало «урок не найден».
 * Тесты проходили, потому что заглушки отвечали на то же неверное имя.
 *
 * Здесь закреплено: имя коллекции; что ни одна функция не обращается к
 * `lessons`; что контекст тьютора понимает содержимое урока в том виде, в каком
 * его на самом деле пишут редактор, ИИ-фабрика и сиды.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

vi.mock('../utils/firebase-admin', () => ({ adminDb: { collection: vi.fn() } }));

import { adminDb } from '../utils/firebase-admin';
import { LESSONS_COLLECTION, lessonText, buildLessonContext } from '../utils/lessons';

const FUNCTIONS_DIR = path.resolve(__dirname, '..');

/** Исходники функций — без тестов: заглушки вправе называть что угодно. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.[cm]?[jt]s$/.test(entry.name) ? [full] : [];
  });
}

/** Обращение к коллекции по старому имени — прямое или через константу-строку. */
const LEGACY_COLLECTION =
  /(?:collection|collectionGroup|orgQuery|getDocsByIds)\(\s*['"`]lessons['"`]|(?:const|let|var)\s+\w+\s*=\s*['"`]lessons['"`]/;

describe('lessons collection name', () => {
  it('is lessonPlans — the collection api-lessons writes and firestore.rules protects', () => {
    expect(LESSONS_COLLECTION).toBe('lessonPlans');
    expect(readFileSync(path.resolve(FUNCTIONS_DIR, '../../firestore.rules'), 'utf8')).toMatch(/match \/lessonPlans\/\{/);
  });

  it('no function reads or writes a `lessons` collection', () => {
    const files = sourceFiles(FUNCTIONS_DIR);
    expect(files.length).toBeGreaterThan(20); // the scan really walked the functions tree

    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
        LEGACY_COLLECTION.test(line) ? [`${path.relative(FUNCTIONS_DIR, file)}:${i + 1}: ${line.trim()}`] : [],
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('lessonText — every shape lessonPlans.content comes in', () => {
  it('reads the TipTap JSON the lesson editor saves, keeping words split by marks whole', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Квадратные уравнения' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Дискрими' },
            { type: 'text', text: 'нант', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' решает всё.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'D > 0 — два корня' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'D = 0 — один' }] }] },
          ],
        },
        { type: 'image', attrs: { src: 'https://example.com/parabola.png' } },
      ],
    };
    expect(lessonText({ content })).toBe('Квадратные уравнения Дискриминант решает всё. D > 0 — два корня D = 0 — один');
  });

  it('reads the HTML string the AI lesson factory saves', () => {
    const content = '<h2>Present Perfect</h2><p>have &amp; has + V3</p><ul><li><p>since / for</p></li></ul>'
      + '<hr><p><a href="/quiz/q1/play">👉 <strong>Начать тест</strong></a></p>';
    expect(lessonText({ content })).toBe('Present Perfect have & has + V3 since / for 👉 Начать тест');
  });

  it('reads plain text as is, without eating a bare "<"', () => {
    expect(lessonText({ content: 'Если x < 5 и y > 3, то…' })).toBe('Если x < 5 и y > 3, то…');
  });

  it('still reads the legacy LessonContentBlock array', () => {
    const content = [
      { id: 'b1', type: 'heading', content: 'Past Simple' },
      { id: 'b2', type: 'bulletList', content: '', items: ['V2', 'did + V1'] },
    ];
    expect(lessonText({ content })).toBe('Past Simple V2; did + V1');
  });

  it('caps the snippet and survives a lesson with no content', () => {
    expect(lessonText({ content: 'а'.repeat(5000) }, 50)).toHaveLength(50);
    expect(lessonText({})).toBe('');
    expect(lessonText(null)).toBe('');
  });
});

describe('buildLessonContext — grounding for the AI tutor', () => {
  let queried: Array<{ col: string; where: any[][] }>;

  /** Запрос обязан отобрать строки своими where-клаузами, как в api-payroll.test.ts. */
  function stubLessons(rows: any[]) {
    queried = [];
    const query = (col: string, where: any[][], limit = Infinity): any => ({
      where: (...clause: any[]) => query(col, [...where, clause], limit),
      limit: (n: number) => query(col, where, n),
      get: async () => {
        queried.push({ col, where });
        const docs = (col === 'lessonPlans' ? rows : [])
          .filter((r) => where.every(([field, op, value]) => op === '==' && (r[field] ?? null) === value))
          .slice(0, limit)
          .map((r) => ({ id: r.id, data: () => r }));
        return { empty: docs.length === 0, docs };
      },
    });
    (adminDb.collection as any).mockImplementation((col: string) => query(col, []));
  }

  beforeEach(() => vi.clearAllMocks());

  it('feeds the org’s published lessons, with their text, to the tutor', async () => {
    stubLessons([
      {
        id: 'l1', organizationId: 'org-1', status: 'published', title: 'Квадратные уравнения', subject: 'Алгебра',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Дискриминант D = b² − 4ac.' }] }] },
      },
      { id: 'l2', organizationId: 'org-1', status: 'draft', title: 'Черновик', subject: 'Алгебра', content: 'скрыто' },
      { id: 'l3', organizationId: 'org-2', status: 'published', title: 'Чужой урок', subject: 'Химия', content: 'чужое' },
    ]);

    const context = await buildLessonContext('org-1');

    expect(context).toBe('• Квадратные уравнения (Алгебра): Дискриминант D = b² − 4ac.');
    expect(queried).toEqual([{
      col: 'lessonPlans',
      where: [['organizationId', '==', 'org-1'], ['status', '==', 'published']],
    }]);
  });

  it('is empty when the org has no published lessons', async () => {
    stubLessons([{ id: 'l2', organizationId: 'org-1', status: 'draft', title: 'Черновик', content: 'x' }]);
    expect(await buildLessonContext('org-1')).toBe('');
  });
});
