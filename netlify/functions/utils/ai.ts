/**
 * Shared helpers for the AI (Gemini) Netlify functions:
 * model factory, resilient JSON parsing, plan-access guard, and a
 * fire-and-forget per-org usage meter so owners can see AI consumption.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import type { AuthUser } from './auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/** Default model used across all AI features. */
export const AI_MODEL = 'gemini-2.5-flash';

/**
 * Secondary model, tried automatically when the primary one errors — most
 * importantly a retired-model 404 (e.g. when Google sunsets a `-flash` revision).
 * Overridable via env so we can re-point it without a redeploy.
 */
export const AI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash-lite';

export function hasGeminiKey(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Build a Gemini model. Pass `json: true` to force a JSON response, or
 * `tools` / `systemInstruction` to enable agentic function-calling (used by the
 * Telegram staff copilot). All options are optional and back-compatible.
 */
export function getModel(opts?: { json?: boolean; model?: string; tools?: any[]; systemInstruction?: string }) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: opts?.model || AI_MODEL,
    ...(opts?.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
    ...(opts?.tools ? { tools: opts.tools } : {}),
    generationConfig: opts?.json ? { responseMimeType: 'application/json' } : {},
  });
}

/**
 * Generate content with automatic model fallback. Tries the primary model
 * (`opts.model` or `AI_MODEL`) first; if that call throws — typically a
 * retired-model 404 or a transient 429 — it retries ONCE on `AI_FALLBACK_MODEL`
 * so the feature self-heals instead of hard-failing. Returns the SDK
 * `GenerateContentResult`, so callers keep full access to
 * `.response.text()` / `.response.functionCalls()` / `.response.candidates`.
 */
export async function generateWithFallback(
  opts: { json?: boolean; model?: string; tools?: any[]; systemInstruction?: string } | undefined,
  request: any,
): Promise<any> {
  try {
    return await getModel(opts).generateContent(request);
  } catch (primaryErr) {
    // Already running on the fallback model — nothing left to try.
    if ((opts?.model || AI_MODEL) === AI_FALLBACK_MODEL) throw primaryErr;
    console.warn(
      `[ai] primary model failed, retrying on ${AI_FALLBACK_MODEL}:`,
      (primaryErr as any)?.message || primaryErr,
    );
    return await getModel({ ...(opts || {}), model: AI_FALLBACK_MODEL }).generateContent(request);
  }
}

/** Tolerant JSON parse — strips ```json fences and surrounding prose. */
export function parseJsonLoose<T = any>(raw: string): T {
  let s = (raw || '').trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    const match = s.match(/[{[][\s\S]*[}\]]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error('AI returned invalid JSON');
  }
}

/** AI features require an AI-enabled plan (Professional or Enterprise). */
export function aiAllowed(user: AuthUser): boolean {
  return user.role === 'super_admin' || user.aiEnabled === true;
}

/**
 * Fire-and-forget per-org usage meter. Aggregates monthly counts per feature
 * into organizations/{orgId}/aiUsage/{YYYY-MM}. Never blocks the AI response.
 */
export function recordAiUsage(orgId: string | null | undefined, feature: string): void {
  if (!orgId) return;
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  adminDb
    .collection('organizations').doc(orgId)
    .collection('aiUsage').doc(period)
    .set(
      {
        period,
        total: FieldValue.increment(1),
        features: { [feature]: FieldValue.increment(1) },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
    .catch(() => {});
}
