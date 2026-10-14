import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CategoryJudging, ContestStatus } from '../lib/contests';

/**
 * Живое состояние конкурса: какие категории открыты, какой проект вызвал
 * ведущий, ревизия данных (растёт на каждой оценке и правке).
 *
 * Основной путь — onSnapshot на contestLive/{id}: изменение приходит сразу и
 * стоит одно чтение. Документ пишет только сервер, оценок и рейтинга в нём нет
 * (правила дают читать его жюри этого конкурса и сотрудникам организации).
 *
 * Если подписка не удалась (например, правила с contestLive ещё не выложены),
 * хук переходит на опрос `fallback` с интервалом `pollMs`, пока вкладка видима.
 */
export interface ContestLiveState {
  status?: ContestStatus;
  rev: number;
  categories: Record<string, { code?: string; name?: string; judging: CategoryJudging; currentParticipantId: string | null; currentSetAt: string | null }>;
}

export function useContestLive(
  contestId: string | null | undefined,
  fallback: () => Promise<ContestLiveState>,
  pollMs = 8000,
): { live: ContestLiveState | null; mode: 'live' | 'poll' | 'idle' } {
  const [live, setLive] = useState<ContestLiveState | null>(null);
  const [mode, setMode] = useState<'live' | 'poll' | 'idle'>('idle');
  const fallbackRef = useRef(fallback);
  useEffect(() => { fallbackRef.current = fallback; });

  useEffect(() => {
    if (!contestId) { setMode('idle'); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const next = await fallbackRef.current();
        if (!cancelled) setLive(next);
      } catch { /* сеть пропала — следующий тик повторит */ }
    };

    const startPolling = () => {
      if (cancelled || timer) return;
      setMode('poll');
      poll();
      timer = setInterval(poll, pollMs);
    };

    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        doc(db, 'contestLive', contestId),
        (snap) => {
          if (cancelled) return;
          const d: any = snap.data();
          if (!d) { startPolling(); return; }
          if (timer) { clearInterval(timer); timer = null; }
          setMode('live');
          setLive({ status: d.status, rev: Number(d.rev) || 0, categories: d.categories || {} });
        },
        () => startPolling(),
      );
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (timer) clearInterval(timer);
    };
  }, [contestId, pollMs]);

  return { live, mode };
}
