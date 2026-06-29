/**
 * Shared lesson-context helpers for the AI features (RAG-lite over the org's own
 * published lessons). Extracted from api-ai-tutor.ts so the web tutor and the
 * Telegram student copilot build the SAME grounding context — one source of truth.
 */
import { adminDb } from './firebase-admin';

/** Flatten a lesson's content blocks into a short plain-text snippet. */
export function lessonText(data: any, maxChars = 600): string {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const parts: string[] = [];
  for (const b of blocks) {
    if (b?.content) parts.push(String(b.content));
    if (Array.isArray(b?.items)) parts.push(b.items.join('; '));
    if (parts.join(' ').length > maxChars) break;
  }
  return parts.join(' ').slice(0, maxChars);
}

/** Build a compact RAG context from the org's published lessons (bounded). */
export async function buildLessonContext(orgId: string, limit = 30): Promise<string> {
  const snap = await adminDb.collection('lessons')
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
