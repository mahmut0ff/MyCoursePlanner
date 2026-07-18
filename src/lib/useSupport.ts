/**
 * Support desk — realtime client.
 *
 * Follows the house split for live surfaces: reads are Firestore onSnapshot
 * subscriptions gated by firestore.rules, writes go through `api-support`
 * (see lib/api.ts). Nothing here writes a message directly — the server owns
 * `senderSide`, the org/role snapshot and the unread counters.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import type { SupportThread, SupportMessage, MessageAttachment, SupportThreadStatus } from '../types';

/** Mirrors storage.rules for `support/{userId}/…` — reject before the upload. */
export const SUPPORT_MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Classify for the bubble renderer. Storage rules accept a wider set than these
 * three; anything else is still uploadable and renders as a download chip.
 */
function attachmentKind(mimeType: string): MessageAttachment['type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * Upload one attachment to `support/{userId}/…`.
 *
 * `userId` is the thread owner, not the sender — the super admin's replies land
 * in the user's folder so a thread's media stays in one place, which storage
 * rules allow them (and only them) to do.
 */
export function uploadSupportAttachment(
  userId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MessageAttachment> {
  const extension = file.name.split('.').pop() || 'bin';
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${extension}`;
  const task = uploadBytesResumable(ref(storage, `support/${userId}/${fileName}`), file, {
    contentType: file.type || 'application/octet-stream',
  });

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        resolve({
          id: fileName,
          type: attachmentKind(file.type),
          url: await getDownloadURL(task.snapshot.ref),
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });
      },
    );
  });
}

/** The signed-in user's own thread. Absent until they send their first message. */
export function useMySupportThread() {
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) { setThread(null); setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, 'supportThreads', uid),
      (snap) => { setThread(snap.exists() ? ({ id: snap.id, ...snap.data() } as SupportThread) : null); setLoading(false); },
      (err) => { console.warn('[support] thread listener error:', err); setLoading(false); },
    );
    return () => unsub();
  }, [uid]);

  return { thread, loading };
}

/**
 * Every thread, for the super admin inbox, newest first.
 *
 * The status filter is applied client-side rather than as a `where` clause on
 * purpose. Pairing `where('status')` with `orderBy('lastMessageAt')` needs a
 * composite index, and this project deploys neither via its npm scripts nor CI
 * (`--only firestore:rules,storage`) — so that index would silently not exist
 * and the query would throw the moment an operator touched a filter tab.
 *
 * The trade is bounded: one thread per user who has ever written in, so the
 * working set is small, and filtering in memory also makes the tabs instant
 * instead of re-subscribing on every click.
 */
export function useSupportThreads(status?: SupportThreadStatus | 'all', maxLimit = 500) {
  const [all, setAll] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'supportThreads'), orderBy('lastMessageAt', 'desc'), limit(maxLimit)),
      (snap) => {
        setAll(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportThread)));
        setLoading(false);
      },
      (err) => { console.warn('[support] threads listener error:', err); setError(err); setLoading(false); },
    );
    return () => unsub();
  }, [maxLimit]);

  const threads = useMemo(
    () => (!status || status === 'all' ? all : all.filter((th) => th.status === status)),
    [all, status],
  );

  return { threads, loading, error };
}

/** Messages in a thread, oldest-last for rendering. */
export function useSupportMessages(threadId?: string, maxLimit = 200) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!threadId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    // Fetch newest-first so `limit` keeps the RECENT tail, then flip for display.
    const unsub = onSnapshot(
      query(
        collection(db, 'supportThreads', threadId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(maxLimit),
      ),
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportMessage)).reverse());
        setLoading(false);
      },
      (err) => { console.warn('[support] messages listener error:', err); setLoading(false); },
    );
    return () => unsub();
  }, [threadId, maxLimit]);

  return { messages, loading };
}

/**
 * Typing indicator. Unlike messages, these are written straight from the client:
 * they are ephemeral, self-keyed and carry nothing worth spoofing.
 */
export function useSupportTyping(threadId?: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTyping = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !threadId) return;
    const typingRef = doc(db, 'supportThreads', threadId, 'typing', user.uid);
    try {
      await setDoc(typingRef, {
        displayName: user.displayName || user.email || 'User',
        timestamp: serverTimestamp(),
      });
    } catch { /* indicator is cosmetic — never surface a failure */ }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { deleteDoc(typingRef).catch(() => {}); }, 3000);
  }, [threadId]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (uid && threadId) {
        deleteDoc(doc(db, 'supportThreads', threadId, 'typing', uid)).catch(() => {});
      }
    };
  }, [threadId]);

  return { startTyping };
}

/** Display names currently typing in a thread, excluding the viewer. */
export function useSupportTypingStatus(threadId?: string): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!threadId) { setNames([]); return; }
    const unsub = onSnapshot(
      collection(db, 'supportThreads', threadId, 'typing'),
      (snap) => {
        const uid = auth.currentUser?.uid;
        // A stale doc outlives its writer if the tab closed mid-timer; treat
        // anything older than the 3s refresh cycle (plus slack) as gone.
        const cutoff = Date.now() - 6000;
        setNames(snap.docs
          .filter((d) => d.id !== uid)
          .filter((d) => {
            const ts = d.data().timestamp;
            return !ts?.toDate || ts.toDate().getTime() > cutoff;
          })
          .map((d) => d.data().displayName || 'Someone'));
      },
      (err) => console.warn('[support] typing listener error:', err),
    );
    return () => unsub();
  }, [threadId]);

  return names;
}
