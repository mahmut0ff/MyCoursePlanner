import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Paperclip, Send, X, FileText, Zap, Loader2 } from 'lucide-react';
import type { MessageAttachment, SupportMessage } from '../../types';
import { SUPPORT_QUICK_REPLIES, filterQuickReplies } from '../../lib/supportQuickReplies';
import { uploadSupportAttachment, SUPPORT_MAX_FILE_SIZE } from '../../lib/useSupport';

interface Props {
  /** Thread owner's uid — the Storage folder attachments go into. */
  uploadUserId: string;
  disabled?: boolean;
  replyTo: SupportMessage | null;
  onCancelReply: () => void;
  onSend: (text: string, attachments: MessageAttachment[], replyToId?: string) => Promise<void>;
  onTyping?: () => void;
  /** Canned replies are an operator tool — off on the user-facing page. */
  enableQuickReplies?: boolean;
  placeholder?: string;
}

interface Pending {
  key: string;
  file: File;
  progress: number;
}

export default function SupportComposer({
  uploadUserId, disabled, replyTo, onCancelReply, onSend, onTyping,
  enableQuickReplies = false, placeholder,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const quickReplies = useMemo(() => SUPPORT_QUICK_REPLIES.map((q) => ({
    id: q.id,
    shortcut: q.shortcut,
    title: t(`support.quick.${q.id}.title`, q.titleRu),
    body: t(`support.quick.${q.id}.body`, q.bodyRu),
  })), [t]);

  // The picker serves two entry points that share one filtered list: the «/»
  // prefix typed into the field, and the lightning button (no filter).
  const visible = useMemo(
    () => (slashQuery !== null ? filterQuickReplies(quickReplies, slashQuery) : quickReplies),
    [quickReplies, slashQuery],
  );
  const menuOpen = enableQuickReplies && (pickerOpen || (slashQuery !== null && visible.length > 0));

  useEffect(() => { setHighlight(0); }, [slashQuery, pickerOpen]);

  // Grow with the content, but stop before the composer eats the transcript.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleChange = (value: string) => {
    setText(value);
    onTyping?.();
    // Only a «/» in the very first column opens the picker — a slash mid-sentence
    // (a URL, a date, «и/или») must stay ordinary text.
    if (enableQuickReplies && value.startsWith('/') && !value.includes('\n')) {
      setSlashQuery(value.slice(1));
    } else {
      setSlashQuery(null);
    }
  };

  const applyQuickReply = useCallback((body: string) => {
    // A «/…» token is a command, so it is replaced; anything else the operator
    // already typed is preserved and the template is appended to it.
    setText((prev) => (prev.startsWith('/') ? body : prev ? `${prev}\n${body}` : body));
    setSlashQuery(null);
    setPickerOpen(false);
    requestAnimationFrame(() => textRef.current?.focus());
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.size > SUPPORT_MAX_FILE_SIZE) {
        toast.error(t('support.fileTooLarge', 'Файл «{{name}}» больше 50 МБ', { name: file.name }));
        continue;
      }
      const key = `${file.name}_${file.size}_${Math.random().toString(36).slice(2, 8)}`;
      setPending((p) => [...p, { key, file, progress: 0 }]);
      try {
        const uploaded = await uploadSupportAttachment(uploadUserId, file, (percent) => {
          setPending((p) => p.map((x) => (x.key === key ? { ...x, progress: percent } : x)));
        });
        setAttachments((a) => [...a, uploaded]);
      } catch (e: any) {
        toast.error(e?.message || t('support.uploadFailed', 'Не удалось загрузить файл'));
      } finally {
        setPending((p) => p.filter((x) => x.key !== key));
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const canSend = !sending && !pending.length && (!!text.trim() || !!attachments.length);

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(text.trim(), attachments, replyTo?.id);
      setText('');
      setAttachments([]);
      setSlashQuery(null);
      onCancelReply();
    } catch (e: any) {
      toast.error(e?.message || t('support.sendFailed', 'Не удалось отправить сообщение'));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % visible.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + visible.length) % visible.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (visible[highlight]) { e.preventDefault(); applyQuickReply(visible[highlight].body); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); setSlashQuery(null); setPickerOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div className="relative border-t border-slate-200 dark:border-slate-700
      bg-white dark:bg-slate-900 px-3 py-2.5">

      {menuOpen && (
        <>
          {/* Click-away target; the panel below sits above it. */}
          <div className="fixed inset-0 z-10" onClick={() => { setPickerOpen(false); setSlashQuery(null); }} />
          <div className="absolute bottom-full left-3 right-3 mb-2 z-20 max-h-72 overflow-y-auto
            rounded-xl border border-slate-200 dark:border-slate-700
            bg-white dark:bg-slate-800 shadow-lg">
            <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide
              text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
              {t('support.quickReplies', 'Быстрые ответы')}
              <span className="ml-1.5 normal-case tracking-normal text-slate-400">
                {t('support.quickRepliesHint', '↑↓ выбрать · Enter вставить')}
              </span>
            </div>
            {visible.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-400">
                {t('support.quickRepliesEmpty', 'Ничего не найдено')}
              </div>
            ) : visible.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => applyQuickReply(q.body)}
                className={`w-full text-left px-3 py-2 border-b border-slate-100 dark:border-slate-700/50
                  last:border-b-0 transition-colors ${i === highlight
                    ? 'bg-primary-50 dark:bg-primary-900/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{q.title}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded
                    bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                    /{q.shortcut}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{q.body}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {replyTo && (
        <div className="flex items-start gap-2 mb-2 px-2.5 py-1.5 rounded-lg
          bg-slate-100 dark:bg-slate-800 text-xs">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-primary-600 dark:text-primary-400">
              {t('support.replyingTo', 'Ответ для {{name}}', { name: replyTo.senderName })}
            </div>
            <div className="truncate text-slate-500 dark:text-slate-400">
              {replyTo.text || t('support.attachment', 'Вложение')}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title={t('common.cancel', 'Отмена')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {(!!attachments.length || !!pending.length) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att) => (
            <div key={att.id} className="relative group">
              {att.type === 'image' ? (
                <img src={att.url} alt={att.fileName}
                  className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
              ) : (
                <div className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg
                  border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1">
                  <FileText className="w-5 h-5 text-slate-400" />
                  <span className="text-[9px] text-slate-500 truncate w-full text-center">{att.fileName}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setAttachments((a) => a.filter((x) => x.id !== att.id))}
                className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-slate-700 text-white
                  hover:bg-red-600 transition-colors"
                title={t('common.remove', 'Убрать')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.key}
              className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg
                border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
              <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
              <span className="text-[10px] text-slate-500">{p.progress}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          title={t('support.attach', 'Прикрепить файл')}
          className="p-2.5 rounded-lg text-slate-400 hover:text-primary-600
            hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {enableQuickReplies && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPickerOpen((v) => !v)}
            title={t('support.quickRepliesTitle', 'Быстрые ответы (или введите «/»)')}
            className={`p-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              pickerOpen
                ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/40'
                : 'text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <Zap className="w-5 h-5" />
          </button>
        )}

        <textarea
          ref={textRef}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('support.placeholder', 'Напишите сообщение…')}
          className="flex-1 resize-none rounded-xl border border-slate-300 dark:border-slate-600
            bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm leading-5
            text-slate-900 dark:text-slate-100 placeholder:text-slate-400
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
            disabled:opacity-50 transition-all"
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSend || disabled}
          title={t('support.send', 'Отправить')}
          className="p-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700
            active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed
            disabled:hover:bg-primary-600"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
