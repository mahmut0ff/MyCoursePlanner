/**
 * API: Homework
 * Handles student submission, teacher grading, and AI auto-grading.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, notFound, jsonResponse } from './utils/auth';
import { createNotification, notifyOrgAdmins } from './utils/notifications';
import { sendTelegramToUser } from './utils/telegram';
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

  // POST: Add submission
  if (event.httpMethod === 'POST' && action === 'api-homework') {
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
        message: `Ваше ДЗ "${hwData.lessonTitle || 'Урок'}" оценено: ${body.finalScore || 0} баллов`,
        link: `/lessons/${hwData.lessonId}`,
      }).catch(() => {});

      // Also notify via Telegram (best-effort)
      if (hwData.organizationId) {
        sendTelegramToUser(
          hwData.organizationId, hwData.studentId,
          `📝 Ваше ДЗ "${hwData.lessonTitle || 'Урок'}" оценено: ${body.finalScore || 0} баллов.\n${body.feedback ? `💬 ${body.feedback}` : ''}`
        ).catch(() => {});
      }
    }
    
    return ok({ success: true });
  }

  // PUT: Update homework status
  if (event.httpMethod === 'PUT' && pathSegments.length > 2 && action === 'status') {
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

    const prompt = `You are a strict but fair Teacher AI Assistant. You need to grade a student's answer based on the assignment description AND detect if it was generated by AI or copy-pasted.
    
Assignment Task:
"""
${assignmentDesc}
"""

Student's Answer:
"""
${submission?.content}
"""

Maximum Points: ${submission?.maxPoints || 10}

Analyze the student's answer. Give your output strictly in valid JSON format:
{
  "grade": number (how many points out of maximum, e.g., if perfect, return the max points. Give partial credits),
  "suggestions": "A friendly feedback message for the student explaining what is good and what is wrong.",
  "isPlagiarism": boolean (true if it sounds heavily like ChatGPT or generic copy-paste text without deep personal insight),
  "plagiarismProbability": number (0-100 percentage likelihood of AI/Plagiarism)
}
No Markdown wrapping in JSON. Just output pure JSON.`;

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      if (text.startsWith('```json')) {
         text = text.substring(7, text.length - 3).trim();
      } else if (text.startsWith('```')) {
         text = text.substring(3, text.length - 3).trim();
      }
      
      const parsed = JSON.parse(text);
      
      const aiAnalysis = {
        grade: parsed.grade || 0,
        suggestions: parsed.suggestions || 'Не удалось сгенерировать комментарий.',
        isPlagiarism: parsed.isPlagiarism || false,
        plagiarismProbability: parsed.plagiarismProbability || 0
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
