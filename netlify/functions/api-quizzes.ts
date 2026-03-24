/**
 * API: Quizzes — CRUD, search, filtering, sharing for quiz library.
 *
 * GET    /api-quizzes              → list quizzes (with filters/sort)
 * GET    /api-quizzes?id=          → get single quiz + questions
 * POST   /api-quizzes              → create quiz / duplicate / publish / share
 * PUT    /api-quizzes              → update quiz
 * DELETE /api-quizzes?id=          → delete quiz + questions
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, badRequest, forbidden, notFound, jsonResponse } from './utils/auth';

const QUIZZES = 'quizzes';
const SHARES = 'quizShares';

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // ─── GET ───
  if (event.httpMethod === 'GET') {
    try {
    // Single quiz by ID
    if (params.id) {
      const doc = await adminDb.collection(QUIZZES).doc(params.id).get();
      if (!doc.exists) return notFound('Quiz not found');
      const quiz = { id: doc.id, ...doc.data() };

      // Load questions
      const qSnap = await adminDb.collection(QUIZZES).doc(params.id).collection('questions').orderBy('order').get();
      const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return ok({ quiz, questions });
    }

    // List quizzes with filters
    let ref: FirebaseFirestore.Query = adminDb.collection(QUIZZES);

    // Tab filtering
    const tab = params.tab || 'my';
    if (tab === 'my') {
      ref = ref.where('authorId', '==', user.uid);
    } else if (tab === 'shared') {
      // Get quiz IDs shared with this user
      const sharesSnap = await adminDb.collection(SHARES)
        .where('targetUserId', '==', user.uid).get();
      const orgSharesSnap = user.organizationId
        ? await adminDb.collection(SHARES)
            .where('shareType', '==', 'organization')
            .where('targetOrganizationId', '==', user.organizationId).get()
        : null;
      const platformSharesSnap = await adminDb.collection(SHARES)
        .where('shareType', '==', 'platform').get();

      const sharedQuizIds = new Set<string>();
      sharesSnap.docs.forEach(d => sharedQuizIds.add(d.data().quizId));
      orgSharesSnap?.docs.forEach(d => sharedQuizIds.add(d.data().quizId));
      platformSharesSnap.docs.forEach(d => sharedQuizIds.add(d.data().quizId));

      // Also include quizzes with visibility: platform or organization
      const visibleSnap = await adminDb.collection(QUIZZES)
        .where('visibility', 'in', ['platform', 'public']).get();
      visibleSnap.docs.forEach(d => sharedQuizIds.add(d.id));

      if (user.organizationId) {
        const orgSnap = await adminDb.collection(QUIZZES)
          .where('visibility', '==', 'organization')
          .where('organizationId', '==', user.organizationId).get();
        orgSnap.docs.forEach(d => sharedQuizIds.add(d.id));
      }

      // Remove own quizzes from shared
      const ids = Array.from(sharedQuizIds);
      if (ids.length === 0) return ok([]);

      // Fetch in batches of 10 (Firestore 'in' limit)
      const quizzes: any[] = [];
      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        const snap = await adminDb.collection(QUIZZES).where('__name__', 'in', batch).get();
        snap.docs.forEach(d => {
          if (d.data().authorId !== user.uid) {
            quizzes.push({ id: d.id, ...d.data() });
          }
        });
      }
      return ok(quizzes);
    } else if (tab === 'discover') {
      ref = ref.where('visibility', 'in', ['platform', 'public']);
      ref = ref.where('status', '==', 'published');
    }

    // Filters
    if (params.subject) ref = ref.where('subject', '==', params.subject);
    if (params.difficulty) ref = ref.where('difficulty', '==', params.difficulty);
    if (params.status && tab === 'my') ref = ref.where('status', '==', params.status);
    if (params.visibility && tab === 'my') ref = ref.where('visibility', '==', params.visibility);

    // Sort
    const sortBy = params.sortBy || 'createdAt';
    const sortDir = (params.sortDir === 'asc' ? 'asc' : 'desc') as FirebaseFirestore.OrderByDirection;
    if (['createdAt', 'updatedAt', 'timesPlayed', 'rating'].includes(sortBy)) {
      ref = ref.orderBy(sortBy, sortDir);
    } else {
      ref = ref.orderBy('createdAt', 'desc');
    }

    // Limit
    const limit = Math.min(parseInt(params.limit || '50'), 100);
    ref = ref.limit(limit);

    const snap = await ref.get();
    const quizzes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Client-side text search (Firestore doesn't support full-text)
    let results = quizzes;
    if (params.search) {
      const s = params.search.toLowerCase();
      results = results.filter((q: any) =>
        q.title?.toLowerCase().includes(s) ||
        q.description?.toLowerCase().includes(s) ||
        q.tags?.some((t: string) => t.toLowerCase().includes(s))
      );
    }

    return ok(results);
    } catch (err: any) {
      console.error('api-quizzes GET error:', err);
      // Firestore missing index errors include helpful URLs
      const msg = err?.message || 'Internal error';
      if (msg.includes('index') || msg.includes('FAILED_PRECONDITION')) {
        return jsonResponse(500, { error: 'Firestore index required. Check server logs for the index creation link.' });
      }
      return jsonResponse(500, { error: msg });
    }
  }

  // ─── POST ───
  if (event.httpMethod === 'POST') {
    if (!hasRole(user, 'admin', 'teacher')) return forbidden();

    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    // Duplicate / Fork quiz
    if (action === 'duplicate') {
      const sourceId = body.quizId;
      if (!sourceId) return badRequest('quizId required');
      const sourceDoc = await adminDb.collection(QUIZZES).doc(sourceId).get();
      if (!sourceDoc.exists) return notFound('Source quiz not found');
      const source = sourceDoc.data()!;

      // Load questions
      const qSnap = await adminDb.collection(QUIZZES).doc(sourceId).collection('questions').orderBy('order').get();

      // Create new quiz
      const newQuiz = {
        ...source,
        title: `${source.title} (Copy)`,
        status: 'draft',
        visibility: 'private',
        authorId: user.uid,
        authorName: user.displayName,
        organizationId: user.organizationId || null,
        forkedFromId: sourceId,
        originalAuthorId: source.originalAuthorId || source.authorId,
        originalAuthorName: source.originalAuthorName || source.authorName,
        timesPlayed: 0,
        avgScore: 0,
        rating: 0,
        ratingCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const newRef = await adminDb.collection(QUIZZES).add(newQuiz);

      // Copy questions
      for (const qDoc of qSnap.docs) {
        const qData = qDoc.data();
        const newQId = generateId();
        await adminDb.collection(QUIZZES).doc(newRef.id).collection('questions').doc(newQId).set({
          ...qData,
          id: newQId,
          quizId: newRef.id,
        });
      }

      return ok({ id: newRef.id, ...newQuiz });
    }

    // Publish / Unpublish / Archive
    if (action === 'publish' || action === 'unpublish' || action === 'archive') {
      const quizId = body.quizId;
      if (!quizId) return badRequest('quizId required');
      const statusMap: Record<string, string> = {
        publish: 'published',
        unpublish: 'draft',
        archive: 'archived',
      };
      await adminDb.collection(QUIZZES).doc(quizId).update({
        status: statusMap[action],
        updatedAt: new Date().toISOString(),
      });
      return ok({ status: statusMap[action] });
    }

    // Share quiz
    if (action === 'share') {
      const { quizId, shareType, targetOrganizationId, targetUserId, targetUserName, permissions } = body;
      if (!quizId || !shareType) return badRequest('quizId and shareType required');

      const quizDoc = await adminDb.collection(QUIZZES).doc(quizId).get();
      if (!quizDoc.exists) return notFound('Quiz not found');

      const shareData = {
        quizId,
        quizTitle: quizDoc.data()!.title,
        sharedByUserId: user.uid,
        sharedByUserName: user.displayName,
        shareType,
        targetOrganizationId: targetOrganizationId || null,
        targetUserId: targetUserId || null,
        targetUserName: targetUserName || null,
        permissions: permissions || 'copy',
        createdAt: new Date().toISOString(),
      };

      const shareRef = await adminDb.collection(SHARES).add(shareData);

      // Update quiz visibility if sharing to platform
      if (shareType === 'platform') {
        await adminDb.collection(QUIZZES).doc(quizId).update({ visibility: 'platform' });
      } else if (shareType === 'organization' && targetOrganizationId) {
        const currentVis = quizDoc.data()!.visibility;
        if (currentVis === 'private') {
          await adminDb.collection(QUIZZES).doc(quizId).update({ visibility: 'organization' });
        }
      }

      return ok({ id: shareRef.id, ...shareData });
    }

    // Save questions
    if (action === 'saveQuestions') {
      const { quizId, questions } = body;
      if (!quizId || !questions) return badRequest('quizId and questions required');

      // Delete existing questions
      const existing = await adminDb.collection(QUIZZES).doc(quizId).collection('questions').get();
      const batch1 = adminDb.batch();
      existing.docs.forEach(d => batch1.delete(d.ref));
      await batch1.commit();

      // Write new questions
      const batch2 = adminDb.batch();
      for (const q of questions) {
        const qId = q.id || generateId();
        const ref = adminDb.collection(QUIZZES).doc(quizId).collection('questions').doc(qId);
        batch2.set(ref, { ...q, id: qId, quizId });
      }
      await batch2.commit();

      // Update question count
      await adminDb.collection(QUIZZES).doc(quizId).update({
        questionCount: questions.length,
        updatedAt: new Date().toISOString(),
      });

      return ok({ questionCount: questions.length });
    }

    // Create quiz
    const quizData = {
      title: body.title || 'Untitled Quiz',
      subtitle: body.subtitle || '',
      description: body.description || '',
      coverImageUrl: body.coverImageUrl || '',
      tags: body.tags || [],
      subject: body.subject || '',
      category: body.category || '',
      difficulty: body.difficulty || 'medium',
      estimatedMinutes: body.estimatedMinutes || 10,
      language: body.language || 'ru',
      visibility: body.visibility || 'private',
      status: body.status || 'draft',
      questionCount: 0,
      authorId: user.uid,
      authorName: user.displayName,
      organizationId: user.organizationId || null,
      forkedFromId: null,
      originalAuthorId: null,
      originalAuthorName: null,
      timesPlayed: 0,
      avgScore: 0,
      rating: 0,
      ratingCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await adminDb.collection(QUIZZES).add(quizData);
    return ok({ id: ref.id, ...quizData });
  }

  // ─── PUT ───
  if (event.httpMethod === 'PUT') {
    if (!hasRole(user, 'admin', 'teacher')) return forbidden();
    const body = JSON.parse(event.body || '{}');
    const { id, ...updates } = body;
    if (!id) return badRequest('id required');

    // Verify ownership
    const doc = await adminDb.collection(QUIZZES).doc(id).get();
    if (!doc.exists) return notFound('Quiz not found');
    if (doc.data()!.authorId !== user.uid && user.role !== 'super_admin') {
      return forbidden();
    }

    const allowed = [
      'title', 'subtitle', 'description', 'coverImageUrl', 'tags',
      'subject', 'category', 'difficulty', 'estimatedMinutes', 'language',
      'visibility', 'status',
    ];
    const safeUpdates: any = { updatedAt: new Date().toISOString() };
    for (const k of allowed) {
      if (updates[k] !== undefined) safeUpdates[k] = updates[k];
    }

    await adminDb.collection(QUIZZES).doc(id).update(safeUpdates);
    return ok({ id, ...safeUpdates });
  }

  // ─── DELETE ───
  if (event.httpMethod === 'DELETE') {
    if (!hasRole(user, 'admin', 'teacher')) return forbidden();
    const id = params.id;
    if (!id) return badRequest('id required');

    const doc = await adminDb.collection(QUIZZES).doc(id).get();
    if (!doc.exists) return notFound('Quiz not found');
    if (doc.data()!.authorId !== user.uid && user.role !== 'super_admin') {
      return forbidden();
    }

    // Delete questions subcollection
    const qSnap = await adminDb.collection(QUIZZES).doc(id).collection('questions').get();
    const batch = adminDb.batch();
    qSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    // Delete shares related to this quiz
    const sharesSnap = await adminDb.collection(SHARES).where('quizId', '==', id).get();
    const batch2 = adminDb.batch();
    sharesSnap.docs.forEach(d => batch2.delete(d.ref));
    await batch2.commit();

    // Delete quiz
    await adminDb.collection(QUIZZES).doc(id).delete();
    return ok({ deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
