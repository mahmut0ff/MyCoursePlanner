import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, jsonResponse, badRequest, unauthorized, forbidden, ok } from './utils/auth';

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
      const [snap, orgSnap] = await Promise.all([
        docPath.get(),
        adminDb.collection('organizations').doc(organizationId).get()
      ]);
      const orgPlan = orgSnap.exists ? orgSnap.data()?.planId : null;
      
      let data: any = {
        organizationId,
        isActive: false,
        greetingMessage: 'Здравствуйте! Чем я могу вам помочь?',
        aboutOrganization: '',
        faq: [],
        enrollmentPolicy: '',
        customInstructions: '',
        updatedAt: new Date().toISOString()
      };
      
      if (snap.exists) {
        data = { ...data, ...snap.data() };
      }
      
      const allowedPlans = ['enterprise', 'professional', 'pro', 'expert'];
      if (orgPlan && !allowedPlans.includes(orgPlan)) {
        data.isActive = false;
      }

      return ok({ data });
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
      // Allow enterprise, professional, or super_admin
      const allowedPlans = ['enterprise', 'professional', 'pro', 'expert'];
      if (!allowedPlans.includes(orgData.planId) && user.role !== 'super_admin') {
         return forbidden('Your current plan does not support AI features');
      }
      if (orgData.ownerId !== user.uid && user.role !== 'super_admin') {
         return forbidden('Only organization owner can update AI settings');
      }

      if (updates.telegramBotToken !== undefined) {
        const token = updates.telegramBotToken.trim();
        if (token === '') {
          updates.telegramBotToken = '';
          updates.telegramBotUsername = '';
        } else {
          try {
            const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            if (!meRes.ok) return badRequest('Invalid Telegram Bot Token');
            const meData = await meRes.json();
            
            // Create absolute webhook URL securely using rawUrl
            const origin = event.rawUrl ? new URL(event.rawUrl).origin : `https://${event.headers.host}`;
            const webhookUrl = `${origin}/.netlify/functions/api-telegram-webhook?orgId=${organizationId}`;
            
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
              console.warn('Skipping webhook setup on localhost');
            } else {
              const whRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
              if (!whRes.ok) {
                const errTxt = await whRes.text();
                console.error('Webhook set error:', errTxt);
                return jsonResponse(400, { error: `Telegram Webhook Error: ${errTxt}` });
              }
            }
            updates.telegramBotToken = token;
            updates.telegramBotUsername = meData.result.username;
          } catch (e: any) {
            console.error('Telegram config error:', e);
            return jsonResponse(500, { error: 'Error connecting to Telegram API' });
          }
        }
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
        adminDb.collection('courses').where('organizationId', '==', organizationId).get(),
        adminDb.collection('branches').where('organizationId', '==', organizationId).get()
      ]);

      const org = orgSnap.data() || {};
      
      if (org.planId !== 'enterprise') {
        return forbidden('AI Assistant is not available on this organization\'s plan.');
      }
      
      const courses = coursesSnap.docs
        .map(d => d.data())
        .filter(c => c.isPublished === true)
        .map(c => {
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

      // Dynamic model discovery (same approach as api-ai-generate.ts)
      let selectedModel = 'gemini-2.0-flash-lite';
      try {
        const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          if (modelsData?.models) {
            const supportedModels = modelsData.models.filter((m: any) =>
              m.supportedGenerationMethods?.includes('generateContent')
            );
            const flashModels = supportedModels.filter((m: any) => m.name.includes('flash'));
            if (flashModels.length > 0) {
              selectedModel = flashModels[flashModels.length - 1].name.replace('models/', '');
            } else if (supportedModels.length > 0) {
              selectedModel = supportedModels[supportedModels.length - 1].name.replace('models/', '');
            }
          }
        }
      } catch (e) {
        console.warn('Dynamic model discovery failed, using fallback:', e);
      }

      console.log('AI Chat: using model:', selectedModel);

      // Build contents array (history + latest message)
      const rawHistory = messages.slice(0, -1).filter((m: any) => m.id !== 'greeting');
      const latestMessage = messages[messages.length - 1].content;
      const contents: any[] = [];
      let expectedRole = 'user';
      for (const msg of rawHistory) {
        const mappedRole = msg.role === 'assistant' ? 'model' : 'user';
        if (mappedRole === expectedRole) {
          contents.push({ role: mappedRole, parts: [{ text: msg.content }] });
          expectedRole = expectedRole === 'user' ? 'model' : 'user';
        }
      }
      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents.pop();
      }
      contents.push({ role: 'user', parts: [{ text: latestMessage }] });

      // Direct REST API call
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errBody = await geminiResponse.text();
        console.error('Gemini API error:', geminiResponse.status, errBody);
        return jsonResponse(502, { error: `AI service error: ${geminiResponse.status}` });
      }

      const geminiData = await geminiResponse.json();
      const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';

      return ok({ reply: responseText });
    }

    return badRequest('Invalid action');

  } catch (err: any) {
    console.error('AI Manager Backend Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
