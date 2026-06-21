import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { notifyOrgAdmins } from './utils/notifications';
import { resolveTelegramLinkCode, TELEGRAM_BOT_TOKEN } from './utils/telegram';
import { resolveJoinCode, createOrJoinTelegramUser, createLoginToken, resolveClaimToken, ensureParentKey } from './utils/onboarding';
import { processApprovalDecision } from './utils/join-approvals';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/** Reconcile every admin's approval message: drop the buttons, show the outcome. */
async function refreshApprovalMessages(token: string, botToken: string): Promise<void> {
  const snap = await adminDb.collection('telegramApprovals').doc(token).get();
  if (!snap.exists) return;
  const ap = snap.data()!;
  const name = ap.applicantName || 'Заявка';
  const outcome =
    ap.status === 'approved' ? '✅ <b>Принято</b>' :
    ap.status === 'rejected' ? '❌ <b>Отклонено</b>' : 'ℹ️ Обработано';
  const by = ap.decidedByName ? `\n<i>Решение принял(а): ${ap.decidedByName}</i>` : '';
  const text = `📨 Заявка: <b>${name}</b>\n\n${outcome}${by}`;
  const msgs: { chatId: string; messageId: number }[] = ap.messages || [];
  await Promise.allSettled(
    msgs.map((m) =>
      fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: m.chatId, message_id: m.messageId, text, parse_mode: 'HTML' }),
      }).catch(() => {}),
    ),
  );
}

