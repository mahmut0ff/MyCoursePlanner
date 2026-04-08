import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { resolveTelegramLinkCode } from './utils/telegram';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Make it a POST' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    
    // Support message and callback_query if needed, but primarily text messages
    const message = payload.message;
    if (!message || !message.text || !message.chat) {
      return { statusCode: 200, body: 'OK' };
    }

    const chatId = message.chat.id;
    const text = message.text;
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8330921361:AAGmnzPz_womNW8dcoC2DNcTTpkXV8_5VaY';

    // A helper to send messages back to Telegram
    const reply = async (replyText: string) => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'HTML' })
      }).catch(err => console.error('Telegram reply error:', err));
    };

    // ─── /start with linking code ───
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        // /start ABC123  →  link Telegram account
        const code = parts[1].trim();
        const linkResult = await resolveTelegramLinkCode(code);

        if (linkResult && linkResult.orgId) {
          // Save telegramChatId on user document
          await adminDb.collection('users').doc(linkResult.userId).update({
            telegramChatId: String(chatId),
            telegramLinkedAt: new Date().toISOString(),
          });

          await reply('✅ <b>Аккаунт привязан!</b>\n\nТеперь вы будете получать уведомления об оценках, домашних заданиях и оплатах прямо сюда.\n\nЧтобы отвязать — напишите /unlink');
          return { statusCode: 200, body: 'OK' };
        } else {
          await reply('❌ Код недействителен или истёк. Попробуйте получить новый код в приложении Planula.');
          return { statusCode: 200, body: 'OK' };
        }
      }

      await reply('Здравствуйте! Введите код привязки для получения уведомлений, например: /start ABC123');
      return { statusCode: 200, body: 'OK' };
    }

    // Find the user's organization context globally for subsequent messages
    const usersSnap = await adminDb.collection('users')
      .where('telegramChatId', '==', String(chatId))
      .limit(1).get();

    if (usersSnap.empty) {
      await reply('Ваш аккаунт не привязан к системе. Войдите в приложение и привяжите Telegram в настройках профиля.');
      return { statusCode: 200, body: 'OK' };
    }

    const userDoc = usersSnap.docs[0];
    const orgId = userDoc.data().organizationId;

    // ─── /unlink — detach Telegram ───
    if (text === '/unlink') {
      await userDoc.ref.update({
        telegramChatId: '',
        telegramLinkedAt: '',
      });
      await reply('🔓 Telegram отвязан. Вы больше не будете получать уведомления.');
      return { statusCode: 200, body: 'OK' };
    }

    // Process AI Chat if AI is active
    const settingsSnap = await adminDb.collection('organizationAIManager').doc(orgId).get();
    const settingsData = settingsSnap.data() || { isActive: false };
    
    if (!settingsData.isActive) {
      // AI Chat disabled, do not reply to arbitrary text. 
      return { statusCode: 200, body: 'OK' };
    }

    // Fetch Context (Org, Courses, Branches)
    const [orgSnap, coursesSnap, branchesSnap] = await Promise.all([
      adminDb.collection('organizations').doc(orgId).get(),
      adminDb.collection('courses').where('organizationId', '==', orgId).get(),
      adminDb.collection('branches').where('organizationId', '==', orgId).get()
    ]);

    const org = orgSnap.data() || {};
    if (org.planId !== 'enterprise') {
      await reply('К сожалению, AI-ассистент временно недоступен у данной организации.');
      return { statusCode: 200, body: 'OK' };
    }

    const courses = coursesSnap.docs
      .map(d => d.data())
      .filter(c => c.isPublished === true)
      .map(c => `- ${c.title}${c.price ? ` (Price: ${c.price})` : ''}: ${c.description || ''}`);
    const branches = branchesSnap.docs.map(d => {
      const b = d.data();
      return `- ${b.name}: ${b.address || ''} ${b.phone ? `(${b.phone})` : ''}`;
    });

    const systemPrompt = `You are the friendly, proactive, and highly professional sales manager and consultant for "${org.name || 'this educational organization'}".

YOUR DIRECTIVES (CRITICAL):
1. ACT LIKE A REAL HUMAN MANAGER: Build a natural, empathetic, and engaging dialogue. Do not just robotically answer questions. 
2. BE PROACTIVE: Gently guide the conversation. Ask clarifying questions to understand the client's needs (e.g., "What is the student's current level?", "Are you looking for morning or evening classes?", "Would you like me to reserve a spot for a trial lesson?").
3. IMPROVISE & SOUND NATURAL: Rephrase your answers naturally so you don't sound like a script. You can use standard conversational fillers, warmth, and emojis where appropriate.
4. STRICT FACTUAL ACCURACY: You MUST rely ONLY on the data provided below for facts. Do NOT invent courses or prices.
5. NO REPETITIVE GREETINGS: DO NOT say "Hello" or "Здравствуйте" in every message. Only greet politely if it's the very beginning of the chat or if they explicitly greet you again. Keep follow-up messages direct and helpful.
6. HANDLING MISSING INFO: If a user asks something not covered in the data, organically suggest they contact the main office.
7. LEAD REGISTRATION (CRITICAL): If the user agrees to a meeting or trial lesson AND provides their name and phone number, you MUST call the "addLeadToDatabase" function tool. DO NOT just say you saved it. YOU MUST USE THE TOOL.
8. LANGUAGE: ALWAYS respond in the exact same language as the user's message.
9. CUSTOM INSTRUCTIONS: ${settingsData.customInstructions || 'None.'}

ORGANIZATION DATA (YOUR KNOWLEDGE BASE):
- Name: ${org.name || 'Unknown'}
- Location/Address: ${org.address || 'N/A'}
- About: ${settingsData.aboutOrganization || org.description || 'No general description available.'}
- FAQ: ${JSON.stringify(settingsData.faq || [])}
- Enrollment Policy: ${settingsData.enrollmentPolicy || 'No specific policy provided.'}
- Contacts: Email: ${org.contactEmail || 'N/A'}, Phone: ${org.contactPhone || 'N/A'}

AVAILABLE COURSES & PRICES:
${courses.length ? courses.join('\n') : 'No public courses listed yet. Suggest contacting the office.'}

BRANCHES & LOCATIONS:
${branches.length ? branches.join('\n') : 'No public branches listed yet.'}

Provide formatted text for Telegram. Do not use Markdown unsupported by Telegram HTML (use <b>bold</b>, <i>italic</i>, etc.). Do NOT output raw generic JSON or code blocks.`;

    // Manage Context in Firestore (simplified 10 messages context limit)
    const sessionRef = adminDb.collection('organizationAIManager').doc(orgId).collection('telegramSessions').doc(chatId.toString());
    const sessionSnap = await sessionRef.get();
    let history: any[] = [];
    if (sessionSnap.exists) {
      history = sessionSnap.data()?.messages || [];
    }
    
    // Add User Message to local history array
    history.push({ role: 'user', content: text });
    if (history.length > 20) {
      history = history.slice(-20);
    }

    // Prepare formats for Gemini API
    const contents: any[] = [];
    let expectedRole = 'user';
    for (const msg of history) {
      const mappedRole = msg.role === 'assistant' ? 'model' : 'user';
      if (mappedRole === expectedRole) {
         contents.push({ role: mappedRole, parts: [{ text: msg.content }] });
         expectedRole = expectedRole === 'user' ? 'model' : 'user';
      }
    }
    // ensure last message is from user
    if (contents.length > 0 && contents[contents.length - 1].role === 'model') {
       contents.pop();
    }

    // Dynamic model discovery
    let selectedModel = 'gemini-2.0-flash-lite';
    try {
      const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        const flashModels = modelsData.models?.filter((m: any) => m.name.includes('flash') && m.supportedGenerationMethods?.includes('generateContent'));
        if (flashModels && flashModels.length > 0) {
          selectedModel = flashModels[flashModels.length - 1].name.replace('models/', '');
        }
      }
    } catch {}

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{
            functionDeclarations: [{
              name: 'addLeadToDatabase',
              description: 'Adds a new lead to the CRM database for a trial lesson or meeting. Use this when the user agrees to a meeting or trial and provides their exact name and phone number.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING', description: 'Client name' },
                  phone: { type: 'STRING', description: 'Client phone number' },
                  reason: { type: 'STRING', description: 'Reason for the appointment, e.g., Trial lesson for programming' }
                },
                required: ['name', 'phone', 'reason']
              }
            }]
          }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!geminiResponse.ok) {
      console.error('Gemini error:', await geminiResponse.text());
      await reply('Извините, произошла техническая ошибка. Пожалуйста, повторите позже.');
      return { statusCode: 200, body: 'OK' };
    }

    const geminiData = await geminiResponse.json();
    const candidateParts = geminiData.candidates?.[0]?.content?.parts || [];
    
    let responseText = '';
    const functionCall = candidateParts.find((p: any) => p.functionCall)?.functionCall;
    
    if (functionCall && functionCall.name === 'addLeadToDatabase') {
       const args = functionCall.args;
       await adminDb.collection('organizations').doc(orgId).collection('aiLeads').add({
          name: args.name || 'Unknown',
          phone: args.phone || 'Unknown',
          reason: args.reason || '',
          source: 'telegram_bot',
          status: 'new',
          createdAt: new Date().toISOString()
       });
       responseText = `Отлично! Я передал ваши контакты менеджеру. С вами скоро свяжутся.`;
    } else {
       responseText = candidateParts.find((p: any) => p.text)?.text || 'Простите, я не смог сформировать ответ.';
    }
    
    // Telegram HTML simple markdown fallback cleanups inside the AI output
    responseText = responseText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    responseText = responseText.replace(/\*(.*?)\*/g, '<i>$1</i>');
    
    await reply(responseText);
    
    history.push({ role: 'assistant', content: responseText });
    await sessionRef.set({
      messages: history,
      updatedAt: new Date().toISOString()
    });

    return { statusCode: 200, body: 'OK' };

  } catch (err: any) {
    console.error('Webhook Error:', err);
    return { statusCode: 200, body: 'OK' }; // Important: 200 so Telegram doesn't retry infinitely
  }
};
