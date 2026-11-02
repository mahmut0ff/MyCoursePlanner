import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { AI_MODEL } from './utils/ai';
import { verifyAuth, jsonResponse, badRequest, unauthorized, forbidden, ok } from './utils/auth';
import type { AuthUser } from './utils/auth';
import { notifyOrgAdmins } from './utils/notifications';
import { planHasAIManager } from './utils/plan-limits';
import { setTelegramWebhook, TELEGRAM_WEBHOOK_PATH } from './utils/telegram-webhook-auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const DEFAULT_GREETING = 'Здравствуйте! Чем я могу вам помочь?';

// organizationAIManager/{orgId} holds the org's Telegram bot token, so the doc is
// never served as is. Both views below are allowlists: a field added to the doc
// later stays private until someone lists it here on purpose.

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

const faqOf = (v: unknown): { question: string; answer: string }[] =>
  Array.isArray(v)
    ? v.filter((f) => f && typeof f === 'object').map((f) => ({ question: str(f.question), answer: str(f.answer) }))
    : [];

/**
 * Anyone's view, for the public profile's chat widget. FAQ answers are included:
 * the assistant tells them to any visitor anyway.
 */
function publicView(organizationId: string, doc: FirebaseFirestore.DocumentData, planAllowsAI: boolean) {
  return {
    organizationId,
    // A plan without the AI manager keeps the assistant off, whatever the doc says.
    isActive: planAllowsAI && !!doc.isActive,
    greetingMessage: str(doc.greetingMessage, DEFAULT_GREETING),
    faq: faqOf(doc.faq),
    telegramBotUsername: str(doc.telegramBotUsername),
  };
}

/** The owner's editor. The bot shows up as connected-or-not plus its public @username, never as the token. */
function ownerView(organizationId: string, doc: FirebaseFirestore.DocumentData, planAllowsAI: boolean) {
  return {
    ...publicView(organizationId, doc, planAllowsAI),
    aboutOrganization: str(doc.aboutOrganization),
    enrollmentPolicy: str(doc.enrollmentPolicy),
    customInstructions: str(doc.customInstructions),
    hasTelegramBot: !!doc.telegramBotToken,
    updatedAt: str(doc.updatedAt),
  };
}

type Reply = ReturnType<typeof jsonResponse>;

/**
 * The org, when `user` may manage its AI settings: its owner or a super admin.
 * The editor's read and its save both go through here, so they can't drift apart.
 */
async function ownedOrg(user: AuthUser, organizationId: string): Promise<{ org: FirebaseFirestore.DocumentData } | { error: Reply }> {
  const orgSnap = await adminDb.collection('organizations').doc(organizationId).get();
  if (!orgSnap.exists) return { error: badRequest('Organization not found') };
  const org = orgSnap.data()!;
  if (org.ownerId !== user.uid && user.role !== 'super_admin') {
    return { error: forbidden('Only organization owner can manage AI settings') };
  }
  return { org };
}

const EDITABLE_TEXT = ['greetingMessage', 'aboutOrganization', 'enrollmentPolicy', 'customInstructions'] as const;

/**
 * What updateSettings stores from the body, type-checked. The editors post their
 * whole settings object back, so everything else in it (telegramBotUsername,
 * hasTelegramBot, updatedAt, …) is dropped rather than stored. The bot token has
 * its own path in updateSettings.
 */