/** Handle an inline-button press on a join-request notification. */
async function handleApprovalCallback(cq: any, botToken: string, appOrigin: string): Promise<void> {
  const cbId = cq.id;
  const data: string = cq.data || '';
  const fromChatId = String(cq.from?.id || cq.message?.chat?.id || '');

  const answer = (text: string, alert = false) =>
    fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cbId, text, show_alert: alert }),
    }).catch(() => {});

  const parts = data.split(':');
  if (parts[0] !== 'apv' || parts.length < 3) { await answer('Неизвестное действие'); return; }
  const token = parts[1];
  const decision = parts[2] === 'a' ? 'approve' : 'reject';

  const res = await processApprovalDecision(token, decision, fromChatId);

  if (!res.ok) {
    const messages: Record<string, string> = {
      not_found: 'Заявка не найдена или устарела',
      forbidden: 'Управлять заявками может только администратор центра',
      limit: 'Достигнут лимит учеников по вашему тарифу',
      handled: 'Эта заявка уже обработана',
    };
    await answer(messages[res.reason] || 'Не удалось обработать заявку', true);
    if (res.reason === 'handled') await refreshApprovalMessages(token, botToken);
    return;
  }

  const toast =
    res.result === 'approved' ? '✅ Заявка принята' :
    res.result === 'rejected' ? '❌ Заявка отклонена' : 'Заявка уже обработана';
  await answer(toast);
  await refreshApprovalMessages(token, botToken);

  // Let the approved applicant in immediately with a fresh passwordless login button.
  if (res.result === 'approved' && res.applicantUid) {
    try {
      const userDoc = await adminDb.collection('users').doc(res.applicantUid).get();
      const tgChat = userDoc.data()?.telegramChatId;
      if (tgChat) {
        const ott = await createLoginToken(res.applicantUid);
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgChat,
            parse_mode: 'HTML',
            text: '🎉 Ваша заявка одобрена! Добро пожаловать.\n\nНажмите, чтобы войти — без пароля:',
            reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть SabakHub', url: `${appOrigin}/tg-login?ott=${ott}` }]] },
          }),
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Notify approved applicant failed:', e);
    }
  }
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Make it a POST' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const appOrigin = event.rawUrl ? new URL(event.rawUrl).origin : `https://${event.headers.host || ''}`;

    // Determine if this is the Global SabakHub Bot or a Custom AI Bot
    const queryOrgId = event.queryStringParameters?.orgId;
    let botToken = TELEGRAM_BOT_TOKEN;
    let isGlobalBot = true;

    if (queryOrgId) {
      const settingsSnap = await adminDb.collection('organizationAIManager').doc(queryOrgId).get();
      const settingsData = settingsSnap.data() || { isActive: false };

      // If the custom AI bot is inactive or doesn't have a token, ignore
      if (!settingsData.isActive || !settingsData.telegramBotToken) {
        return { statusCode: 200, body: 'OK' };
      }
      botToken = settingsData.telegramBotToken;
      isGlobalBot = false;
    }

    // Inline-button press (Принять / Отклонить on a join request) — no chat message.
    if (payload.callback_query) {
      await handleApprovalCallback(payload.callback_query, botToken, appOrigin);
      return { statusCode: 200, body: 'OK' };
    }

    const message = payload.message;
    if (!message || !message.chat || (!message.text && !message.contact)) {
      return { statusCode: 200, body: 'OK' };
    }

    const chatId = message.chat.id;
    const text = message.text || '';
    const contact = message.contact;

    // A helper to send messages back to Telegram
    const reply = async (replyText: string) => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'HTML' })
      }).catch(err => console.error('Telegram reply error:', err));
    };

    // Send with custom reply markup (keyboards / inline buttons).
    const sendTg = async (replyText: string, replyMarkup?: any) => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
      }).catch(err => console.error('Telegram send error:', err));
    };

    // Inline button that opens the app already signed in (passwordless).
    const sendLoginButton = async (uid: string, intro: string) => {
      const ott = await createLoginToken(uid);
      await sendTg(intro, { inline_keyboard: [[{ text: '🚀 Открыть SabakHub', url: `${appOrigin}/tg-login?ott=${ott}` }]] });
    };

    // Offer a parent-portal link (students only) so the student can forward it to parents.
    const sendParentLink = async (uid: string) => {
      const key = await ensureParentKey(uid);
      await sendTg(`👨‍👩‍👦 <b>Для родителей</b>\nПерешлите эту ссылку родителям — они будут видеть ваши успехи и посещаемость:\n${appOrigin}/parent/${key}`);
    };

    if (isGlobalBot) {
      // ─── GLOBAL BOT: registration, account linking & passwordless login ───

      // (a) Contact shared → capture phone, then ask for the official full name.
      if (contact) {
        const stateRef = adminDb.collection('telegramRegistrations').doc(String(chatId));
        const stateSnap = await stateRef.get();
        if (!stateSnap.exists) {
          await sendTg('Чтобы зарегистрироваться, откройте ссылку-приглашение от вашего учебного центра.', { remove_keyboard: true });
          return { statusCode: 200, body: 'OK' };
        }
        const phone = contact.phone_number || '';
        const sFname = message.from?.first_name || contact.first_name || '';
        const sLname = message.from?.last_name || contact.last_name || '';
        const suggested = `${sFname} ${sLname}`.trim();
        await stateRef.set({ phone, suggestedName: suggested, step: 'awaiting_name', updatedAt: new Date().toISOString() }, { merge: true });
        await sendTg(
          'Спасибо! 📝 Как записать вас в журнал? Напишите <b>имя и фамилию</b> (как в документах).',
          suggested
            ? { keyboard: [[{ text: suggested }]], resize_keyboard: true, one_time_keyboard: true }
            : { remove_keyboard: true },
        );
        return { statusCode: 200, body: 'OK' };
      }

      // (a2) Awaiting full name (free text) → finalize the account.
      if (text && !text.startsWith('/')) {
        const stateRef = adminDb.collection('telegramRegistrations').doc(String(chatId));
        const stateSnap = await stateRef.get();
        const reg = stateSnap.exists ? stateSnap.data()! : null;
        if (reg && reg.step === 'awaiting_name') {
          const fullName = text.trim().replace(/\s+/g, ' ').slice(0, 80);
          if (fullName.length < 2) {
            await sendTg('Пожалуйста, напишите имя и фамилию полностью.');
            return { statusCode: 200, body: 'OK' };
          }
          try {
            const result = await createOrJoinTelegramUser({ chatId, phone: reg.phone || '', displayName: fullName, role: reg.role, orgId: reg.orgId, orgName: reg.orgName, groupId: reg.groupId, groupName: reg.groupName });
            await stateRef.delete().catch(() => {});
            await sendTg(`Принято, <b>${fullName}</b> ✅`, { remove_keyboard: true });
            if (result.status === 'active') {
              await sendLoginButton(result.uid, `🎉 Готово! Вы зачислены в <b>${reg.orgName}</b>.\n\nНажмите, чтобы войти — без пароля:`);
              if (reg.role === 'student') await sendParentLink(result.uid);
            } else {
              await sendLoginButton(result.uid, `📨 Заявка отправлена в <b>${reg.orgName}</b>. Администратор подтвердит вас в ближайшее время.\n\nКнопка для входа (заработает после подтверждения):`);
            }
            // New account → also hand over a login + temporary password for web sign-in without Telegram.
            if (result.isNewUser && result.loginUsername && result.tempPassword) {
              await sendTg(
                `🔑 <b>Данные для входа в веб-версию</b> (без Telegram):\n\n` +
                `Логин: <code>${result.loginUsername}</code>\n` +
                `Пароль: <code>${result.tempPassword}</code>\n\n` +
                `🔒 Рекомендуем сменить пароль после первого входа — в разделе «Профиль».`,
              );
            }
          } catch (e) {
            console.error('TG registration error:', e);
            await sendTg('Не удалось завершить регистрацию. Попробуйте ещё раз позже.', { remove_keyboard: true });
          }
          return { statusCode: 200, body: 'OK' };
        }
      }

      // (b) /start with payload — join-by-code or account-linking code.
      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        const payloadArg = parts.length > 1 ? parts[1].trim() : '';

        // Claim a pre-created account: /start claim_<TOKEN> (bulk import / voice add).
        if (payloadArg.startsWith('claim_')) {
          const token = payloadArg.slice('claim_'.length);
          const claim = await resolveClaimToken(token);
          if (!claim) {
            await reply('❌ Ссылка-приглашение недействительна или истекла. Попросите центр прислать новую.');
            return { statusCode: 200, body: 'OK' };
          }
          await adminDb.collection('users').doc(claim.uid).set(
            { telegramChatId: String(chatId), telegramLinkedAt: new Date().toISOString() }, { merge: true },
          );
          const u = await adminDb.collection('users').doc(claim.uid).get();
          const nm = u.data()?.displayName || '';
          await sendLoginButton(claim.uid, `🎉 Добро пожаловать${nm ? `, <b>${nm}</b>` : ''}! Ваш аккаунт готов.\n\nНажмите, чтобы войти — без пароля:`);
          if (u.data()?.role === 'student') await sendParentLink(claim.uid);
          return { statusCode: 200, body: 'OK' };
        }

        // Join-by-code: /start join_<CODE>
        if (payloadArg.startsWith('join_')) {
          const code = payloadArg.slice('join_'.length);
          const resolved = await resolveJoinCode(code);
          if (!resolved) {
            await reply('❌ Код приглашения не найден или больше не действителен. Попросите у центра новую ссылку.');
            return { statusCode: 200, body: 'OK' };
          }
          const orgSnap = await adminDb.collection('organizations').doc(resolved.orgId).get();
          if (!orgSnap.exists || orgSnap.data()?.status !== 'active') {
            await reply('Учебный центр сейчас недоступен.');
            return { statusCode: 200, body: 'OK' };
          }
          const orgName = orgSnap.data()?.name || 'учебный центр';
          await adminDb.collection('telegramRegistrations').doc(String(chatId)).set({
            orgId: resolved.orgId, role: resolved.role, orgName,
            ...(resolved.groupId ? { groupId: resolved.groupId, groupName: resolved.groupName || '' } : {}),
            step: 'awaiting_contact', createdAt: new Date().toISOString(),
          });
          const roleWord = resolved.role === 'teacher' ? 'преподаватель' : 'ученик';
          const groupLine = resolved.groupName ? `\nГруппа: <b>${resolved.groupName}</b>` : '';
          await sendTg(
            `👋 Добро пожаловать!\n\nВы вступаете в <b>${orgName}</b> как <b>${roleWord}</b>.${groupLine}\nПоделитесь номером телефона, чтобы создать аккаунт 👇`,
            { keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
          );
          return { statusCode: 200, body: 'OK' };
        }

        // Account-linking code (existing users linking notifications).
        if (payloadArg) {
          const linkResult = await resolveTelegramLinkCode(payloadArg);
          if (linkResult && linkResult.orgId) {
            await adminDb.collection('users').doc(linkResult.userId).update({
              telegramChatId: String(chatId),
              telegramLinkedAt: new Date().toISOString(),
            });
            await reply('✅ <b>Аккаунт привязан!</b>\n\nТеперь вы будете получать уведомления об оценках, домашних заданиях и оплатах прямо сюда.\n\nЧтобы отвязать — напишите /unlink');
            return { statusCode: 200, body: 'OK' };
          }
          await reply('❌ Код недействителен или истёк. Попробуйте получить новый код в приложении SabakHub.');
          return { statusCode: 200, body: 'OK' };
        }

        // /start with no payload — returning linked users get a login button.
        const known = await adminDb.collection('users').where('telegramChatId', '==', String(chatId)).limit(1).get();
        if (!known.empty) {
          await sendLoginButton(known.docs[0].id, 'С возвращением! 👋 Нажмите, чтобы войти в SabakHub:');
          return { statusCode: 200, body: 'OK' };
        }
        await reply('Здравствуйте! Я бот SabakHub. Чтобы зарегистрироваться в учебном центре, откройте ссылку-приглашение, которую вам прислали.');
        return { statusCode: 200, body: 'OK' };
      }

      // (c) /login — quick passwordless login for linked users.
      if (text === '/login') {
        const known = await adminDb.collection('users').where('telegramChatId', '==', String(chatId)).limit(1).get();
        if (!known.empty) {
          await sendLoginButton(known.docs[0].id, 'Нажмите, чтобы войти в SabakHub:');
        } else {
          await reply('Ваш Telegram пока не привязан к аккаунту. Откройте ссылку-приглашение от вашего центра.');
        }
        return { statusCode: 200, body: 'OK' };
      }

      if (text === '/unlink') {
        const usersSnap = await adminDb.collection('users').where('telegramChatId', '==', String(chatId)).limit(1).get();
        if (!usersSnap.empty) {
          await usersSnap.docs[0].ref.update({ telegramChatId: '', telegramLinkedAt: '' });
          await reply('🔓 Telegram отвязан. Вы больше не будете получать уведомления.');
        } else {
          await reply('Ваш аккаунт не привязан к системе.');
        }
        return { statusCode: 200, body: 'OK' };
      }

      // Ignore all other messages on global bot
      return { statusCode: 200, body: 'OK' };
    }

    // ─── CUSTOM ORG AI BOT BEHAVIOR ───
    const orgId = queryOrgId!;
    const settingsSnap = await adminDb.collection('organizationAIManager').doc(orgId).get();
    const settingsData = settingsSnap.data() || { isActive: false };

    if (text.startsWith('/start')) {
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
      .filter(c => c.status === 'published')
      .map(c => `- ${c.title}${c.price ? ` (Price: ${c.price})` : ''}: ${c.description || ''}`);
    const branches = branchesSnap.docs.map(d => {
      const b = d.data();
      return `- ${b.name}: ${b.address || ''} ${b.phone ? `(${b.phone})` : ''}`;
    });

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
    
    const isFirstMessage = history.length === 1;

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
Provide formatted text for Telegram. Do not use Markdown unsupported by Telegram HTML (use <b>bold</b>, <i>italic</i>, etc.). Do NOT output raw generic JSON or code blocks.`;

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
    const selectedModel = 'gemini-2.5-flash';

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

    const geminiRequestBody: any = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: toolDeclarations,
      tool_config: { function_calling_config: { mode: 'AUTO' } },
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    };

    console.log('[TG-Webhook] Sending to Gemini, model:', selectedModel, 'contents length:', contents.length);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequestBody),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('[TG-Webhook] Gemini API error:', geminiResponse.status, errText);
      await reply('Извините, произошла техническая ошибка. Пожалуйста, повторите позже.');
      return { statusCode: 200, body: 'OK' };
    }

    const geminiData: any = await geminiResponse.json();
    const candidateParts = geminiData.candidates?.[0]?.content?.parts || [];
    
    console.log('[TG-Webhook] Gemini response parts:', JSON.stringify(candidateParts.map((p: any) => ({
      hasText: !!p.text,
      hasFunctionCall: !!p.functionCall,
      functionName: p.functionCall?.name,
    }))));

    let responseText = '';
    const functionCallPart = candidateParts.find((p: any) => p.functionCall);
    
    if (functionCallPart?.functionCall?.name === 'addLeadToDatabase') {
       const args = functionCallPart.functionCall.args || {};
       console.log('[TG-Webhook] Function call detected! Args:', JSON.stringify(args));

       // Step 1: Execute the function — save the lead to Firestore
       try {
         await adminDb.collection('organizations').doc(orgId).collection('aiLeads').add({
            name: args.name || 'Unknown',
            phone: args.phone || 'Unknown',
            reason: args.reason || '',
            source: 'telegram_bot',
            status: 'new',
            telegramChatId: String(chatId),
            createdAt: new Date().toISOString()
         });
         console.log('[TG-Webhook] Lead saved successfully for org:', orgId);
         
         const notifMessage = `У вас новая заявка через Telegram бота!\n\n` +
                         `👤 Имя: ${args.name}\n` +
                         `📞 Телефон: ${args.phone}\n` +
                         `${args.reason ? `🎯 Цель: ${args.reason}` : ''}`;
         await notifyOrgAdmins(orgId, 'new_lead', '📩 Новая заявка', notifMessage, '/leads');
       } catch (dbErr: any) {
         console.error('[TG-Webhook] Failed to save lead:', dbErr);
       }

       // Step 2: Send functionResponse back to Gemini to get a natural reply
       const functionResponseContents = [
         ...contents,
         // The model's turn that contained the function call
         { role: 'model', parts: [{ functionCall: functionCallPart.functionCall }] },
         // Our function result
         { role: 'function', parts: [{ functionResponse: {
           name: 'addLeadToDatabase',
           response: { success: true, message: 'Lead has been saved. The manager will contact the client soon.' }
         }}] }
       ];

       try {
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
           console.log('[TG-Webhook] Follow-up response received:', responseText.substring(0, 100));
         }
       } catch (e) {
         console.warn('[TG-Webhook] Follow-up call failed (non-fatal):', e);
       }

       // Fallback if the follow-up didn't produce text
       if (!responseText) {
         responseText = 'Отлично! Я записал ваши данные. Наш менеджер свяжется с вами в ближайшее время! 🙌';
       }
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
