import { useEffect, useRef, useState, Fragment, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MoreVertical, ShieldAlert, Reply } from 'lucide-react';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import type { ChatRoom, ChatMessage, MessageAttachment } from '../../types';
import { useChatMessages, useChatActions, uploadChatAttachment } from '../../lib/useChat';
import { useAuth } from '../../contexts/AuthContext';
import { apiArchiveChatRoom, apiModerateChatMessage } from '../../lib/api';
import ChatMessageInput from './ChatMessageInput';
import ManageGroupModal from './ManageGroupModal';
import ImageLightbox from './ImageLightbox';

/** Safely convert Firestore Timestamp or ISO string to Date */
function toSafeDate(val: any): Date {
  if (!val) return new Date();
  if (val.toDate) return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

interface ChatRoomViewProps {
  room: ChatRoom;
  onBack: () => void;
  displayTitle: string;
}

export default function ChatRoomView({ room, onBack, displayTitle }: ChatRoomViewProps) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const { messages, loading } = useChatMessages(room.id);
  const { sendMessage, updateLastRead } = useChatActions();
  const dfLocale = i18n.language === 'ru' ? ru : enUS;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  // Admin checks
  const isSysAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isRoomAdmin = room.participants[profile?.uid || '']?.role === 'admin';
  const canModerateRoom = isSysAdmin || isRoomAdmin;

  // Mark messages as read when viewing the room
  useEffect(() => {
    if (isAtBottom) {
      updateLastRead(room.id);
    }
  }, [messages, isAtBottom, room.id, updateLastRead]);

  // Scroll tracking logic
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 100);
  }, []);

  // Auto-scroll on new message ONLY if at bottom
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, isAtBottom]);

  // Scroll to bottom on first load
  useEffect(() => {
    if (!loading && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      setIsAtBottom(true);
    }
  }, [loading, room.id]);

  const handleSendMessage = async (text: string, files?: File[], replyTo?: ChatMessage['replyTo']) => {
    if (!profile || room.participants[profile.uid]?.isRemoved) return;
    
    try {
      let attachments: MessageAttachment[] = [];
      if (files && files.length > 0) {
        attachments = await Promise.all(
          files.map(f => uploadChatAttachment(room.organizationId, room.id, f))
        );
      }
      
      await sendMessage(room.id, room.organizationId, text, attachments.length > 0 ? attachments : undefined, replyTo);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const isRemoved = !!(profile && room.participants[profile.uid]?.isRemoved);

  const handleArchiveRoom = async () => {
    if (!window.confirm(t('chat.confirmArchive', 'Архивировать этот чат?'))) return;
    try {
      await apiArchiveChatRoom(room.id, true);
      onBack();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm(t('chat.confirmDeleteMessage', 'Удалить сообщение?'))) return;
    try {
      await apiModerateChatMessage(room.id, messageId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Build a quick lookup for sender names
  const senderNames: Record<string, string> = {};
  for (const uid of room.participantIds) {
    senderNames[uid] = room.participants[uid]?.displayName || uid.slice(0, 8);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${room.type === 'direct' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'}`}>
             <span className="font-bold text-lg">{displayTitle[0]?.toUpperCase() || '?'}</span>
          </div>
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white line-clamp-1">{displayTitle}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {room.type === 'group' 
                ? t('chat.groupParticipants', '{{count}} участников', { count: room.participantIds.length })
                : t('chat.directMessage', 'Личное сообщение')
              }
            </p>
          </div>
        </div>
        
        {canModerateRoom && (
          <div className="relative">
            <button 
              onClick={() => setShowRoomMenu(!showRoomMenu)}
              className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showRoomMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowRoomMenu(false)} />
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-lg rounded-xl z-20 overflow-hidden py-1">
                  {room.type === 'group' && (
                    <button
                      onClick={() => { setShowRoomMenu(false); setShowManageModal(true); }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {t('chat.participants', 'Участники')}
                    </button>
                  )}
                  <button
                    onClick={() => { setShowRoomMenu(false); handleArchiveRoom(); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    {t('chat.archiveRoom', 'Архивировать чат')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            {t('chat.startConversation', 'Начните общение')}
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === profile?.uid;
            
            // Date separator
            let showDate = false;
            if (index === 0) {
              showDate = true;
            } else {
              const prevDate = toSafeDate(messages[index - 1].createdAt).toDateString();
              const currDate = toSafeDate(msg.createdAt).toDateString();
              if (prevDate !== currDate) showDate = true;
            }

            // Show sender name in group chats for non-consecutive messages from same sender
            let showSenderName = false;
            if (room.type === 'group' && !isMe && !msg.deletedAt) {
              if (index === 0 || messages[index - 1].senderId !== msg.senderId || showDate) {
                showSenderName = true;
              }
            }

            const msgSenderName = msg.senderName || senderNames[msg.senderId] || msg.senderId.slice(0, 8);

            return (
              <Fragment key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-4">
                    <span className="px-3 py-1 bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-medium rounded-full backdrop-blur-sm">
                      {format(toSafeDate(msg.createdAt), 'dd MMMM yyyy', { locale: dfLocale })}
                    </span>
                  </div>
                )}
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group/msg relative`}>
                  {/* Sender name label */}
                  {showSenderName && (
                    <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-1 ml-1">
                      {msgSenderName}
                    </span>
                  )}

                  {msg.deletedAt ? (
                    <div className="max-w-[80%] px-4 py-2 my-1 rounded-2xl bg-white dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm italic">
                      {t('chat.messageDeletedByAdmin', 'Сообщение удалено администратором')}
                    </div>
                  ) : (
                    <div className={`max-w-[80%] md:max-w-[70%] relative group`}>
                      {/* Action buttons: delete + reply */}
                      <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-10 ${isMe ? '-left-20' : '-right-20'}`}>
                        <button
                          onClick={() => setReplyingTo(msg)}
                          className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/20 shadow-sm"
                          title={t('chat.reply', 'Ответить')}
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>
                        {(isSysAdmin || isMe) && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 shadow-sm"
                            title={t('chat.deleteMessage', 'Удалить сообщение')}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                      
                      <div className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm ${
                        isMe 
                          ? 'bg-primary-600 text-white rounded-br-sm' 
                          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-100 dark:border-slate-700 rounded-bl-sm'
                      }`}>
                        {/* Reply quote */}
                        {msg.replyTo && (
                          <div className={`border-l-2 pl-2.5 py-1 mb-2 rounded-r text-xs ${
                            isMe 
                              ? 'border-white/40 bg-white/10' 
                              : 'border-primary-400 bg-primary-50/50 dark:bg-primary-500/10'
                          }`}>
                            <div className={`font-semibold mb-0.5 ${isMe ? 'text-white/80' : 'text-primary-600 dark:text-primary-400'}`}>
                              {msg.replyTo.senderName}
                            </div>
                            <div className={`line-clamp-2 ${isMe ? 'text-white/60' : 'text-slate-500 dark:text-slate-400'}`}>
                              {msg.replyTo.text}
                            </div>
                          </div>
                        )}

                        {msg.text && <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</div>}
                        
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className={`flex flex-col gap-2 ${msg.text ? 'mt-2' : ''}`}>
                            {msg.attachments.map(att => (
                              <div key={att.id} className="rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/50">
                                {att.type === 'image' ? (
                                  <button 
                                    onClick={() => setLightboxUrl(att.url)} 
                                    className="block max-w-[280px] cursor-zoom-in"
                                  >
                                    <img src={att.url} alt="Attachment" className="w-full h-auto object-cover rounded-lg" loading="lazy" />
                                  </button>
                                ) : (
                                  <a href={att.url} target="_blank" rel="noreferrer" className={`flex items-center gap-2 p-2 text-xs font-medium ${isMe ? 'text-white hover:text-white/80' : 'text-primary-600 dark:text-primary-400 hover:underline'}`}>
                                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                    <span className="truncate max-w-[180px]">{att.fileName || 'File'}</span>
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={`text-[10px] mt-1 text-slate-400 flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {format(toSafeDate(msg.createdAt), 'HH:mm')}
                      </div>
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Warning if removed */}
      {isRemoved && (
        <div className="p-3 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm flex items-center justify-center gap-2 shrink-0">
          <ShieldAlert className="w-4 h-4" />
          {t('chat.youAreRemoved', 'Вы были удалены из этого чата.')}
        </div>
      )}

      {/* Input Area */}
      {!isRemoved && (
        <ChatMessageInput 
          onSendMessage={handleSendMessage} 
          disabled={isRemoved}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* Modals */}
      {showManageModal && (
        <ManageGroupModal room={room} onClose={() => setShowManageModal(false)} />
      )}
    </div>
  );
}
