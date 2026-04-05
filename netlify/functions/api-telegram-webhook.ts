import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Make it a POST' };
  }

  try {
    const orgId = event.queryStringParameters?.orgId;
    if (!orgId) {
      console.error('No orgId provided in webhook URL');
      return { statusCode: 200, body: 'OK' }; // Return 200 so Telegram stops retrying
    }

    const payload = JSON.parse(event.body || '{}');
    
    // Support message and callback_query if needed, but primarily text messages
    const message = payload.message;
    if (!message || !message.text || !message.chat) {
      return { statusCode: 200, body: 'OK' };
    }

    const chatId = message.chat.id;
    const text = message.text;

    // Fetch Settings
    const settingsSnap = await adminDb.collection('organizationAIManager').doc(orgId).get();
    const settingsData = settingsSnap.data() || { isActive: false };
    
    if (!settingsData.isActive || !settingsData.telegramBotToken) {
      console.warn('AI is disabled or Telegram token missing for org', orgId);
      return { statusCode: 200, body: 'OK' };
    }
    
    const botToken = settingsData.telegramBotToken;

    // A helper to send messages back to Telegram
    const reply = async (replyText: string) => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'HTML' })
      }).catch(err => console.error('Telegram reply error:', err));
    };

    if (text === '/start') {
      const greeting = settingsData.greetingMessage || 'Здравствуйте! Чем я могу вам помочь?';
      await reply(greeting);
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

    const systemPrompt = `You are the official AI Assistant for "${org.name || 'this educational organization'}".
YOUR DIRECTIVES:
1. Be polite, helpful, and concise.
2. YOU MUST strictly rely ONLY on the data provided below to answer user queries. Do not make up information, prices, schedules, or course names.
3. If a user asks about a topic not covered by the data (or outside of educational services), tell them politely that you do not have that information and they should contact the organization directly.
4. ALWAYS respond in the SAME LANGUAGE as the user's message.
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

Provide formatted text for Telegram. Do not use Markdown unsupported by Telegram HTML (use <b>bold</b>, <i>italic</i>, etc.).`;

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
    let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Простите, я не смог сформировать ответ.';
    
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
