import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Paperclip, Send, X, FileText, Loader2 } from 'lucide-react';
import type { MessageAttachment, ChatMessage } from '../../types';
import { uploadChatAttachment, CHAT_MAX_FILE_SIZE } from '../../lib/useChat';
import { useCopilotVisible } from '../ai/useCopilotVisible';

interface Props {
  organizationId: string;
  roomId: string;
  disabled?: boolean;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (text: string, attachments: MessageAttachment[], replyTo: ChatMessage | null) => Promise<void>;
  onTyping?: () => void;
  placeholder?: string;
}

interface Pending {
  key: string;
  progress: number;
}

export default function ChatComposer({
  organizationId, roomId, disabled, replyTo, onCancelReply, onSend, onTyping, placeholder,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Смена комнаты обнуляет черновик: иначе набранное для одного собеседника
  // уезжает другому.
  useEffect(() => { setText(''); setAttachments([]); }, [roomId]);

  // Растём вместе с текстом, но не настолько, чтобы композер съел переписку.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.size > CHAT_MAX_FILE_SIZE) {
        toast.error(t('chat.fileTooLarge', 'Файл «{{name}}» больше 25 МБ', { name: file.name }));
        continue;
      }
      const key = `${file.name}_${file.size}_${Math.random().toString(36).slice(2, 8)}`;
      setPending((p) => [...p, { key, progress: 0 }]);
      try {
        const uploaded = await uploadChatAttachment(organizationId, roomId, file, (percent) => {
          setPending((p) => p.map((x) => (x.key === key ? { ...x, progress: percent } : x)));
        });
        setAttachments((a) => [...a, uploaded]);
      } catch (e: any) {
        toast.error(e?.message || t('chat.uploadFailed', 'Не удалось загрузить файл'));
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
      await onSend(text.trim(), attachments, replyTo);
      setText('');
      setAttachments([]);
      onCancelReply();
    } catch (e: any) {
      toast.error(e?.message || t('chat.sendFailed', 'Не удалось отправить сообщение'));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  // AI-копилот — это fixed-кнопка в правом нижнем углу на z-[60], ровно там же,
  // где на полноэкранном чате оказывается «Отправить». Резервируем её место,
  // пока она на экране (та же поправка, что и в композере поддержки).
  const copilotVisible = useCopilotVisible();

  return (
    <div className={`relative border-t border-slate-200 dark:border-slate-700
      bg-white dark:bg-slate-900 pl-3 py-2.5 ${copilotVisible ? 'pr-[5.5rem]' : 'pr-3'}`}>

      {replyTo && (
        <div className="flex items-start gap-2 mb-2 px-2.5 py-1.5 rounded-lg
          bg-slate-100 dark:bg-slate-800 text-xs">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-primary-600 dark:text-primary-400">
              {t('chat.replyingTo', 'Ответ для {{name}}', { name: replyTo.senderName || '' })}
            </div>
            <div className="truncate text-slate-500 dark:text-slate-400">
              {replyTo.text || t('chat.attachment', 'Вложение')}
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
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          title={t('chat.attach', 'Прикрепить файл')}
          className="p-2.5 rounded-lg text-slate-400 hover:text-primary-600
            hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <textarea
          ref={textRef}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => { setText(e.target.value); onTyping?.(); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('chat.placeholder', 'Напишите сообщение…')}
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
          title={t('chat.send', 'Отправить')}
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
