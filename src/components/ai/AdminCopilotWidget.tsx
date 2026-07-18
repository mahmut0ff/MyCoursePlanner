/**
 * AdminCopilotWidget — floating AI assistant for org staff (bottom-right FAB).
 *
 * Talks to api-ai-assistant: the model answers questions by running read tools
 * server-side, and proposes write actions that render here as confirmation
 * cards — nothing is changed until the user presses «Выполнить». Destructive
 * actions (deletes) get a red confirm. The tool set is already filtered by the
 * caller's RBAC on the server; suggestion chips adapt to it too.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, X, Send, Loader2, RotateCcw, Check, AlertTriangle, Trash2,
  UserPlus, Users, BookOpen, CalendarPlus, CalendarX, Banknote, ArrowRightLeft,
  Pencil, Wand2, ShieldAlert, Lock, Paperclip,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import {
  apiAssistantChat, apiAssistantExecute, apiAssistantCapabilities,
  apiAssistantImportParse, apiAssistantImportCommit,
} from '../../lib/api';
import ImportPreviewCard, { type ImportPlan, type ImportResult } from './ImportPreviewCard';

type ActionStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'error';

interface ActionItem {
  tool: string;
  args: any;
  summary: string;
  danger: boolean;
  status: ActionStatus;
  resultMessage?: string;
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ActionItem[];
  thumbs?: string[];          // data-URL previews of attached screenshots (user turn)
  importPlan?: ImportPlan;    // screenshot-import preview (assistant turn)
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create_student: UserPlus,
  bulk_create_students: UserPlus,
  create_teacher: UserPlus,
  update_student: Pencil,
  update_group: Users,
  create_group: Users,
  move_to_group: ArrowRightLeft,
  move_to_branch: ArrowRightLeft,
  create_course: BookOpen,
  update_course: BookOpen,
  create_event: CalendarPlus,
  delete_event: CalendarX,
  record_payment: Banknote,
  delete_members: Trash2,
  delete_group: Trash2,
  delete_course: Trash2,
};

/** Minimal markdown: **bold** + line breaks (matches the model's instructed format). */
const MarkdownLite: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('\n').map((line, i, arr) => (
      <span key={i}>
        {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>
        )}
        {i < arr.length - 1 && <br />}
      </span>
    ))}
  </>
);

/** History serialization for the model: executed/cancelled actions become text. */
function serialize(messages: Msg[]): Array<{ role: string; content: string }> {
  return messages.map(m => {
    let content = m.content;
    for (const a of m.actions || []) {
      const state =
        a.status === 'done' ? `Выполнено${a.resultMessage ? `: ${a.resultMessage}` : ''}`
        : a.status === 'cancelled' ? 'Отменено пользователем'
        : a.status === 'error' ? `Ошибка: ${a.resultMessage || ''}`
        : 'Ожидает подтверждения';
      content += `\n[Действие ${a.tool} ${JSON.stringify(a.args)} — ${state}]`;
    }
    return { role: m.role, content };
  }).filter(m => m.content.trim());
}

/** Localized result line from an execute response (best-effort). */
function resultLine(tool: string, result: any, t: (k: string, o?: any) => string): string {
  if (!result || typeof result !== 'object') return '';
  const skipped = (n: any) => (n ? `, ${t('assistant.resultSkipped', { count: n, defaultValue: 'пропущено {{count}}' })}` : '');
  if (tool === 'bulk_create_students' && result.created !== undefined) {
    return t('assistant.resultCreated', { count: result.created, defaultValue: 'создано {{count}}' }) + skipped(result.skipped);
  }
  if (tool === 'delete_members' && result.deleted !== undefined) {
    return t('assistant.resultDeleted', { count: result.deleted, defaultValue: 'удалено {{count}}' }) + skipped(result.skipped);
  }
  if (result.moved !== undefined) {
    return t('assistant.resultMoved', { count: result.moved, defaultValue: 'переведено {{count}}' });
  }
  return '';
}

// ── Screenshot import: attach + client-side downscale ──
const MAX_IMPORT_IMAGES = 6;
const MAX_IMAGE_DIM = 1600;   // keep OCR legible while staying under the body limit

interface PendingImage { id: string; dataUrl: string; mimeType: string; data: string }

/** Downscale to ≤MAX_IMAGE_DIM and re-encode as JPEG so several screenshots fit
 *  in one request body (Netlify functions cap the payload at a few MB). */
