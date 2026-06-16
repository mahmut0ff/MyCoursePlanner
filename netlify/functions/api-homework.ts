/**
 * API: Homework
 * Handles student submission, teacher grading, and AI auto-grading.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, can, forbidden, ok, unauthorized, badRequest, notFound, jsonResponse } from './utils/auth';
import { createNotification, notifyOrgAdmins } from './utils/notifications';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { GoogleGenerativeAI } from '@google/generative-ai';

const COLLECTION = 'homework_submissions';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  // Rate limit: 60 write requests per minute per user
  const rlKey = getRateLimitKey(event, user.uid);
  if (rateLimiters.write.isLimited(rlKey)) {
    return jsonResponse(429, { error: 'Too many requests. Please wait a moment.' });
  }
  const pathSegments = event.path.split('/').filter(Boolean);
  const action = pathSegments[pathSegments.length - 1];
  const params = event.queryStringParameters || {};

  // GET: Read homeworks (Teacher or Student)
  if (event.httpMethod === 'GET') {
    if (params.lessonId) {
      if (user.role === 'student' && !params.orgId) {
        // Student sees own submission
        const snap = await adminDb.collection(COLLECTION)
          .where('lessonId', '==', params.lessonId)
          .where('studentId', '==', user.uid)
          .limit(1)
          .get();
        if (snap.empty) return ok({ _empty: true });
        return ok({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        // Teacher/Admin sees all submissions for a lesson in org
        const snap = await adminDb.collection(COLLECTION)
          .where('lessonId', '==', params.lessonId)
          .where('organizationId', '==', params.orgId || '')
          .get();
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        docs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        return ok(docs);
      }
    }
    
    // Org wide submissions for review page
    if (params.orgId) {
      const snap = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', params.orgId)
        .get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      docs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return ok(docs);
    }
    // Student's own submissions across all lessons
    if (params.mySubmissions === 'true') {
      const snap = await adminDb.collection(COLLECTION)
        .where('studentId', '==', user.uid)
        .get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      docs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      return ok(docs);
    }
    
    return badRequest('lessonId, orgId, or mySubmissions required');
  }

  // POST: Add submission (root POST with no sub-path action)
  if (event.httpMethod === 'POST' && (action === 'api-homework' || pathSegments.length <= 3)) {
    const body = JSON.parse(event.body || '{}');
    if (!body.lessonId || !body.content || !body.organizationId) return badRequest('Missing fields');

    // Make sure we only have 1 submission for this user+lesson. If exists, update instead.
    const existSnap = await adminDb.collection(COLLECTION)
        .where('lessonId', '==', body.lessonId)
        .where('studentId', '==', user.uid)
        .limit(1)
        .get();
        
    const data = {
      lessonId: body.lessonId,
      lessonTitle: body.lessonTitle || 'Unknown Lesson',
      studentId: user.uid,
      studentName: user.displayName,
      organizationId: body.organizationId,
      content: body.content,
      attachments: body.attachments || [],
      status: 'pending',
      submittedAt: new Date().toISOString(),
      maxPoints: body.maxPoints || 10
    };

    if (!existSnap.empty) {
      const docRef = existSnap.docs[0].ref;
      await docRef.update(data);
      // Notify teachers about re-submission
      notifyOrgAdmins(
        body.organizationId, 'homework_submitted',
        'Домашнее задание обновлено',
        `${user.displayName} обновил(а) ДЗ: ${body.lessonTitle || 'Урок'}`,
        `/lessons/${body.lessonId}`,
      ).catch(() => {});
      return ok({ id: docRef.id, ...data });
    } else {
      const ref = await adminDb.collection(COLLECTION).add(data);
      // Notify teachers about new submission
      notifyOrgAdmins(
        body.organizationId, 'homework_submitted',
        'Новое домашнее задание',
        `${user.displayName} сдал(а) ДЗ: ${body.lessonTitle || 'Урок'}`,
        `/lessons/${body.lessonId}`,
      ).catch(() => {});
      return ok({ id: ref.id, ...data });
    }
  }

  // PUT: Teacher grades homework manually
  if (event.httpMethod === 'PUT' && pathSegments.length > 2 && action === 'grade') {
    if (!isStaff(user) || !can(user, 'homework', 'write')) return forbidden('Недостаточно прав для этого действия');
    const id = pathSegments[pathSegments.length - 2];
    const body = JSON.parse(event.body || '{}');

    const hwDoc = await adminDb.collection(COLLECTION).doc(id).get();
    const hwData = hwDoc.data();

    await adminDb.collection(COLLECTION).doc(id).update({
      status: 'graded',
      finalScore: body.finalScore || 0,
      teacherFeedback: body.feedback || '',
      gradedAt: new Date().toISOString(),
      gradedBy: user.uid
    });

    // Notify the student that their homework was graded
    if (hwData?.studentId) {
      createNotification({
        recipientId: hwData.studentId,
        type: 'homework_graded',
        title: 'Домашнее задание оценено',
        message: `Ваше ДЗ "${hwData.lessonTitle || 'Урок'}" оценено: ${body.finalScore || 0} баллов${body.feedback ? `. ${body.feedback}` : ''}`,
        link: `/lessons/${hwData.lessonId}`,
        organizationId: hwData.organizationId,
      }).catch(() => {});
    }
    
    return ok({ success: true });
  }

  // PUT: Update homework status
  if (event.httpMethod === 'PUT' && pathSegments.length > 2 && action === 'status') {
    if (!isStaff(user) || !can(user, 'homework', 'write')) return forbidden('Недостаточно прав для этого действия');
    const id = pathSegments[pathSegments.length - 2];
    const body = JSON.parse(event.body || '{}');

    await adminDb.collection(COLLECTION).doc(id).update({
      status: body.status || 'pending',
      updatedAt: new Date().toISOString()
    });
    
    return ok({ success: true });
  }

  // POST: AI Autograde & Plagiarism Check
  if (event.httpMethod === 'POST' && pathSegments.length > 2 && action === 'ai-grade') {
    const id = pathSegments[pathSegments.length - 2];
    
    const docSnap = await adminDb.collection(COLLECTION).doc(id).get();
    if (!docSnap.exists) return notFound('Submission not found');
    const submission = docSnap.data();

    // Ownership: staff/teachers can check any submission; a student only their own.
    if (!isStaff(user) && user.role !== 'teacher' && submission?.studentId !== user.uid) {
      return forbidden('You can only run AI analysis on your own submission');
    }

    // We should ideally fetch the actual lesson assignment details. 
    // Usually it resides in `lessons` collection.
    let assignmentDesc = 'Unknown task.';
    try {
      const lessonSnap = await adminDb.collection('lessons').doc(submission?.lessonId).get();
      if (lessonSnap.exists) {
        const h = lessonSnap.data()?.homework;
        if (h) assignmentDesc = `${h.title}: ${h.description}`;
      }
    } catch (e) {}

    const maxPoints = submission?.maxPoints || 10;

    // Collect image/PDF attachments so the AI can OCR photographed/scanned work.
    const attachments: any[] = Array.isArray((submission as any)?.attachments) ? (submission as any).attachments : [];
    const isPdf = (a: any) => a?.type === 'document' && /\.pdf($|\?)/i.test(`${a.url || ''} ${a.name || ''}`);
    const readable = attachments.filter(a => a?.url && (a.type === 'image' || isPdf(a))).slice(0, 4);

    const mediaParts: any[] = [];
    const MAX_FILE_BYTES = 8 * 1024 * 1024;    // skip a single file larger than 8MB
    const MAX_TOTAL_BYTES = 16 * 1024 * 1024;  // overall inline cap (Gemini request limit ~20MB)
    let totalBytes = 0;
    for (const att of readable) {
      try {
        const resp = await fetch(att.url);
        if (!resp.ok) continue;
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length > MAX_FILE_BYTES) continue;
        if (totalBytes + buf.length > MAX_TOTAL_BYTES) break;
        totalBytes += buf.length;
        const mimeType = resp.headers.get('content-type') || (isPdf(att) ? 'application/pdf' : 'image/jpeg');
        mediaParts.push({ inlineData: { data: buf.toString('base64'), mimeType } });
      } catch { /* skip unreadable attachment */ }
    }

    const hasMedia = mediaParts.length > 0;
    const hasText = !!(submission?.content && submission.content.trim());

    const prompt = `Ты — ассистент опытного преподавателя языковой школы. Проверь письменную работу студента по заданию и дай развёрнутый конструктивный разбор с акцентом на язык: грамматику, лексику, орфографию, структуру и связность.

Задание:
"""
${assignmentDesc}
"""

Работа студента (текст):
"""
${submission?.content || '(текста нет)'}
"""
${hasMedia ? `\nК работе приложено файлов (фото/скан/PDF): ${mediaParts.length}. Считай текст с приложенных изображений/документов${hasText ? ' и объедини его с текстом выше' : ' — это и есть работа студента'}, затем проверяй грамматику по распознанному тексту.\n` : ''}
Максимальный балл: ${maxPoints}

Верни СТРОГО валидный JSON в таком формате:
{
  "grade": число (сколько баллов из ${maxPoints}, можно дробное, ставь частичные баллы),
  "summary": "1-2 предложения — общая оценка работы",
  "strengths": ["плюсы — что студент сделал хорошо, конкретно"],
  "weaknesses": ["минусы — что стоит улучшить, конкретно"],
  "grammarIssues": [
    { "fragment": "точная цитата ошибочного фрагмента из работы", "correction": "исправленный вариант", "explanation": "кратко: почему так правильно" }
  ],
  "suggestions": "Дружелюбный итоговый комментарий студенту: что доработать и как."
}

Правила:
- Пиши summary, strengths, weaknesses, explanation и suggestions по-русски. Цитаты "fragment" и "correction" приводи на языке оригинала работы.
- Если грамматических ошибок нет, верни "grammarIssues": [].
- Если приложены фото и текст на них не читается (плохое качество/почерк), честно укажи это в summary и не выдумывай содержимое.
- Если работы нет (ни текста, ни читаемых файлов), поставь низкий балл и объясни это в summary.
- Не оборачивай JSON в markdown. Только чистый JSON.`;

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2048 },
      });
      const result = await model.generateContent([{ text: prompt }, ...mediaParts]);
      let text = result.response.text().trim();
      if (text.startsWith('```json')) {
         text = text.substring(7, text.length - 3).trim();
      } else if (text.startsWith('```')) {
         text = text.substring(3, text.length - 3).trim();
      }

      let parsed: any = JSON.parse(text);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);

      const aiAnalysis = {
        grade: typeof parsed.grade === 'number' ? parsed.grade : 0,
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        strengths: Array.isArray(parsed.strengths)
          ? parsed.strengths.filter((s: any) => typeof s === 'string')
          : [],
        weaknesses: Array.isArray(parsed.weaknesses)
          ? parsed.weaknesses.filter((s: any) => typeof s === 'string')
          : [],
        grammarIssues: Array.isArray(parsed.grammarIssues)
          ? parsed.grammarIssues
              .filter((g: any) => g && typeof g.fragment === 'string' && typeof g.correction === 'string')
              .map((g: any) => ({
                fragment: g.fragment,
                correction: g.correction,
                explanation: typeof g.explanation === 'string' ? g.explanation : '',
              }))
          : [],
        suggestions: typeof parsed.suggestions === 'string' && parsed.suggestions
          ? parsed.suggestions
          : 'Не удалось сгенерировать комментарий.',
        checkedAt: new Date().toISOString(),
      };

      await adminDb.collection(COLLECTION).doc(id).update({
        aiAnalysis
      });

      return ok(aiAnalysis);
    } catch (err: any) {
      return badRequest('AI Analysis failed: ' + err.message);
    }
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};
