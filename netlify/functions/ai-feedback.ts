/**
 * AI Feedback Netlify Function
 * Generates diagnostic feedback for exam attempts using Gemini.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { attemptId } = JSON.parse(event.body || '{}');
    if (!attemptId) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'attemptId required' }) };
    }

    const attemptDoc = await adminDb.collection('examAttempts').doc(attemptId).get();
    if (!attemptDoc.exists) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Attempt not found' }) };
    }

    const attempt = attemptDoc.data()!;
    const questionResults = attempt.questionResults || [];
    const incorrect = questionResults.filter((r: any) => !r.isCorrect);
    const correct = questionResults.filter((r: any) => r.isCorrect);

    const prompt = `You are an educational feedback assistant. A student just completed an exam called "${attempt.examTitle}".

Student scored ${attempt.percentage}% (${attempt.score}/${attempt.totalPoints} points). ${attempt.passed ? 'They passed.' : 'They did not pass.'}

Correct answers (${correct.length}):
${correct.map((r: any) => `- ${r.questionText}`).join('\n') || 'None'}

Incorrect answers (${incorrect.length}):
${incorrect.map((r: any) => `- Question: ${r.questionText}\n  Student answered: ${Array.isArray(r.studentAnswer) ? r.studentAnswer.join(', ') : r.studentAnswer}\n  Correct answer: ${Array.isArray(r.correctAnswer) ? r.correctAnswer.join(', ') : r.correctAnswer}`).join('\n') || 'None'}

Provide a JSON response with EXACTLY this structure (no markdown, no code blocks, just valid JSON):
{
  "strengths": ["strength 1", "strength 2"],
  "weakTopics": ["weak topic 1", "weak topic 2"],
  "reviewSuggestions": ["suggestion 1", "suggestion 2"],
  "summary": "A brief 2-3 sentence summary."
}

Keep feedback constructive, specific, and encouraging.`;

    const raw = await generateWithGemini(prompt);

    let feedback;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      feedback = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      feedback = {
        strengths: ['Completed the exam'],
        weakTopics: ['Review the questions you missed'],
        reviewSuggestions: ['Go over your incorrect answers'],
        summary: raw.substring(0, 500),
      };
    }

    feedback.generatedAt = new Date().toISOString();
    await adminDb.collection('examAttempts').doc(attemptId).update({ aiFeedback: feedback });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, feedback }) };
  } catch (error: any) {
    console.error('AI Feedback error:', error);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Failed to generate feedback', message: error.message }) };
  }
};

export { handler };