function compressImage(file: File): Promise<PendingImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas context')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      resolve({
        id: `img${Math.random().toString(36).slice(2)}`,
        dataUrl,
        mimeType: 'image/jpeg',
        data: dataUrl.split(',')[1] || '',
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

const AdminCopilotWidget: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { organizationId, isSuperAdmin } = useAuth();
  const { canRead, loaded: permsLoaded } = usePermissions();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [caps, setCaps] = useState<{ tools: Array<{ name: string }>; aiEnabled: boolean } | null>(null);
  const [planLocked, setPlanLocked] = useState(false);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [attaching, setAttaching] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gated on the `ai` grant rather than a role list, so this follows RBAC like every
  // other module: admins always pass, managers hold it by default (revocable on
  // /team), and teachers/students hold it only if an admin deliberately grants it.
  // Waiting for `permsLoaded` keeps the button from flashing in before the grants
  // that would hide it have arrived.
  const visible = !isSuperAdmin && !!organizationId && organizationId !== 'personal'
    && permsLoaded && canRead('ai');

  // Capabilities (for chips + plan gate) — once, on first open.
  useEffect(() => {
    if (!open || caps) return;
    apiAssistantCapabilities()
      .then((res: any) => {
        setCaps(res);
        if (res && res.aiEnabled === false) setPlanLocked(true);
      })
      .catch(() => setCaps({ tools: [], aiEnabled: true }));
  }, [open, caps]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, loading]);

  // Focus management + a lightweight focus trap for the dialog. On open we move
  // focus into the input (the FAB that had focus unmounts); Tab cycles within
  // the panel; Escape closes; on close we restore focus to the FAB.
  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(focusable).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      // Restore focus to the trigger when the dialog closes.
      fabRef.current?.focus();
    };
  }, [open]);

  // Screenshot import path: OCR the attached images into an editable preview.
  const runImport = useCallback(async (hint: string) => {
    const imgs = images;
    setImages([]);
    setMessages(prev => [...prev, {
      id: `u${Date.now()}`, role: 'user', content: hint, thumbs: imgs.map(i => i.dataUrl),
    }]);
    setLoading(true);
    try {
      const res: any = await apiAssistantImportParse(
        imgs.map(i => ({ mimeType: i.mimeType, data: i.data })), hint, i18n.language,
      );
      const hasRows = (res?.groups?.length || 0) + (res?.ungrouped?.length || 0) > 0;
      setMessages(prev => [...prev, hasRows
        ? { id: `a${Date.now()}`, role: 'assistant', content: '', importPlan: res as ImportPlan }
        : { id: `a${Date.now()}`, role: 'assistant',
            content: t('assistant.import.empty', 'Не удалось распознать студентов на изображении. Попробуйте более чёткий или крупный скриншот.') },
      ]);
    } catch (err: any) {
      if (err?.code === 'plan') setPlanLocked(true);
      setMessages(prev => [...prev, {
        id: `a${Date.now()}`, role: 'assistant',
        content: `⚠️ ${err?.message || t('assistant.error', 'Не удалось получить ответ. Попробуйте ещё раз.')}`,
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [images, i18n.language, t]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (loading) return;
    if (images.length > 0) { setInput(''); await runImport(trimmed); return; }
    if (!trimmed) return;
    setInput('');
    const userMsg: Msg = { id: `u${Date.now()}`, role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);
    try {
      const res: any = await apiAssistantChat(serialize(next), i18n.language);
      setMessages(prev => [...prev, {
        id: `a${Date.now()}`,
        role: 'assistant',
        content: res.reply || '',
        actions: (res.actions || []).map((a: any) => ({ ...a, status: 'pending' as ActionStatus })),
      }]);
    } catch (err: any) {
      if (err?.code === 'plan') setPlanLocked(true);
      setMessages(prev => [...prev, {
        id: `a${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${err?.message || t('assistant.error', 'Не удалось получить ответ. Попробуйте ещё раз.')}`,
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, loading, i18n.language, t, images, runImport]);

  // Compress + queue picked screenshots (capped at MAX_IMPORT_IMAGES).
  const pickImages = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setAttaching(true);
    try {
      const room = Math.max(0, MAX_IMPORT_IMAGES - images.length);
      const chosen = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, room);
      const done = await Promise.all(chosen.map(f => compressImage(f).catch(() => null)));
      const ok = done.filter((x): x is PendingImage => !!x);
      if (ok.length) setImages(prev => [...prev, ...ok].slice(0, MAX_IMPORT_IMAGES));
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [images]);

  const runCommit = useCallback((payload: any): Promise<ImportResult> => apiAssistantImportCommit(payload), []);

  const setAction = (msgId: string, idx: number, patch: Partial<ActionItem>) => {
    setMessages(prev => prev.map(m => m.id !== msgId ? m : {
      ...m,
      actions: (m.actions || []).map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  };

  const execute = async (msgId: string, idx: number, action: ActionItem) => {
    setAction(msgId, idx, { status: 'running' });
    try {
      const res: any = await apiAssistantExecute(action.tool, action.args);
      if (res.success) {
        setAction(msgId, idx, { status: 'done', resultMessage: resultLine(action.tool, res.result, t) });
      } else {
        // Business refusal (e.g. schedule conflict) — show the reason, keep it re-askable via chat.
        const conflictNote = res.conflicts?.length
          ? ` ${t('assistant.conflictHint', 'Скажите «создай принудительно», если нужно всё равно.')}`
          : '';
        setAction(msgId, idx, { status: 'error', resultMessage: `${res.message || ''}${conflictNote}` });
      }
    } catch (err: any) {
      setAction(msgId, idx, { status: 'error', resultMessage: err?.message || 'Ошибка' });
    }
  };

  if (!visible) return null;

  const has = (tool: string) => !caps || caps.tools.some(x => x.name === tool);
  const chips: string[] = [
    ...(has('dashboard_stats') ? [t('assistant.chipStats', 'Сколько у нас студентов?')] : []),
    ...(has('list_payment_plans') ? [t('assistant.chipDebtors', 'Покажи должников')] : []),
    ...(has('get_schedule') ? [t('assistant.chipSchedule', 'Расписание на сегодня')] : []),
    ...(has('create_student') ? [t('assistant.chipAddStudent', 'Добавь нового студента')] : []),
  ];

  return (
    <>
      {/* ── FAB ── */}
      {!open && (
        <button
          ref={fabRef}
          onClick={() => setOpen(true)}
          className="fixed right-5 z-[60] w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg shadow-primary-600/30 hover:shadow-xl hover:shadow-primary-600/40 flex items-center justify-center transition-all active:scale-95"
          style={{ bottom: 'calc(1.25rem + var(--safe-area-bottom, 0px))' }}
          aria-label={t('assistant.open', 'Открыть AI-ассистента')}
          title={t('assistant.title', 'AI-ассистент')}
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* ── Panel ── */}
      {open && (
        <div
          ref={panelRef}
          className="fixed z-[60] inset-x-0 bottom-0 sm:inset-x-auto sm:right-5 sm:bottom-5 w-full sm:w-[420px] h-[85dvh] sm:h-[640px] sm:max-h-[82dvh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('assistant.title', 'AI-ассистент')}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary-600/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-tight">
                  {t('assistant.title', 'AI-ассистент')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {t('assistant.subtitle', 'Управление центром командами')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setImages([]); }}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title={t('assistant.clear', 'Очистить диалог')}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label={t('assistant.close', 'Закрыть')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Plan lock */}
          {planLocked ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center bg-slate-50 dark:bg-slate-900/50">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {t('assistant.planTitle', 'AI-ассистент доступен на тарифе Professional')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[260px]">
                {t('assistant.planText', 'Управляйте студентами, группами и финансами простыми командами в чате.')}
              </p>
              <Link to="/billing" className="btn-primary text-sm mt-2" onClick={() => setOpen(false)}>
                {t('assistant.planCta', 'Перейти к тарифам')}
              </Link>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-900/50">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center text-center gap-2 pt-10 px-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary-600/10 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                      <Wand2 className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t('assistant.greeting', 'Чем помочь?')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px]">
                      {t('assistant.greetingHint', 'Ищите и добавляйте студентов, управляйте группами, расписанием и оплатами — просто напишите, что сделать.')}
                    </p>
                  </div>
                )}

                {messages.map(msg => {
                  // Screenshot-import preview spans the full width of the thread.
                  if (msg.importPlan) {
                    return (
                      <div key={msg.id} className="w-full">
                        <ImportPreviewCard plan={msg.importPlan} onImport={runCommit} onCancel={() => {}} />
                      </div>
                    );
                  }
                  return (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      {msg.thumbs && msg.thumbs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {msg.thumbs.map((src, i) => (
                            <img
                              key={i}
                              src={src}
                              alt=""
                              className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                            />
                          ))}
                        </div>
                      )}
                      {msg.content && (
                        <div className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
                          msg.role === 'user'
                            ? 'bg-primary-600 text-white rounded-br-md'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-md shadow-sm'
                        }`}>
                          <MarkdownLite text={msg.content} />
                        </div>
                      )}

                      {/* Action confirmation cards */}
                      {(msg.actions || []).map((a, idx) => {
                        const Icon = TOOL_ICONS[a.tool] || Wand2;
                        return (
                          <div
                            key={idx}
                            className={`rounded-xl border p-3 bg-white dark:bg-slate-800 shadow-sm ${
                              a.danger
                                ? 'border-red-200 dark:border-red-800/50'
                                : 'border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                a.danger
                                  ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                  : 'bg-primary-600/10 text-primary-600 dark:text-primary-400'
                              }`}>
                                {a.danger ? <ShieldAlert className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">{a.summary}</p>

                                {a.status === 'pending' && (
                                  <div className="flex items-center gap-2 mt-2.5">
                                    <button
                                      onClick={() => execute(msg.id, idx, a)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all active:scale-[0.98] ${
                                        a.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
                                      }`}
                                    >
                                      {a.danger
                                        ? t('assistant.executeDanger', 'Да, удалить')
                                        : t('assistant.execute', 'Выполнить')}
                                    </button>
                                    <button
                                      onClick={() => setAction(msg.id, idx, { status: 'cancelled' })}
                                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                    >
                                      {t('assistant.cancel', 'Отмена')}
                                    </button>
                                  </div>
                                )}

                                {a.status === 'running' && (
                                  <p className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    {t('assistant.running', 'Выполняю…')}
                                  </p>
                                )}
                                {a.status === 'done' && (
                                  <p className="flex items-center gap-1.5 mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    <Check className="w-3.5 h-3.5" />
                                    {t('assistant.done', 'Выполнено')}{a.resultMessage ? ` — ${a.resultMessage}` : ''}
                                  </p>
                                )}
                                {a.status === 'cancelled' && (
                                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                                    {t('assistant.cancelled', 'Отменено')}
                                  </p>
                                )}
                                {a.status === 'error' && (
                                  <p className="flex items-start gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                                    <span className="break-words">{a.resultMessage || t('assistant.error', 'Ошибка')}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-md px-3.5 py-3 shadow-sm flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Chips + input */}
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shrink-0">
                {messages.length === 0 && !loading && chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {chips.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => send(q)}
                        className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-slate-600 dark:text-slate-300 hover:text-primary-700 dark:hover:text-primary-400 border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 px-3 py-1.5 rounded-full transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                {/* Attached screenshots (pending import) */}
                {(images.length > 0 || attaching) && (
                  <div className="flex flex-wrap gap-2 mb-2.5">
                    {images.map(img => (
                      <div key={img.id} className="relative w-14 h-14">
                        <img src={img.dataUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                        <button
                          onClick={() => setImages(prev => prev.filter(x => x.id !== img.id))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 hover:bg-slate-900 text-white flex items-center justify-center shadow"
                          aria-label={t('assistant.import.remove', 'Убрать')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {attaching && (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => pickImages(e.target.files)}
                />

                <div className="flex items-end gap-1.5">
                  {has('bulk_create_students') && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading || images.length >= MAX_IMPORT_IMAGES}
                      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label={t('assistant.import.attach', 'Прикрепить скриншот')}
                      title={t('assistant.import.attachHint', 'Импорт студентов со скриншота списка')}
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                  )}
                  <div className="relative flex-1">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                      placeholder={images.length > 0
                        ? t('assistant.import.hintPh', 'Комментарий к импорту (необязательно)…')
                        : t('assistant.placeholder', 'Например: добавь студента Иванов Иван…')}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full pl-4 pr-11 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      disabled={loading}
                    />
                    <button
                      onClick={() => send(input)}
                      disabled={(!input.trim() && images.length === 0) || loading}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-full transition-colors"
                      aria-label={t('assistant.send', 'Отправить')}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 mt-1.5">
                  {t('assistant.disclaimer', 'ИИ может ошибаться — проверяйте действия перед подтверждением.')}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default AdminCopilotWidget;
