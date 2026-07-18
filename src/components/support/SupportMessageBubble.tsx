import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CornerUpLeft, Trash2, FileText, Download } from 'lucide-react';
import type { SupportMessage, SupportSide, MessageAttachment } from '../../types';

interface Props {
  message: SupportMessage;
  /** Which side the viewer is on — decides left/right alignment, not the sender's identity. */
  viewerSide: SupportSide;
  onReply: (message: SupportMessage) => void;
  onDelete: (message: SupportMessage) => void;
  /** Super admins moderate any message; everyone else may only retract their own. */
  canDeleteAny: boolean;
  onOpenImage: (attachment: MessageAttachment) => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SupportMessageBubble({
  message, viewerSide, onReply, onDelete, canDeleteAny, onOpenImage,
}: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const isMine = message.senderSide === viewerSide;

  // A deleted message keeps its slot as a tombstone. Removing the bubble
  // outright would silently reflow the conversation and make a reply that
  // quotes it look like it answered nothing.
  if (message.deletedAt) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm italic
          text-slate-400 dark:text-slate-500 border border-dashed
          border-slate-300 dark:border-slate-600">
          {t('support.messageDeleted', 'Сообщение удалено')}
        </div>
      </div>
    );
  }

  const canDelete = canDeleteAny || isMine;

  return (
    <div className={`group flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {/* Actions sit outside the bubble on the side it grows away from, so they
          never overlap the text at any bubble width. */}
      {isMine && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100
          focus-within:opacity-100 transition-opacity">
          {canDelete && (
            <button
              type="button"
              onClick={() => (confirming ? onDelete(message) : setConfirming(true))}
              onBlur={() => setConfirming(false)}
              title={confirming ? t('support.confirmDelete', 'Нажмите ещё раз для удаления') : t('common.delete', 'Удалить')}
              className={`p-1.5 rounded-lg transition-colors ${confirming
                ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300'
                : 'text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onReply(message)}
            title={t('support.reply', 'Ответить')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600
              hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="max-w-[80%] min-w-0">
        {!isMine && (
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-0.5 px-1">
            {message.senderName}
          </div>
        )}

        <div className={`rounded-2xl px-3.5 py-2.5 text-sm break-words shadow-sm ${isMine
          ? 'bg-primary-600 text-white rounded-br-md'
          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-md'}`}
        >
          {message.replyTo && (
            <div className={`mb-2 pl-2 border-l-2 rounded-r text-xs py-1 ${isMine
              ? 'border-white/50 bg-white/10 text-white/80'
              : 'border-primary-400 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400'}`}
            >
              <div className="font-medium">{message.replyTo.senderName}</div>
              <div className="line-clamp-2">{message.replyTo.text}</div>
            </div>
          )}

          {!!message.attachments?.length && (
            <div className="space-y-1.5 mb-1.5">
              {message.attachments.map((att) => {
                if (att.type === 'image') {
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => onOpenImage(att)}
                      className="block rounded-lg overflow-hidden max-w-[260px]
                        focus:outline-none focus:ring-2 focus:ring-primary-400"
                    >
                      <img
                        src={att.url}
                        alt={att.fileName}
                        loading="lazy"
                        className="w-full h-auto max-h-64 object-cover hover:opacity-90 transition-opacity"
                      />
                    </button>
                  );
                }
                if (att.type === 'video') {
                  return (
                    <video
                      key={att.id}
                      src={att.url}
                      controls
                      preload="metadata"
                      className="rounded-lg max-w-[260px] max-h-64 bg-black"
                    />
                  );
                }
                return (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 max-w-[260px] transition-colors ${isMine
                      ? 'bg-white/15 hover:bg-white/25'
                      : 'bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{att.fileName}</span>
                      <span className="block text-[10px] opacity-70">{formatSize(att.fileSize)}</span>
                    </span>
                    <Download className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  </a>
                );
              })}
            </div>
          )}

          {!!message.text && <div className="whitespace-pre-wrap">{message.text}</div>}

          <div className={`text-[10px] mt-1 text-right ${isMine ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
            {formatTime(message.createdAt)}
          </div>
        </div>
      </div>

      {!isMine && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100
          focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onReply(message)}
            title={t('support.reply', 'Ответить')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600
              hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => (confirming ? onDelete(message) : setConfirming(true))}
              onBlur={() => setConfirming(false)}
              title={confirming ? t('support.confirmDelete', 'Нажмите ещё раз для удаления') : t('common.delete', 'Удалить')}
              className={`p-1.5 rounded-lg transition-colors ${confirming
                ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300'
                : 'text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Lightweight lightbox — the shared FileViewerModal is document-oriented. */
export function SupportImageLightbox({ attachment, onClose }: { attachment: MessageAttachment; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
        {attachment.type === 'video'
          ? <video src={attachment.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />
          : <img src={attachment.url} alt={attachment.fileName} className="max-w-full max-h-[85vh] rounded-lg object-contain" />}
        <div className="mt-3 flex items-center justify-between gap-4 text-white/80 text-sm">
          <span className="truncate">{attachment.fileName}</span>
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 shrink-0 hover:text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{formatSize(attachment.fileSize)}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
