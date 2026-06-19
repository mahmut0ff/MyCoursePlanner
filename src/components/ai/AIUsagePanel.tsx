import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Activity, Gauge } from 'lucide-react';

const FEATURE_LABELS: Record<string, string> = {
  insights_ask: 'AI-аналитик',
  insights_churn: 'Анализ оттока',
  tutor: 'AI-репетитор',
  practice: 'Тренировки',
  explain: 'Разбор ошибок',
  studyplan: 'Планы обучения',
  speaking: 'Разговорный партнёр',
  generate_quiz: 'Генерация викторин',
  generate_exam: 'Генерация экзаменов',
  generate_lesson_and_quiz: 'Конструктор уроков',
  generate_syllabus_extraction: 'Импорт силлабуса',
  generate_material_summary: 'Анализ материалов',
  generate_lesson_assist: 'Помощник урока',
  generate_report_comment: 'Комментарии в табель',
  generate_marketing_post: 'Маркетинг',
  generate_translate: 'Переводы',
};

const PALETTE = ['bg-violet-500', 'bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500', 'bg-pink-500'];

const AIUsagePanel: React.FC = () => {
  const { organizationId } = useAuth();
  const [total, setTotal] = useState(0);
  const [features, setFeatures] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

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

  const rows = Object.entries(features)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  const monthLabel = new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Использование AI</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{monthLabel}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{total}</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">запросов</p>
        </div>
      </div>

      {!loaded ? (
        <div className="h-20 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin dark:border-slate-700" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">В этом месяце AI ещё не использовался.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(([key, value], i) => (
            <div key={key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-600 dark:text-slate-300 truncate pr-2">{FEATURE_LABELS[key] || key}</span>
                <span className="font-semibold text-slate-900 dark:text-white shrink-0">{value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full ${PALETTE[i % PALETTE.length]}`} style={{ width: `${Math.max(6, Math.round((value / max) * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AIUsagePanel;
