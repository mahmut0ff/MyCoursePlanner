import type { Handler, HandlerEvent } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyAuth, isStaff, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!isStaff(user) && user.role !== 'teacher') return forbidden('Only staff and teachers can use AI tools');

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
    const { prompt, type = 'quiz', fileUrl } = body;

    if (!prompt && !fileUrl) {
      return badRequest('Either prompt or fileUrl is required');
    }

    // Dynamically query available models to prevent 404s if gemini-1.5-flash is deprecated/unavailable
    let selectedModel = 'gemini-1.5-flash';
    try {
      const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        if (modelsData && modelsData.models) {
          const supportedModels = modelsData.models.filter((m: any) => 
            m.supportedGenerationMethods?.includes('generateContent')
          );
          const flashModels = supportedModels.filter((m: any) => m.name.includes('flash'));
          
          if (flashModels.length > 0) {
            // Pick the last flash model (often the newest, or we just grab the first valid one)
            selectedModel = flashModels[flashModels.length - 1].name.replace('models/', '');
          } else if (supportedModels.length > 0) {
            // Fallback to any supported model
            selectedModel = supportedModels[supportedModels.length - 1].name.replace('models/', '');
          }
        }
      }
    } catch (e) {
      console.warn('Failed to dynamically fetch models, falling back to gemini-1.5-flash', e);
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: selectedModel,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const parts: any[] = [];

    // System instruction injected into the prompt based on the type
    let systemPrompt = '';
    if (type === 'quiz') {
      systemPrompt = `You are an expert educator. Generate a quiz based on the provided material or prompt. 
Format the response strictly as a JSON array of objects. 
Each question object MUST have:
- "type": string (MUST be one of: "multiple_choice", "multi_select", "true_false", "short_answer", "speaking")
  - "multiple_choice" = single correct answer (radio buttons)
  - "multi_select" = multiple correct answers (checkboxes)
  - "true_false" = True/False question
  - "short_answer" = free text answer
  - "speaking" = oral/audio response
- "question": string (the question text)
- "options": array of strings (required for multiple_choice, multi_select). For "true_false", use ["True", "False"]. Omit for "short_answer" and "speaking".
- "correctOptionIndices": array of integers — indices of the correct options (required for multiple_choice, multi_select, true_false). For multiple_choice, array has exactly 1 element. For multi_select, array can have multiple. Omit for short_answer and speaking.
- "keywords": array of strings (only for short_answer — words/phrases used to grade the answer)
- "explanation": string (brief explanation of the answer)

You must randomly mix and combine the given question types to make the quiz varied and engaging!
Do not include any extra text, only the JSON array. Make the questions engaging and accurate.`;
    } else if (type === 'lesson_and_quiz') {
      systemPrompt = `You are an expert educator. Based on the provided prompt or material, generate BOTH a comprehensive lesson module and a multiple-choice quiz (Kahoot style) covering that exact material.
Format the response strictly as a JSON object containing two keys: "lesson" and "quiz".
Requirements for "lesson":
- "title": string (the topic name)
- "subject": string (short category like History, Programming, etc.)
- "duration": integer (estimated reading minutes, 5 to 15)
- "blocks": array of objects representing the lesson content. Each object must have a "type" ("heading", "paragraph", or "bulletList").
   - If "heading", include "content" (string) and "level" (integer 1 or 2).
   - If "paragraph", include "content" (string).
   - If "bulletList", include "items" (array of strings).
Requirements for "quiz":
- An array of exactly 10 question objects. Each object MUST have:
  - "type": string (MUST be one of: "multiple_choice", "multi_select", "true_false", "short_answer", "speaking")
    - "multiple_choice" = single correct answer (radio buttons)
    - "multi_select" = multiple correct answers (checkboxes)
    - "true_false" = True/False question
    - "short_answer" = free text answer
    - "speaking" = oral/audio response
  - "question": string (engaging question)
  - "options": array of strings (required for multiple_choice, multi_select). For "true_false", use ["True", "False"]. Omit for short_answer and speaking.
  - "correctOptionIndices": array of integers — indices of the correct options (required for multiple_choice, multi_select, true_false). Omit for short_answer and speaking.
  - "keywords": array of strings (only for short_answer)
  - "explanation": string (brief explanation)
You must randomly mix and combine the given question types to make the quiz varied and engaging!
Do not include any extra text, markdown blocks like \`\`\`json, or anything other than the raw JSON object.`;
    } else if (type === 'material_summary') {
      systemPrompt = `You are a helpful education AI assistant. Analyze the provided material/document.
Extract key metadata to categorize it within an educational Learning Management System.
Format the response strictly as a JSON object containing:
- "title": string (a short, clear title for the material, max 60 chars)
- "description": string (a concise 1-3 sentence description of the content)
- "tags": array of strings (1 to 5 relevant tags, e.g. "Math", "Syllabus", "Guide")
- "suggestedCategory": string (a single broad category like "Documents", "Media", "Lectures", or specific subject)
Do not include any extra text, markdown blocks like \`\`\`json, or anything other than the raw JSON object.`;
    } else {
      systemPrompt = `You are an expert educator. Generate an exam based on the provided material or prompt. 
Format the response strictly as a JSON array of objects. 
Each question object MUST have:
- "type": string (MUST be one of: "multiple_choice", "multi_select", "true_false", "short_answer", "speaking")
  - "multiple_choice" = single correct answer (radio buttons)
  - "multi_select" = multiple correct answers (checkboxes)
  - "true_false" = True/False question
  - "short_answer" = free text answer
  - "speaking" = oral/audio response
- "question": string (the test question text)
- "options": array of strings (required for multiple_choice, multi_select). For "true_false", use ["True", "False"]. Omit for short_answer and speaking.
- "correctOptionIndices": array of integers — indices of the correct options (required for multiple_choice, multi_select, true_false). For multiple_choice, exactly 1 element. For multi_select, can have multiple. Omit for short_answer and speaking.
- "keywords": array of strings (only for short_answer — words/phrases used to grade the answer)
- "points": integer (suggested weight/points for this question, usually 1 to 5 depending on difficulty)
- "explanation": string (brief explanation)

You must randomly mix and combine the given question types to make the exam varied and engaging!
Do not include any extra text, only the JSON array.`;
    }

    parts.push({ text: systemPrompt });

    if (prompt) {
      parts.push({ text: `User Request: ${prompt}` });
    }

    // Process file if provided (e.g., PDF or Image from Firebase Storage)
    if (fileUrl) {
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = response.headers.get('content-type') || 'application/pdf';

        parts.push({
          inlineData: {
            data: buffer.toString('base64'),
            mimeType,
          },
        });
        parts.push({ text: 'Please analyze the attached document/image.' });
      } catch (fileErr: any) {
        console.error('File parsing error in AI API:', fileErr);
        return badRequest(`Failed to process the attached file: ${fileErr.message}`);
      }
    }

    // Call Gemini
    const result = await model.generateContent(parts);
    const textResp = result.response.text();

    try {
      const generatedData = JSON.parse(textResp);
      return ok({ data: generatedData });
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON output:', textResp);
      return jsonResponse(500, { error: 'AI returned invalid format', rawOutput: textResp });
    }

  } catch (err: any) {
    console.error('AI Generator API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
