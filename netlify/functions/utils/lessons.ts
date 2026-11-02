/**
 * Shared lesson helpers: where lessons live, and the lesson context for the AI
 * features (RAG-lite over the org's own published lessons). The context builder
 * was extracted from api-ai-tutor.ts so the web tutor and the Telegram student
 * copilot build the SAME grounding context — one source of truth.
 */
import { adminDb } from './firebase-admin';

/**
 * The Firestore collection lessons are stored in — `lessonPlans`, since the MVP:
 * it is what api-lessons writes and what firestore.rules protects. There is no
 * `lessons` collection. Readers that guessed that name got an empty result and
 * no error: the Telegram homework hand-in (/dz) never listed a single task, AI
 * grading never saw the assignment, the tutor had no lesson context, and every
 * transfer approval answered "lesson not found". Read and write lessons through
 * this constant, never through a string literal.
 */
export const LESSONS_COLLECTION = 'lessonPlans';

/** Strip the tags and decode the basic entities — enough to read the text of an HTML string. */
function htmlToText(html: string): string {
  return html
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Flatten a lesson's content into a short plain-text snippet.
 *
 * `content` has no single shape — it depends on who wrote the lesson:
 *   • the lesson editor saves TipTap (ProseMirror) JSON, `{ type: 'doc', content: [...] }` — since the MVP;
 *   • the AI lesson factory saves an HTML string, until the lesson is next saved in the editor;
 *   • the seed script saves plain text.
 * This used to read only the `LessonContentBlock[]` array the type declares, which no writer
 * produces — so every real lesson came out empty. The array is still understood.
 */
export function lessonText(data: any, maxChars = 600): string {
  let out = '';
  const walk = (node: any): void => {
    if (node == null || out.length > maxChars) return;
    if (typeof node === 'string') { out += ` ${htmlToText(node)} `; return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;
    // A ProseMirror text node is inline: no separator, or a word split by a mark would break apart.
    if (node.type === 'text') { out += String(node.text ?? ''); return; }
    walk(node.content); // ProseMirror children, or a legacy block's own text
    if (Array.isArray(node.items)) out += ` ${node.items.join('; ')} `;
    out += ' '; // block boundary
  };
  walk(data?.content);
  return out.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

/**
 * Build a compact RAG context from the org's published lessons (bounded).
 * Equality filters only: Firestore serves those by merging single-field indexes,
 * so the query needs no composite index (none are deployed in this project).
 */
export async function buildLessonContext(orgId: string, limit = 30): Promise<string> {
  const snap = await adminDb.collection(LESSONS_COLLECTION)
    .where('organizationId', '==', orgId)
    .where('status', '==', 'published')
    .limit(limit)
    .get()
    .catch(() => null);
  if (!snap || snap.empty) return '';
  let total = 0;
  const out: string[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const snippet = lessonText(data);
    const entry = `• ${data.title || 'Урок'}${data.subject ? ` (${data.subject})` : ''}: ${snippet}`;
    if (total + entry.length > 12000) break;
    total += entry.length;
    out.push(entry);
  }
  return out.join('\n');
}
