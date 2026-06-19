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
import { PLANS } from '../../types';
import {
  Sparkles, Wand2, ClipboardList, FileText, Mic, ScrollText,
  Inbox, Lock, ArrowRight, Cpu, BookOpen, Bot,
  ExternalLink, Send, CheckCircle2, Zap, Globe, ShieldCheck,
  Megaphone, TrendingDown, BarChart3,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   AI-центр — единая страница, где владелец видит весь ИИ-функционал
   организации и управляет им: инструменты для преподавателей,
   публичный AI-ассистент, входящие заявки и статус по тарифу.
   ───────────────────────────────────────────────────────────── */

type ToolAction = 'navigate' | 'scroll' | 'external' | 'modal';

interface ToolDef {
  key: string;
  title: string;
  desc: string;
  where: string;
  icon: React.ElementType;
  accent: string;          // icon tile color classes
  action: ToolAction;
  to?: string;             // route (navigate) / url (external)
  scrollTo?: string;       // element id (scroll)
  gated?: boolean;         // requires AI plan
}

const TOOLS: ToolDef[] = [
  {
    key: 'analyst',
    title: 'AI-аналитик',
    desc: 'Задавайте вопросы о центре простым языком — AI отвечает по вашим финансам, посещаемости и оценкам.',
    where: 'Здесь, в AI-центре',
    icon: BarChart3,
    accent: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    action: 'scroll',
    scrollTo: 'ai-analyst',
    gated: true,
  },
  {
    key: 'churn',
    title: 'AI-анализ оттока',
    desc: 'Кто из учеников может уйти, почему и что сделать — с вероятностью и рекомендацией для менеджера.',
    where: 'Аналитика → Группа риска',
    icon: TrendingDown,
    accent: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    action: 'navigate',
    to: '/risk-dashboard',
    gated: true,
  },
  {
    key: 'marketing',
    title: 'AI-маркетолог',
    desc: 'Готовые посты для Instagram, Telegram и WhatsApp о курсах и акциях в пару кликов.',
    where: 'Здесь, в AI-центре',
    icon: Megaphone,
    accent: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    action: 'modal',
    gated: true,
  },
  {
    key: 'lesson-factory',
    title: 'AI-конструктор уроков',
    desc: 'Из темы или загруженного файла AI собирает готовый урок и тест к нему за один шаг.',
    where: 'Уроки → кнопка «AI Конструктор»',
    icon: Wand2,
    accent: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    action: 'navigate',
    to: '/lessons',
    gated: true,
  },
  {
    key: 'quiz-generator',
    title: 'AI-генератор викторин',
    desc: 'Генерирует интерактивные викторины из текста, PDF или изображения.',
    where: 'Викторины → «AI Quiz Generator»',
    icon: Zap,
    accent: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    action: 'navigate',
    to: '/quiz/library',
    gated: true,
  },
  {
    key: 'exam-generator',
    title: 'AI-генератор экзаменов',
    desc: 'Авто-составление экзаменационных вопросов с вариантами ответов и пояснениями.',
    where: 'Экзамены → редактор → «AI»',
    icon: ClipboardList,
    accent: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
    action: 'navigate',
    to: '/exams',
    gated: true,
  },
  {
    key: 'syllabus-import',
    title: 'AI-импорт силлабуса',
    desc: 'Загрузите PDF силлабуса — AI извлечёт модули и темы и соберёт структуру курса.',
    where: 'Курсы → конструктор силлабуса',
    icon: ScrollText,
    accent: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
    action: 'navigate',
    to: '/courses',
    gated: true,
  },
  {
    key: 'voice-grades',
    title: 'Голосовые оценки',
    desc: 'Преподаватель диктует оценки и посещаемость голосом — AI распознаёт и заполняет журнал.',
    where: 'Успеваемость → иконка микрофона',
    icon: Mic,
    accent: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    action: 'navigate',
    to: '/gradebook',
    gated: true,
  },
  {
    key: 'exam-feedback',
    title: 'AI-проверка работ',
    desc: 'Авто-оценка открытых ответов и развёрнутый вердикт по уровню после публичного теста.',
    where: 'Экзамены → просмотр попытки',
    icon: FileText,
    accent: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    action: 'navigate',
    to: '/exams',
    gated: true,
  },
  {
    key: 'public-assistant',
    title: 'Публичный AI-ассистент',
    desc: 'Чат-бот на вашем публичном профиле и в Telegram отвечает абитуриентам и собирает заявки.',
    where: 'Управление — ниже на этой странице',
    icon: Bot,
    accent: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    action: 'scroll',
    scrollTo: 'ai-assistant-manage',
    gated: true,
  },
  {
    key: 'ai-leads',
    title: 'AI-заявки (CRM)',
    desc: 'Все заявки, собранные AI-ассистентом, ботом и публичными тестами, в одном списке.',
    where: 'Раздел «Заявки»',
    icon: Inbox,
    accent: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    action: 'navigate',
    to: '/leads',
    gated: false,
  },
];

const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent: string;
}> = ({ icon: Icon, label, value, sub, accent }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</p>
        <p className="text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">{value}</p>
      </div>
    </div>
    {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">{sub}</p>}
  </div>
);

const AIHubPage: React.FC = () => {
  const navigate = useNavigate();
  const { organizationId } = useAuth();
  const { orgData } = useOrg();
  const { canAccess, planId } = usePlanGate();

  const hasAI = canAccess('ai');
  const planName = useMemo(() => PLANS.find(p => p.id === planId)?.name || planId, [planId]);

  const [leadCount, setLeadCount] = useState(0);
  const [newLeadCount, setNewLeadCount] = useState(0);
  const [aiLeadCount, setAiLeadCount] = useState(0);
  const [marketingOpen, setMarketingOpen] = useState(false);

  // Live AI-leads stats (same collection the /leads CRM reads)
  useEffect(() => {
    if (!organizationId) return;
    const q = query(collection(db, 'organizations', organizationId, 'aiLeads'));
    const unsub = onSnapshot(q, (snap) => {
      let total = 0, fresh = 0, ai = 0;
      snap.forEach((d) => {
        const data = d.data() as { status?: string; source?: string };
        total++;
        if (data.status === 'new') fresh++;
        if (data.source && data.source !== 'manual') ai++;
      });
      setLeadCount(total);
      setNewLeadCount(fresh);
      setAiLeadCount(ai);
    }, (err) => console.error('AIHub leads error:', err));
    return () => unsub();
  }, [organizationId]);

  const availableTools = TOOLS.filter(t => !t.gated || hasAI).length;
  const slug = orgData?.slug;

  const handleToolClick = (tool: ToolDef) => {
    if (tool.gated && !hasAI) {
      navigate('/billing');
      return;
    }
    if (tool.action === 'modal') {
      setMarketingOpen(true);
      return;
    }
    if (tool.action === 'scroll' && tool.scrollTo) {
      document.getElementById(tool.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (tool.action === 'external' && tool.to) {
      window.open(tool.to, '_blank', 'noopener');
      return;
    }
    if (tool.to) navigate(tool.to);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ── Hero header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white p-6 sm:p-8">
        <div className="absolute -right-8 -top-8 opacity-10">
          <Sparkles className="w-44 h-44" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold">
              <Cpu className="w-3.5 h-3.5" /> Powered by Google Gemini
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-7 h-7" /> AI-центр
          </h1>
          <p className="text-sm sm:text-base text-white/80 mt-2 max-w-2xl">
            Весь искусственный интеллект SabakHub в одном месте: инструменты для преподавателей,
            публичный ассистент для абитуриентов и автоматический сбор заявок.
          </p>
        </div>
      </div>

      {/* ── Upgrade banner (locked plans) ── */}
      {!hasAI && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20">
          <div className="w-10 h-10 shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-900 dark:text-amber-200">AI-функции недоступны на тарифе «{planName}»</p>
            <p className="text-sm text-amber-700 dark:text-amber-300/80">
              Перейдите на тариф с поддержкой AI, чтобы открыть генераторы, голосовые оценки и публичного ассистента.
            </p>
          </div>
          <button
            onClick={() => navigate('/billing')}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
          >
            Сменить тариф <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Inbox}
          label="Заявки от AI"
          value={aiLeadCount}
          sub={`${leadCount} всего · ${newLeadCount} новых`}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          icon={Bot}
          label="AI-ассистент"
          value={hasAI ? 'Доступен' : 'Недоступен'}
          sub={hasAI ? 'Настраивается ниже' : 'Требуется тариф с AI'}
          accent={hasAI
            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-slate-100 text-slate-400 dark:bg-slate-700'}
        />
        <StatCard
          icon={Sparkles}
          label="Инструменты"
          value={`${availableTools} / ${TOOLS.length}`}
          sub="доступно на вашем тарифе"
          accent="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        />
        <StatCard
          icon={ShieldCheck}
          label="Тариф"
          value={planName}
          sub={hasAI ? 'AI включён' : 'AI выключен'}
          accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
        />
      </div>

      {/* ── Owner cockpit: AI analyst + usage ── */}
      {hasAI && (
        <div id="ai-analyst" className="scroll-mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AIAnalystPanel />
          </div>
          <div className="lg:col-span-1">
            <AIUsagePanel />
          </div>
        </div>
      )}

      {/* ── Tools catalog ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI-инструменты</h2>
          <span className="text-xs text-slate-400 font-medium">{TOOLS.length} функций</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const locked = tool.gated && !hasAI;
            return (
              <button
                key={tool.key}
                onClick={() => handleToolClick(tool)}
                className="group relative text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tool.accent}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {locked ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Lock className="w-3 h-3" /> Тариф
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Активно
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{tool.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed flex-1">{tool.desc}</p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate pr-2">{tool.where}</span>
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 group-hover:gap-1.5 transition-all">
                    {locked ? 'Открыть тариф' : tool.action === 'scroll' ? 'Настроить' : 'Открыть'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Public assistant management ── */}
      <div id="ai-assistant-manage" className="scroll-mt-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-500" /> Публичный AI-ассистент
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              База знаний и поведение чат-бота, который отвечает посетителям вашего публичного профиля.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {slug && (
              <a
                href={`/org/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <Globe className="w-4 h-4" /> Открыть профиль <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={() => navigate('/leads')}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <Inbox className="w-4 h-4" /> Заявки
            </button>
          </div>
        </div>

        {hasAI ? (
          organizationId ? (
            <AIManagerTab organizationId={organizationId} />
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center text-slate-500">
              Организация не выбрана.
            </div>
          )
        ) : (
          <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 mx-auto bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Ассистент недоступен на текущем тарифе</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-5">
              Подключите тариф с AI, чтобы активировать чат-бота на публичном профиле, в Telegram
              и автоматический сбор заявок.
            </p>
            <button
              onClick={() => navigate('/billing')}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              Сменить тариф <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Telegram bot pointer ── */}
      {hasAI && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900 dark:text-white">Telegram-бот ассистента</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Подключите собственного бота от @BotFather — ассистент будет отвечать клиентам прямо в Telegram.
            </p>
          </div>
          <button
            onClick={() => navigate('/org-settings?tab=integrations')}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            Настроить <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Footer note ── */}
      <div className="flex items-start gap-2.5 text-xs text-slate-400 dark:text-slate-500 px-1 pb-2">
        <BookOpen className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Все AI-функции работают на базе Google Gemini. Данные обрабатываются по запросу и
          не используются для обучения сторонних моделей. Доступность функций зависит от тарифа организации.
        </p>
      </div>

      <MarketingGeneratorModal open={marketingOpen} onClose={() => setMarketingOpen(false)} />
    </div>
  );
};

export default AIHubPage;
