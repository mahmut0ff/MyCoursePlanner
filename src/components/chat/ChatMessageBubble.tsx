import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CornerUpLeft, Trash2, FileText, Download } from 'lucide-react';
import type { ChatMessage, MessageAttachment } from '../../types';

interface Props {
  message: ChatMessage;
  /** Свои сообщения — справа. В чате сторона определяется автором, а не ролью. */
  isMine: boolean;
  /** Подпись автора нужна только там, где собеседников больше одного. */
  showSender: boolean;
  /** Модератор организации удаляет любое сообщение; остальные — только своё. */
  canDeleteAny: boolean;
  onReply: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onOpenImage: (attachment: MessageAttachment) => void;
}

/** Firestore отдаёт либо Timestamp, либо ISO-строку — в зависимости от того, дошёл ли serverTimestamp. */
function formatTime(v: any) {
  if (!v) return '';
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatMessageBubble({
  message, isMine, showSender, canDeleteAny, onReply, onDelete, onOpenImage,
}: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  // Удалённое сообщение остаётся «надгробием»: убери пузырь совсем — и ответ,
  // который его цитирует, будет отвечать в пустоту.
  if (message.deletedAt) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm italic
          text-slate-400 dark:text-slate-500 border border-dashed
          border-slate-300 dark:border-slate-600">
          {t('chat.messageDeleted', 'Сообщение удалено')}
        </div>
      </div>
    );
  }

  const canDelete = canDeleteAny || isMine;

  const actions = (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100
      focus-within:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={() => onReply(message)}
        title={t('chat.reply', 'Ответить')}
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
          title={confirming
            ? t('chat.confirmDelete', 'Нажмите ещё раз для удаления')
            : t('common.delete', 'Удалить')}
          className={`p-1.5 rounded-lg transition-colors ${confirming
            ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300'
            : 'text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className={`group flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {/* Действия живут снаружи пузыря, со стороны, в которую он НЕ растёт, —
          иначе на длинном сообщении они наезжают на текст. */}
      {isMine && actions}

      <div className="max-w-[80%] min-w-0">
        {showSender && !isMine && (
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-0.5 px-1">
            {message.senderName || t('chat.unknownSender', 'Участник')}
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

      {!isMine && actions}
    </div>
  );
}
