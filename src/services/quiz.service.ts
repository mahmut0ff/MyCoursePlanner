/**
 * Quiz real-time service — Firestore onSnapshot listeners for live session state.
 */
import { collection, doc, onSnapshot, query, orderBy, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { QuizSession, SessionParticipant, SessionAnswer } from '../types';

const SESSIONS = 'quizSessions';
const QUIZZES = 'quizzes';

/** Subscribe to session state changes (status, current question, etc.) */
export function subscribeToSession(
  sessionId: string,
  callback: (session: QuizSession) => void
): Unsubscribe {
  return onSnapshot(doc(db, SESSIONS, sessionId), (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as unknown as QuizSession);
    }
  });
}

/** Subscribe to participants list (scores, connections) */
export function subscribeToParticipants(
  sessionId: string,
  callback: (participants: SessionParticipant[]) => void
): Unsubscribe {
  const q = query(
    collection(db, SESSIONS, sessionId, 'participants'),
    orderBy('score', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const participants = snap.docs.map((d, i) => ({
      id: d.id,
      ...d.data(),
      rank: i + 1,
    } as unknown as SessionParticipant));
    callback(participants);
  });
}

/** Subscribe to answers for a specific question */
export function subscribeToQuestionAnswers(
  sessionId: string,
  questionId: string,
  callback: (answers: SessionAnswer[]) => void
): Unsubscribe {
  const q = query(
    collection(db, SESSIONS, sessionId, 'answers'),
    orderBy('submittedAt')
  );
  return onSnapshot(q, (snap) => {
    const answers = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as unknown as SessionAnswer))
      .filter(a => a.questionId === questionId);
    callback(answers);
  });
}

/** Subscribe to all answers in a session (for teacher analytics) */
export function subscribeToAllAnswers(
  sessionId: string,
  callback: (answers: SessionAnswer[]) => void
): Unsubscribe {
  const q = query(
    collection(db, SESSIONS, sessionId, 'answers'),
    orderBy('submittedAt')
  );
  return onSnapshot(q, (snap) => {
    const answers = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as unknown as SessionAnswer));
    callback(answers);
  });
}

/** Subscribe to a quiz's questions */
export function subscribeToQuizQuestions(
  quizId: string,
  callback: (questions: any[]) => void
): Unsubscribe {
  const q = query(
    collection(db, QUIZZES, quizId, 'questions'),
    orderBy('order')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
