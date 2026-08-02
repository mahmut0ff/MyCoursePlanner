import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/OrgContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { AIManagerTab } from '../org-settings/AIManagerTab';
import AIAnalystPanel from '../../components/ai/AIAnalystPanel';
import AIUsagePanel from '../../components/ai/AIUsagePanel';
import MarketingGeneratorModal from '../../components/ai/MarketingGeneratorModal';
import TranslateModal from '../../components/ai/TranslateModal';
import { PLANS } from '../../types';
import {
  Wand2, ClipboardList, FileText, Mic, ScrollText, Inbox, Lock, ArrowRight,
  Bot, ExternalLink, Send, Zap, Globe, Megaphone, TrendingDown, Languages,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   AI-центр. Одна работа на странице — спросить аналитика; всё
   остальное подчинено ей: сводка расхода ИИ рядом и указатель,
   где ещё в системе работает ИИ.
   ───────────────────────────────────────────────────────────── */

type ToolAction = 'navigate' | 'scroll' | 'modal';

interface ToolDef {
  key: string;
  title: string;
  where: string;
  icon: React.ElementType;
  action: ToolAction;
  to?: string;
  scrollTo?: string;
  gated?: boolean;
}

interface ToolGroup {
  id: string;
  label: string;
  tools: ToolDef[];
}

const GROUPS: ToolGroup[] = [
  {
    id: 'management',
    label: 'Управление центром',
    tools: [
      { key: 'churn', title: 'Анализ оттока', where: 'Ученики → В зоне риска', icon: TrendingDown, action: 'navigate', to: '/students?risk=1', gated: true },
      { key: 'marketing', title: 'Пост для соцсетей', where: 'Здесь, в AI-центре', icon: Megaphone, action: 'modal', gated: true },
      { key: 'translate', title: 'Перевод текста', where: 'Здесь, в AI-центре', icon: Languages, action: 'modal', gated: true },
      { key: 'ai-leads', title: 'Заявки от ИИ', where: 'Раздел «Заявки»', icon: Inbox, action: 'navigate', to: '/leads' },
    ],
  },
  {
    id: 'teaching',
    label: 'Преподавание',
    tools: [
      { key: 'lesson-factory', title: 'Конструктор уроков', where: 'Уроки → «AI Конструктор»', icon: Wand2, action: 'navigate', to: '/lessons', gated: true },
      { key: 'quiz-generator', title: 'Генератор викторин', where: 'Викторины → «AI Quiz Generator»', icon: Zap, action: 'navigate', to: '/quiz/library', gated: true },
      { key: 'exam-generator', title: 'Генератор экзаменов', where: 'Экзамены → редактор → «AI»', icon: ClipboardList, action: 'navigate', to: '/exams', gated: true },
      { key: 'exam-feedback', title: 'Проверка работ', where: 'Экзамены → просмотр попытки', icon: FileText, action: 'navigate', to: '/exams', gated: true },
      { key: 'voice-grades', title: 'Голосовые оценки', where: 'Успеваемость → микрофон', icon: Mic, action: 'navigate', to: '/gradebook', gated: true },
      { key: 'syllabus-import', title: 'Импорт силлабуса', where: 'Курсы → конструктор силлабуса', icon: ScrollText, action: 'navigate', to: '/courses', gated: true },
    ],
  },
  {
    id: 'clients',
    label: 'Общение с клиентами',
    tools: [
      { key: 'public-assistant', title: 'Ассистент на сайте', where: 'Ниже на этой странице', icon: Bot, action: 'scroll', scrollTo: 'ai-assistant-manage', gated: true },
      { key: 'telegram', title: 'Telegram-бот', where: 'Настройки → Интеграции', icon: Send, action: 'navigate', to: '/org-settings?tab=integrations', gated: true },
    ],
  },
];

const TOOL_COUNT = GROUPS.reduce((n, g) => n + g.tools.length, 0);

const AIHubPage: React.FC = () => {
  const navigate = useNavigate();
  const { organizationId } = useAuth();
  const { orgData } = useOrg();
  const { canAccess, planId } = usePlanGate();

  const hasAI = canAccess('ai');
  const planName = useMemo(() => PLANS.find(p => p.id === planId)?.name || planId, [planId]);

  const [newLeadCount, setNewLeadCount] = useState(0);
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);

  // Live AI-leads stats (same collection the /leads CRM reads)
  useEffect(() => {
    if (!organizationId) return;
    const q = query(collection(db, 'organizations', organizationId, 'aiLeads'));
    const unsub = onSnapshot(q, (snap) => {
      let fresh = 0;
      snap.forEach((d) => {
        if ((d.data() as { status?: string }).status === 'new') fresh++;
      });
      setNewLeadCount(fresh);
    }, (err) => console.error('AIHub leads error:', err));
    return () => unsub();
  }, [organizationId]);

  const slug = orgData?.slug;

  const handleToolClick = (tool: ToolDef) => {
    if (tool.gated && !hasAI) {
      navigate('/billing');
      return;
    }
    if (tool.action === 'modal') {
      if (tool.key === 'translate') setTranslateOpen(true);
      else setMarketingOpen(true);
      return;
    }
    if (tool.action === 'scroll' && tool.scrollTo) {
      document.getElementById(tool.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (tool.to) navigate(tool.to);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* ── Page header ── */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">AI-центр</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Спросите ИИ о своём центре, посмотрите, что он уже сделал, и настройте помощника для клиентов.
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-2 h-8 px-3 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className={`w-1.5 h-1.5 rounded-full ${hasAI ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden="true" />
          {hasAI ? 'ИИ включён' : 'ИИ выключен'} · тариф «{planName}»
        </span>
      </header>

      {/* ── Upgrade prompt (locked plans) ── */}
      {!hasAI && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30">
          <Lock className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900 dark:text-amber-200">На тарифе «{planName}» ИИ отключён</p>
            <p className="text-sm text-amber-800 dark:text-amber-300/90">
              Аналитик, генераторы, голосовые оценки и ассистент для клиентов откроются после смены тарифа.
            </p>
          </div>
          <button
            onClick={() => navigate('/billing')}
            className="btn-primary shrink-0 inline-flex items-center gap-1.5 text-sm"
          >
            Сменить тариф <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── The job of this page: ask, and see what the AI has been doing ── */}
      {hasAI && (
        <div id="ai-analyst" className="scroll-mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="lg:col-span-2">
            <AIAnalystPanel />
          </div>
          <AIUsagePanel />
        </div>
      )}

      {/* ── Where else the AI works: an index, not a card wall ── */}
      <section aria-labelledby="ai-tools-heading">
        <div className="flex items-baseline gap-2 mb-1">
          <h2 id="ai-tools-heading" className="text-lg font-bold text-slate-900 dark:text-white">Где ещё работает ИИ</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">{TOOL_COUNT} функций</span>
        </div>

        <div className="space-y-6 mt-4">
          {GROUPS.map((group) => (
            <div key={group.id}>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">{group.label}</h3>
              <ul className="mt-1 grid grid-cols-1 md:grid-cols-2 md:gap-x-8">
                {group.tools.map((tool) => {
                  const Icon = tool.icon;
                  const locked = !!tool.gated && !hasAI;
                  const badge = tool.key === 'ai-leads' && newLeadCount > 0 ? newLeadCount : null;
                  return (
                    <li key={tool.key} className="border-t border-slate-200 dark:border-slate-700/70">
                      <button
                        onClick={() => handleToolClick(tool)}
                        className="group w-full flex items-center gap-3 py-2.5 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                      >
                        <Icon
                          className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{tool.title}</span>
                            {badge !== null && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 tabular-nums">
                                {badge} новых
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                            {locked ? 'Недоступно на вашем тарифе' : tool.where}
                          </span>
                        </span>
                        {locked
                          ? <Lock className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-label="Требуется тариф с ИИ" />
                          : <ArrowRight className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all motion-reduce:transform-none" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Public assistant management ── */}
      <section id="ai-assistant-manage" aria-labelledby="ai-assistant-heading" className="scroll-mt-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
          <div>
            <h2 id="ai-assistant-heading" className="text-lg font-bold text-slate-900 dark:text-white">Ассистент для клиентов</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
              Что чат-бот знает о центре и как отвечает посетителям вашего публичного профиля и Telegram.
            </p>
          </div>
          {slug && hasAI && (
            <a
              href={`/org/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <Globe className="w-4 h-4" aria-hidden="true" /> Проверить на сайте
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </div>

        {hasAI ? (
          organizationId ? (
            <AIManagerTab organizationId={organizationId} />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Организация не выбрана.</p>
          )
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
            Чат-бот на публичном профиле, в Telegram и автоматический сбор заявок включаются вместе с ИИ —{' '}
            <button
              onClick={() => navigate('/billing')}
              className="font-medium text-primary-600 dark:text-primary-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            >
              сменить тариф
            </button>.
          </p>
        )}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400 pb-2 max-w-2xl">
        Все функции работают на Google Gemini. Данные обрабатываются по запросу и не используются
        для обучения сторонних моделей.
      </p>

      <MarketingGeneratorModal open={marketingOpen} onClose={() => setMarketingOpen(false)} />
      <TranslateModal open={translateOpen} onClose={() => setTranslateOpen(false)} />
    </div>
  );
};

export default AIHubPage;
