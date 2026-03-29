import type { Handler, HandlerEvent } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyAuth, isStaff, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!isStaff(user) && user.role !== 'teacher') return forbidden('Only staff and teachers can use AI tools');

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
- "type": string (MUST be one of: "single_choice", "multiple_choice", "true_false", "matching", "image_question")
- "question": string (the question text)
- "options": array of strings (the possible answers). For "true_false", use ["True", "False"]. For "matching", use strings formatted as "ItemA = ItemB".
- "correctOptionIndices": array of integers (indices of correct answers in the options array. For "matching", all indices are technically correct answers since the student matches them. For "single_choice" or "true_false" use a single index).
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
  - "type": string (MUST be one of: "single_choice", "multiple_choice", "true_false", "matching", "image_question")
  - "question": string (engaging question)
  - "options": array of strings (the possible answers). For "true_false", use ["True", "False"]. For "matching", use format "A = B".
  - "correctOptionIndices": array of integers (indices of correct answers).
  - "explanation": string (brief explanation)
You must randomly mix and combine the given question types to make the quiz varied and engaging!
Do not include any extra text, markdown blocks like \`\`\`json, or anything other than the raw JSON object.`;
    } else {
      systemPrompt = `You are an expert educator. Generate an exam based on the provided material or prompt. 
Format the response strictly as a JSON array of objects. 
Each question object MUST have:
- "type": string (MUST be one of: "single_choice", "multiple_choice", "true_false", "matching", "media_question", "speaking")
- "question": string (the test question text)
- "options": array of strings (omit if "speaking"). For "true_false", use ["True", "False"]. For "matching", use format "A = B".
- "correctOptionIndices": array of integers (omit if "speaking")
- "points": integer (suggested weight/points for this question, usually 1 to 5 depending on difficulty)
- "explanation": string (brief explanation)
- If "media_question", MUST include a "searchQuery" field with an English keyword for an image, OR a "ttsText" field with text to be spoken.

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
