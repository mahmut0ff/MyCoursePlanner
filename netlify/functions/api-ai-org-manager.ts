import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, jsonResponse, badRequest, unauthorized, forbidden, ok } from './utils/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const action = event.queryStringParameters?.action || (event.body ? JSON.parse(event.body).action : null);
    
    // --- action: getSettings ---
    if (action === 'getSettings') {
      const organizationId = event.queryStringParameters?.organizationId;
      if (!organizationId) return badRequest('organizationId is required');
      
      const docPath = adminDb.collection('organizationAIManager').doc(organizationId);
      const snap = await docPath.get();
      if (!snap.exists) {
        // Return default skeleton
        return ok({
          data: {
            organizationId,
            isActive: false,
            greetingMessage: 'Hello! How can I help you today?',
            aboutOrganization: '',
            faq: [],
            enrollmentPolicy: '',
            customInstructions: '',
            updatedAt: new Date().toISOString()
          }
        });
      }
      return ok({ data: snap.data() });
    }

    // --- action: updateSettings ---
    if (action === 'updateSettings') {
      const user = await verifyAuth(event);
      if (!user) return unauthorized();
      
      const body = JSON.parse(event.body || '{}');
      const { organizationId, ...updates } = body;
      
      if (!organizationId) return badRequest('organizationId is required');

      // Check ownership
      const orgRef = adminDb.collection('organizations').doc(organizationId);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) return badRequest('Organization not found');
      
      const orgData = orgSnap.data()!;
      if (orgData.ownerId !== user.uid && user.role !== 'super_admin') {
         return forbidden('Only organization owner can update AI settings');
      }

      const docPath = adminDb.collection('organizationAIManager').doc(organizationId);
      await docPath.set({
        organizationId,
        ...updates,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return ok({ message: 'Settings updated' });
    }

    // --- action: chat ---
    if (action === 'chat') {
      const body = JSON.parse(event.body || '{}');
      const { messages } = body;
      // organizationId comes from query params (frontend sends it there)
      const organizationId = event.queryStringParameters?.organizationId || body.organizationId;
      
      if (!organizationId) return badRequest('organizationId is required');
      if (!messages || !Array.isArray(messages)) return badRequest('messages array is required');
      if (!GEMINI_API_KEY) return jsonResponse(500, { error: 'Server missing GEMINI API KEY' });

      // Fetch AI Settings to ensure active
      const settingsSnap = await adminDb.collection('organizationAIManager').doc(organizationId).get();
      const settingsData = settingsSnap.data() || { isActive: false };
      
      if (!settingsData.isActive) {
        return forbidden('AI Assistant is currently disabled for this organization.');
      }

      // Fetch Context (Org, Courses, Branches)
      const [orgSnap, coursesSnap, branchesSnap] = await Promise.all([
        adminDb.collection('organizations').doc(organizationId).get(),
        adminDb.collection('courses').where('organizationId', '==', organizationId).where('isPublished', '==', true).get(),
        adminDb.collection('branches').where('organizationId', '==', organizationId).get()
      ]);

      const org = orgSnap.data() || {};
      const courses = coursesSnap.docs.map(d => {
        const c = d.data();
        return `- ${c.title}${c.price ? ` (Price: ${c.price})` : ''}: ${c.description || ''}`;
      });
      const branches = branchesSnap.docs.map(d => {
        const b = d.data();
        return `- ${b.name}: ${b.address || ''} ${b.phone ? `(${b.phone})` : ''}`;
      });

      // Construct strong anti-hallucination prompt
      const systemPrompt = `You are the official AI Assistant for "${org.name || 'this educational organization'}".
YOUR DIRECTIVES:
1. Be polite, helpful, and concise.
2. YOU MUST strictly rely ONLY on the data provided below to answer user queries. Do not make up information, prices, schedules, or course names.
3. If a user asks about a topic not covered by the data (or outside of educational services), tell them politely that you do not have that information and they should contact the organization directly.
4. ALWAYS respond in the SAME LANGUAGE as the user's message. If the user writes in Russian, respond in Russian. If they write in English, respond in English.
5. ${settingsData.customInstructions || 'No additional custom instructions.'}

ORGANIZATION DATA:
- Name: ${org.name || 'Unknown'}
- About: ${settingsData.aboutOrganization || org.description || 'No general description available.'}
- FAQ: ${JSON.stringify(settingsData.faq || [])}
- Enrollment Policy: ${settingsData.enrollmentPolicy || 'No specific policy provided.'}
- Contacts: Email: ${org.contactEmail || 'N/A'}, Phone: ${org.contactPhone || 'N/A'}

AVAILABLE COURSES:
${courses.length ? courses.join('\n') : 'No public courses listed.'}

BRANCHES & LOCATIONS:
${branches.length ? branches.join('\n') : 'No public branches listed.'}

Review the Chat History and respond accurately to the final user message.`;

      // Fallback model selection
      let selectedModel = 'gemini-1.5-flash';
      try {
        const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          if (modelsData?.models) {
            const flashModels = modelsData.models.filter((m: any) => m.name.includes('flash') && m.supportedGenerationMethods?.includes('generateContentStream'));
            if (flashModels.length > 0) {
              selectedModel = flashModels[flashModels.length - 1].name.replace('models/', '');
            }
          }
        }
      } catch (e) {
        console.warn('Fallback dynamic models fetch failed', e);
      }

      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: selectedModel,
        systemInstruction: systemPrompt
      });

      // Format messages for Gemini Chat (excluding system instruction from history since we passed it in `systemInstruction`)
      // Gemini expects format: { role: "user" | "model", parts: [{ text: "..." }] }
      const formattedHistory = messages.slice(0, -1).map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      const latestMessage = messages[messages.length - 1].content;

      const chat = model.startChat({ history: formattedHistory });
      
      // Get AI streaming string or full response (going standard full response for simplicity in Netlify JSON proxy)
      const result = await chat.sendMessage(latestMessage);
      const responseText = result.response.text();

      return ok({ reply: responseText });
    }

    return badRequest('Invalid action');

  } catch (err: any) {
    console.error('AI Manager Backend Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
