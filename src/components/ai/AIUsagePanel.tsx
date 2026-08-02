import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { aiFeatureLabel } from '../../lib/aiFeatureLabels';

const VISIBLE_ROWS = 6;

/**
 * Month-to-date readout of what the AI actually did for the org.
 * Ranked ledger, not a chart: the bar is the row's own background, so the list
 * stays legible at a glance and needs no colour key.
 */
const AIUsagePanel: React.FC = () => {
  const { organizationId } = useAuth();
  const [total, setTotal] = useState(0);
  const [features, setFeatures] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!organizationId) { setLoaded(true); return; }
    const period = new Date().toISOString().slice(0, 7);
    const ref = doc(db, 'organizations', organizationId, 'aiUsage', period);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as { total?: number; features?: Record<string, number> } | undefined;
      setTotal(data?.total || 0);
      setFeatures(data?.features || {});
      setLoaded(true);
    }, () => setLoaded(true));
    return () => unsub();
  }, [organizationId]);

  const rows = useMemo(
    () => Object.entries(features)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ key, value, label: aiFeatureLabel(key) }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ru')),
    [features],
  );

  const max = rows.length ? rows[0].value : 1;
  const shown = expanded ? rows : rows.slice(0, VISIBLE_ROWS);
  const hidden = rows.length - shown.length;
  const monthLabel = new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  return (
    <section
      aria-labelledby="ai-usage-heading"
      className="h-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ai-usage-heading" className="font-semibold text-slate-900 dark:text-white">Что делал ИИ</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 first-letter:uppercase">{monthLabel}</p>
        </div>
        <p className="shrink-0 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
          <span className="text-slate-900 dark:text-white font-semibold">{total}</span>{' '}
          {plural(total, 'запрос', 'запроса', 'запросов')}
        </p>
      </div>

      {!loaded ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          {[70, 52, 38].map((w) => (
            <div key={w} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          В этом месяце ИИ ещё не работал. Задайте вопрос аналитику слева — это самый быстрый способ начать.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-1 flex-1">
            {shown.map((row) => (
              <li key={row.key} className="relative flex items-center justify-between gap-3 h-8 px-2 rounded-lg overflow-hidden">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded-lg bg-primary-500/10 dark:bg-primary-400/15"
                  style={{ width: `${Math.max(8, Math.round((row.value / max) * 100))}%` }}
                />
                <span className="relative truncate text-sm text-slate-700 dark:text-slate-200">{row.label}</span>
                <span className="relative shrink-0 text-sm font-semibold text-slate-900 dark:text-white tabular-nums">{row.value}</span>
              </li>
            ))}
          </ul>

          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1 self-start inline-flex items-center min-h-[36px] px-2 -ml-2 rounded-lg text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              Ещё {hidden} {plural(hidden, 'функция', 'функции', 'функций')}
            </button>
          )}
        </>
      )}
    </section>
  );
};

/** Russian numeric agreement — "1 запрос / 2 запроса / 5 запросов". */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export default AIUsagePanel;
