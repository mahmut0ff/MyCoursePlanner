import type { Handler, HandlerEvent } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyAuth, isStaff, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!isStaff(user) && user.role !== 'teacher') return forbidden('Only staff and teachers can use AI grade dictation');

  // Rate limit: 10 AI requests per minute per user
  const rlKey = getRateLimitKey(event, user.uid);
  if (rateLimiters.ai.isLimited(rlKey)) {
    return jsonResponse(429, { error: 'Too many requests. Please wait a moment.' });
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  if (!GEMINI_API_KEY) {
    return jsonResponse(500, { error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { audioBase64, mimeType = 'audio/webm', students, schema } = body;

    if (!audioBase64 || !students || !Array.isArray(students)) {
      return badRequest('Missing required fields: audioBase64, students');
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Use flash model, it optimally handles audio natively
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const systemPrompt = `You are a strict JSON structure generator for a Gradebook system. 
You will receive an audio recording of a teacher dictating grades for students. 
You are also provided with a list of valid students and the grading schema.

CONTEXT:
Students Array: ${JSON.stringify(students)}
Grading Schema: ${JSON.stringify(schema)}

YOUR TASKS:
1. Listen to the audio. The teacher may speak in any language (Russian, English, Uzbek, Kazakh, etc.) and may mix languages.
2. Extract the names of the students mentioned and the grades they received.
3. Match the spoken names to the "id" of the students in the provided Students Array. Use fuzzy phonetic matching (e.g., if you hear "Alesha" or "Alisher", match it to the student named "Alisher" and use their "id").
4. If the teacher says something like "Give everyone a 5" or "All others get 4", apply that logic to all students in the array (unless specific exceptions were mentioned).
5. Output MUST be ONLY a JSON array of objects representing the extracted grades. 
Each object must have the following keys:
- "studentId": The string ID of the matched student (from the Students Array).
- "value": A number or null representing the grade. Ensure it fits the Grading Schema.
- "comment": (Optional) A brief string if the teacher added a comment for that student.

Do NOT include any students who were not assigned a grade.
Do NOT output any markdown, only raw JSON array format.`;

    const parts: any[] = [
      { text: systemPrompt },
      {
        inlineData: {
          data: audioBase64.split(',')[1] || audioBase64, // handle data URI prefix if present
          mimeType: mimeType,
        },
      },
      { text: 'Please transcribe the audio and return the JSON array of grades.' }
    ];

    const result = await model.generateContent(parts);
    const textResp = result.response.text();

    try {
      const generatedGrades = JSON.parse(textResp);
      return ok({ data: generatedGrades });
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON output:', textResp);
      return jsonResponse(500, { error: 'AI returned invalid format', rawOutput: textResp });
    }

  } catch (err: any) {
    console.error('AI Grade Dictator API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