function pickEditable(body: Record<string, unknown>): { updates: Record<string, unknown> } | { error: string } {
  const updates: Record<string, unknown> = {};
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return { error: 'isActive must be a boolean' };
    updates.isActive = body.isActive;
  }
  for (const key of EDITABLE_TEXT) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string') return { error: `${key} must be a string` };
    updates[key] = body[key];
  }
  const faq = body.faq;
  if (faq !== undefined) {
    if (!Array.isArray(faq) || !faq.every((f) => f && typeof f.question === 'string' && typeof f.answer === 'string')) {
      return { error: 'faq must be a list of { question, answer } strings' };
    }
    updates.faq = faq.map((f) => ({ question: f.question, answer: f.answer }));
  }
  return { updates };
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const action = event.queryStringParameters?.action || (event.body ? JSON.parse(event.body).action : null);
    
    // --- action: getSettings (public, no auth: the profile page's chat widget) ---
    if (action === 'getSettings') {
      const organizationId = event.queryStringParameters?.organizationId;
      if (!organizationId) return badRequest('organizationId is required');

      const [snap, orgSnap] = await Promise.all([
        adminDb.collection('organizationAIManager').doc(organizationId).get(),
        adminDb.collection('organizations').doc(organizationId).get()
      ]);
      const orgPlan = orgSnap.exists ? orgSnap.data()?.planId : null;

      return ok({ data: publicView(organizationId, snap.data() || {}, planHasAIManager(orgPlan)) });
    }

    // --- action: getOwnerSettings (the settings editor: owner or super admin) ---
    if (action === 'getOwnerSettings') {
      const user = await verifyAuth(event);
      if (!user) return unauthorized(event);
      const organizationId = event.queryStringParameters?.organizationId;
      if (!organizationId) return badRequest('organizationId is required');

      const owned = await ownedOrg(user, organizationId);
      if ('error' in owned) return owned.error;

      const snap = await adminDb.collection('organizationAIManager').doc(organizationId).get();
      return ok({ data: ownerView(organizationId, snap.data() || {}, planHasAIManager(owned.org.planId)) });
    }

    // --- action: getUsage (current month AI consumption) ---
    if (action === 'getUsage') {
      const user = await verifyAuth(event);
      if (!user) return unauthorized(event);
      const organizationId = event.queryStringParameters?.organizationId;
      if (!organizationId) return badRequest('organizationId is required');
      if (user.organizationId !== organizationId && user.role !== 'super_admin') return forbidden();

      const period = new Date().toISOString().slice(0, 7); // YYYY-MM
      const snap = await adminDb.collection('organizations').doc(organizationId)
        .collection('aiUsage').doc(period).get();
      const d = snap.exists ? snap.data()! : null;
      return ok({ data: { period, total: d?.total || 0, features: d?.features || {} } });
    }

    // --- action: updateSettings ---
    if (action === 'updateSettings') {
      const user = await verifyAuth(event);
      if (!user) return unauthorized(event);
      
      const body = JSON.parse(event.body || '{}') || {};
      const organizationId = body.organizationId;

      if (!organizationId || typeof organizationId !== 'string') return badRequest('organizationId is required');

      const owned = await ownedOrg(user, organizationId);
      if ('error' in owned) return owned.error;
      if (!planHasAIManager(owned.org.planId) && user.role !== 'super_admin') {
         return forbidden('Your current plan does not support AI features');
      }

      const picked = pickEditable(body);
      if ('error' in picked) return badRequest(picked.error);
      const updates = picked.updates;
      const docPath = adminDb.collection('organizationAIManager').doc(organizationId);

      // The bot token changes only on request: a new token connects that bot, ''
      // disconnects it, and reconnectTelegram re-registers the webhook of the bot
      // already stored. Otherwise the stored token stays as it is, which is what
      // lets the client work without ever holding it.
      if (body.telegramBotToken !== undefined && typeof body.telegramBotToken !== 'string') {
        return badRequest('telegramBotToken must be a string');
      }
      let tokenChange: string | undefined = body.telegramBotToken;
      if (tokenChange === undefined && body.reconnectTelegram === true) {
        tokenChange = str((await docPath.get()).data()?.telegramBotToken);
        if (!tokenChange) return badRequest('No Telegram bot is connected');
      }

      if (tokenChange !== undefined) {
        const token = tokenChange.trim();
        if (token === '') {
          updates.telegramBotToken = '';
          updates.telegramBotUsername = '';
        } else {
          try {
            const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            if (!meRes.ok) return badRequest('Invalid Telegram Bot Token');
            const meData: any = await meRes.json();
            
            // Create absolute webhook URL securely using rawUrl
            const origin = event.rawUrl ? new URL(event.rawUrl).origin : `https://${event.headers.host}`;
            const webhookUrl = `${origin}${TELEGRAM_WEBHOOK_PATH}?orgId=${encodeURIComponent(organizationId)}`;
            
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
              console.warn('Skipping webhook setup on localhost');
            } else {
              // With this org's own secret_token — the webhook drops updates without it.
              const whRes = await setTelegramWebhook(token, webhookUrl, organizationId);
              if (!whRes) return jsonResponse(500, { error: 'Server missing TELEGRAM_WEBHOOK_SECRET' });
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

      await docPath.set({
        organizationId,
        ...updates,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const saved = await docPath.get();
      return ok({ message: 'Settings updated', data: ownerView(organizationId, saved.data() || {}, planHasAIManager(owned.org.planId)) });
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

      if (!planHasAIManager(org.planId)) {
        return forbidden('AI Assistant is not available on this organization\'s plan.');
      }
      
      const courses = coursesSnap.docs
        .map(d => d.data())
        .filter(c => c.status === 'published')
        .map(c => {
          return `- ${c.title}${c.price ? ` (Price: ${c.price})` : ''}: ${c.description || ''}`;
        });
      const branches = branchesSnap.docs.map(d => {
        const b = d.data();
        return `- ${b.name}: ${b.address || ''} ${b.phone ? `(${b.phone})` : ''}`;
      });

      const isFirstMessage = messages.length <= 1;

      // Construct strong anti-hallucination prompt
      const systemPrompt = `You are the friendly, proactive, and highly professional sales manager and consultant for "${org.name || 'this educational organization'}".

YOUR DIRECTIVES (CRITICAL):
1. ACT LIKE A REAL HUMAN: Build a natural, empathetic, and engaging dialogue. 
2. PROACTIVE SALES: Gently guide the conversation. Ask clarifying questions (e.g., "What is the student's current level?", "When would you like to start?"). 
3. FACTUAL ACCURACY: Rely ONLY on the data provided below. Do not invent courses, prices, or policies.
4. GREETING RULE: If this is the start of the conversation, you MUST incorporate the exact essence of the configured "Greeting Message". Do not overwrite it with generic text.
5. NO REPETITIVE GREETINGS: Do not say hello in follow-up messages.
6. LEAD LOGGING (CRITICAL): If the user agrees to a meeting or trial lesson AND provides their name and phone number, you MUST call the "addLeadToDatabase" function tool.
7. LANGUAGE: Reply in the same language as the user.
8. CUSTOM BEHAVIOR INSTRUCTIONS: ${settingsData.customInstructions ? 'STRICTLY FOLLOW THIS: "' + settingsData.customInstructions + '"' : 'None.'}

ORGANIZATION KNOWLEDGE BASE:
- Name: ${org.name || 'Unknown'}
- Location/Address: ${org.address || 'N/A'}
- Organization Bio / Description: ${settingsData.aboutOrganization || org.description || 'No description provided.'}
- Configured Greeting Message: "${settingsData.greetingMessage || 'Здравствуйте! Чем я могу вам помочь?'}"
- Enrollment Policy: ${settingsData.enrollmentPolicy || 'No specific policy provided.'}
- FAQ: ${JSON.stringify(settingsData.faq || [])}
- Contacts: Email: ${org.contactEmail || 'N/A'}, Phone: ${org.contactPhone || 'N/A'}

AVAILABLE COURSES & PRICES:
${courses.length ? courses.join('\n') : 'No public courses listed. Suggest contacting the office.'}

AVAILABLE BRANCHES:
${branches.length ? branches.join('\n') : 'No public branches listed.'}

${isFirstMessage ? 'IMPORTANT: This is the first message from the user. You MUST reply by starting with the Configured Greeting Message exactly as written, then naturally address what they asked.' : ''}
Review the Chat History and respond accurately to the final user message. Do NOT output raw generic JSON or code blocks.`;

      const selectedModel = AI_MODEL;

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

      const toolDeclarations = [{
        functionDeclarations: [{
          name: 'addLeadToDatabase',
          description: 'Adds a new lead/application to the CRM database. ALWAYS call this function when the user provides their name AND phone number for a trial lesson, meeting, or enrollment. Do not skip this step.',
          parameters: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING', description: 'Full client name as provided by the user' },
              phone: { type: 'STRING', description: 'Client phone number as provided by the user' },
              reason: { type: 'STRING', description: 'Reason / goal, e.g. Trial lesson for programming, Enrollment inquiry' }
            },
            required: ['name', 'phone']
          }
        }]
      }];

      // Direct REST API call
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: toolDeclarations,
            tool_config: { function_calling_config: { mode: 'AUTO' } },
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errBody = await geminiResponse.text();
        console.error('Gemini API error:', geminiResponse.status, errBody);
        return jsonResponse(502, { error: `AI service error: ${geminiResponse.status}` });
      }

      const geminiData: any = await geminiResponse.json();
      const candidateParts = geminiData.candidates?.[0]?.content?.parts || [];
      
      console.log('[AI-Chat] Gemini response parts:', JSON.stringify(candidateParts.map((p: any) => ({
        hasText: !!p.text,
        hasFunctionCall: !!p.functionCall,
        functionName: p.functionCall?.name,
      }))));

      let responseText = '';
      const functionCallPart = candidateParts.find((p: any) => p.functionCall);
      
      if (functionCallPart?.functionCall?.name === 'addLeadToDatabase') {
         const args = functionCallPart.functionCall.args || {};
         console.log('[AI-Chat] Function call detected! Args:', JSON.stringify(args));

         // Step 1: Execute the function — save the lead
         await adminDb.collection('organizations').doc(organizationId).collection('aiLeads').add({
            name: args.name || 'Unknown',
            phone: args.phone || 'Unknown',
            reason: args.reason || '',
            source: 'web_chat',
            status: 'new',
            createdAt: new Date().toISOString()
         });
         
         const message = `У вас новая заявка через AI-ассистента на сайте!\n\n` +
                         `👤 Имя: ${args.name}\n` +
                         `📞 Телефон: ${args.phone}\n` +
                         `${args.reason ? `🎯 Цель: ${args.reason}` : ''}`;
         await notifyOrgAdmins(organizationId, 'new_lead', '📩 Новая заявка', message, '/leads');

         // Step 2: Send functionResponse back to Gemini for a natural reply
         try {
           const functionResponseContents = [
             ...contents,
             { role: 'model', parts: [{ functionCall: functionCallPart.functionCall }] },
             { role: 'function', parts: [{ functionResponse: {
               name: 'addLeadToDatabase',
               response: { success: true, message: 'Lead has been saved. The manager will contact the client soon.' }
             }}] }
           ];

           const followUpResponse = await fetch(
             `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`,
             {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 system_instruction: { parts: [{ text: systemPrompt }] },
                 contents: functionResponseContents,
                 generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
               }),
             }
           );

           if (followUpResponse.ok) {
             const followUpData: any = await followUpResponse.json();
             const followUpParts = followUpData.candidates?.[0]?.content?.parts || [];
             responseText = followUpParts.find((p: any) => p.text)?.text || '';
           }
         } catch (e) {
           console.warn('[AI-Chat] Follow-up call failed (non-fatal):', e);
         }

         if (!responseText) {
           responseText = 'Отлично! Я записал ваши данные. Наш менеджер свяжется с вами в ближайшее время! 🙌';
         }
      } else {
         responseText = candidateParts.find((p: any) => p.text)?.text || 'Sorry, I could not generate a response.';
      }

      return ok({ reply: responseText });
    }

    return badRequest('Invalid action');

  } catch (err: any) {
    console.error('AI Manager Backend Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
