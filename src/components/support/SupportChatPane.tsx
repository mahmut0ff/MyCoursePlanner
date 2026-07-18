import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { LifeBuoy } from 'lucide-react';
import type { SupportMessage, SupportSide, MessageAttachment } from '../../types';
import { useSupportMessages, useSupportTyping, useSupportTypingStatus } from '../../lib/useSupport';
import { apiSupportSend, apiSupportDeleteMessage, apiSupportMarkRead } from '../../lib/api';
import SupportMessageBubble, { SupportImageLightbox } from './SupportMessageBubble';
import SupportComposer from './SupportComposer';

interface Props {
  threadId?: string;
  /** The thread owner's uid — where attachments are stored. Equals threadId. */
  uploadUserId: string;
  viewerSide: SupportSide;
  canDeleteAny: boolean;
  enableQuickReplies?: boolean;
  header?: ReactNode;
  emptyState?: ReactNode;
  composerPlaceholder?: string;
  /** Locks the composer — used for a closed thread on the operator side. */
  composerDisabled?: boolean;
}

export default function SupportChatPane({
  threadId, uploadUserId, viewerSide, canDeleteAny, enableQuickReplies,
  header, emptyState, composerPlaceholder, composerDisabled,
}: Props) {
  const { t } = useTranslation();
  const { messages, loading } = useSupportMessages(threadId);
  const { startTyping } = useSupportTyping(threadId);
  const typingNames = useSupportTypingStatus(threadId);
  const [replyTo, setReplyTo] = useState<SupportMessage | null>(null);
  const [lightbox, setLightbox] = useState<MessageAttachment | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // A reply bar left pointing into the previous conversation would send the
  // quote to the wrong thread.
  useEffect(() => { setReplyTo(null); }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typingNames.length]);

  // Opening a thread clears the viewer's own unread counter. Re-runs when new
  // messages land so a thread read live doesn't re-accumulate a badge.
  useEffect(() => {
    if (!threadId || !messages.length) return;
    apiSupportMarkRead(threadId).catch(() => {});
  }, [threadId, messages.length]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const handleSend = async (text: string, attachments: MessageAttachment[], replyToId?: string) => {
    await apiSupportSend({
      threadId,
      text,
      attachments,
      ...(replyToId ? { replyTo: { messageId: replyToId } } : {}),
    });
  };

  const handleDelete = async (message: SupportMessage) => {
    try {
      await apiSupportDeleteMessage(message.id, threadId);
      toast.success(t('support.messageDeletedToast', 'Сообщение удалено'));
    } catch (e: any) {
      toast.error(e?.message || t('support.deleteFailed', 'Не удалось удалить сообщение'));
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-900/50">
      {header}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                <div className="h-14 w-52 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          emptyState ?? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="p-3 rounded-full bg-primary-50 dark:bg-primary-900/30">
                <LifeBuoy className="w-7 h-7 text-primary-500" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                {t('support.noMessages', 'Здесь пока нет сообщений.')}
              </p>
            </div>
          )
        ) : (
          messages.map((m) => (
            <SupportMessageBubble
              key={m.id}
              message={m}
              viewerSide={viewerSide}
              canDeleteAny={canDeleteAny}
              onReply={setReplyTo}
              onDelete={handleDelete}
              onOpenImage={setLightbox}
            />
          ))
        )}

        {typingNames.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex gap-1 px-3 py-2.5 rounded-2xl rounded-bl-md bg-white dark:bg-slate-800
              border border-slate-200 dark:border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
            </div>
            <span className="text-xs text-slate-400">
              {t('support.typing', '{{name}} печатает…', { name: typingNames[0] })}
            </span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <SupportComposer
        uploadUserId={uploadUserId}
        disabled={composerDisabled}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
        onTyping={startTyping}
        enableQuickReplies={enableQuickReplies}
        placeholder={composerPlaceholder}
      />

      {lightbox && <SupportImageLightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
