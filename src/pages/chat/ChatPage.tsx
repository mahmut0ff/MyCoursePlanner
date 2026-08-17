import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  MessageSquare, Search, Plus, ArrowLeft, Users, Archive,
  Bell, BellOff, MessageSquarePlus, ChevronUp, Loader2,
} from 'lucide-react';
import type { ChatMessage, ChatRoom, MessageAttachment } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  useChatRooms, useChatMessages, useChatActions, useUnreadRooms,
  useTypingIndicator, useTypingStatus, chatRoomLabel, chatRoomCategory,
  categoryOfRole, CHAT_CATEGORIES,
} from '../../lib/useChat';
import { apiArchiveChatRoom, apiCreateChatRoom, apiModerateChatMessage } from '../../lib/api';
import { usePermissions } from '../../contexts/PermissionsContext';
import ChatMessageBubble from '../../components/chat/ChatMessageBubble';
import ChatComposer from '../../components/chat/ChatComposer';
import {
  NewGroupDialog, RoomMembersDialog, ChatAvatar, PersonRow, useDirectory, CATEGORY_LABELS_RU,
} from '../../components/chat/ChatPeople';
// Лайтбокс намеренно переиспользован из поддержки, а не скопирован: это ровно
// та же задача — открыть картинку из переписки во весь экран.
import { SupportImageLightbox } from '../../components/support/SupportMessageBubble';

/** Firestore отдаёт Timestamp или ISO-строку — обе формы надо уметь читать. */
function toDate(v: any): Date | null {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Перевод здесь только подставляется в строку, поэтому t принимаем максимально широко. */
type Translate = (key: string, fallback: string, opts?: any) => any;

function relativeTime(v: any, t: Translate) {
  const d = toDate(v);
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return String(t('chat.justNow', 'только что'));
  if (mins < 60) return String(t('chat.minsAgo', '{{n}} мин', { n: mins }));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return String(t('chat.hoursAgo', '{{n}} ч', { n: hours }));
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function dayKey(v: any): string {
  const d = toDate(v);
  return d ? d.toDateString() : '';
}

function dayLabel(v: any, t: Translate): string {
  const d = toDate(v);
  if (!d) return '';
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return String(t('chat.today', 'Сегодня'));
  if (d.toDateString() === yesterday.toDateString()) return String(t('chat.yesterday', 'Вчера'));
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export default function ChatPage() {
  const { t } = useTranslation();
  const { firebaseUser, organizationId } = useAuth();
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'students' | 'teachers' | 'staff' | 'groups'>('all');
  // На мобиле список и переписка занимают экран по очереди. Начальное состояние
  // читаем из адреса: ссылка из уведомления всегда несёт ?room=…, и открывать по
  // ней список вместо самой переписки — значит терять переход в один клик.
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(
    searchParams.get('room') ? 'chat' : 'list',
  );
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [startingUid, setStartingUid] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [lightbox, setLightbox] = useState<MessageAttachment | null>(null);

  const uid = firebaseUser?.uid || '';
  const { rooms, loading, nameCache, avatarCache } = useChatRooms(organizationId || undefined, showArchived);
  const { unreadIds } = useUnreadRooms(rooms, uid);

  // Комната живёт в URL: ссылка из уведомления ведёт прямо в нужную переписку.
  const selectedId = searchParams.get('room');
  const selectRoom = (roomId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (roomId) next.set('room', roomId); else next.delete('room');
    setSearchParams(next, { replace: true });
    setMobileView(roomId ? 'chat' : 'list');
  };

  const selected = useMemo(
    () => rooms.find((r) => r.id === selectedId) || null,
    [rooms, selectedId],
  );

  const { messages, loading: messagesLoading, loadMore, hasMore } = useChatMessages(selected?.id);
  const { sendMessage, updateLastRead, setMuted } = useChatActions();
  const { startTyping } = useTypingIndicator(selected?.id);
  const typingNames = useTypingStatus(selected?.id);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Справочник даёт и роли (чтобы разложить по категориям комнаты, заведённые
  // до появления orgRole), и самих людей — они стоят в списке рядом с чатами.
  const { people, canCreateGroup, rolesByUid, loading: peopleLoading } = useDirectory(true);

  const canStartChat = can('chat', 'write');
  const needle = search.trim().toLowerCase();

  const filtered = useMemo(() => rooms.filter((room) => {
    if (category !== 'all' && chatRoomCategory(room, uid, rolesByUid) !== category) return false;
    if (!needle) return true;
    const { title } = chatRoomLabel(room, uid, nameCache, avatarCache);
    return title.toLowerCase().includes(needle)
      || (room.lastMessagePreview || '').toLowerCase().includes(needle);
  }), [rooms, needle, category, uid, nameCache, avatarCache, rolesByUid]);

  // Люди, с которыми переписки ещё нет. Показывать их вперемешку с чатами
  // нельзя — у чата есть история и время, у человека нет ничего, и общий список
  // читался бы как «эти вам писали». Поэтому они идут отдельной секцией ниже.
  const strangers = useMemo(() => {
    if (!canStartChat) return [];
    const known = new Set(
      rooms.filter((r) => r.type === 'direct').map((r) => r.participantIds.find((id) => id !== uid)),
    );
    return people
      .filter((p) => !known.has(p.uid))
      .filter((p) => category === 'all' || categoryOfRole(p.role) === category)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle));
  }, [people, rooms, uid, category, needle, canStartChat]);

  // Счётчик на чипе — сколько всего строк он покажет: и начатых чатов, и людей.
  // Иначе «Студенты 0» рядом со списком из десяти студентов выглядело бы ложью.
  const categoryCounts = useMemo(() => {
    const out: Record<string, number> = {};
    const bump = (key: string | null) => { if (key) out[key] = (out[key] || 0) + 1; };
    const known = new Set(
      rooms.filter((r) => r.type === 'direct').map((r) => r.participantIds.find((id) => id !== uid)),
    );
    rooms.forEach((room) => bump(chatRoomCategory(room, uid, rolesByUid)));
    if (canStartChat) people.filter((p) => !known.has(p.uid)).forEach((p) => bump(categoryOfRole(p.role)));
    out.all = rooms.length + (canStartChat ? people.filter((p) => !known.has(p.uid)).length : 0);
    return out;
  }, [rooms, people, uid, rolesByUid, canStartChat]);

  const startChat = async (personUid: string) => {
    if (startingUid) return;
    setStartingUid(personUid);
    try {
      const room = await apiCreateChatRoom({ type: 'direct', participantIds: [personUid] });
      selectRoom(room.id);
    } catch (e: any) {
      toast.error(e?.message || t('chat.createFailed', 'Не удалось начать переписку'));
    } finally {
      setStartingUid(null);
    }
  };

  // Ответ, оставшийся от прошлой комнаты, уехал бы цитатой в чужую переписку.
  useEffect(() => { setReplyTo(null); }, [selected?.id]);

  // Прокручиваем вниз только на новых сообщениях. При подгрузке истории вверх
  // (окно выросло, но пользователь смотрит старое) прыжок вниз — это потеря места.
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastMessageId, typingNames.length]);

  // Открытая комната считается прочитанной — и остаётся ею, пока в ней сидят.
  useEffect(() => {
    if (!selected?.id || !messages.length) return;
    updateLastRead(selected.id).catch(() => {});
  }, [selected?.id, messages.length, updateLastRead]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  if (!firebaseUser) return null;

  const canModerate = can('chat', 'delete');
  const isRoomAdmin = !!selected && selected.participants?.[uid]?.role === 'admin';
  const isMuted = !!selected && !!selected.participants?.[uid]?.isMuted;

  const handleSend = async (text: string, attachments: MessageAttachment[], reply: ChatMessage | null) => {
    if (!selected || !organizationId) return;
    await sendMessage(
      selected.id,
      organizationId,
      text,
      attachments,
      reply ? {
        messageId: reply.id,
        text: reply.text || t('chat.attachment', 'Вложение'),
        senderName: reply.senderName || '',
      } : undefined,
    );
  };

  const handleDelete = async (message: ChatMessage) => {
    if (!selected) return;
    try {
      await apiModerateChatMessage(selected.id, message.id);
      toast.success(t('chat.messageDeletedToast', 'Сообщение удалено'));
    } catch (e: any) {
      toast.error(e?.message || t('chat.deleteFailed', 'Не удалось удалить сообщение'));
    }
  };

  const handleArchive = async () => {
    if (!selected) return;
    try {
      await apiArchiveChatRoom(selected.id, !selected.isArchived);
      toast.success(selected.isArchived
        ? t('chat.unarchived', 'Чат возвращён из архива')
        : t('chat.archived', 'Чат убран в архив'));
      if (!selected.isArchived) selectRoom(null);
    } catch (e: any) {
      toast.error(e?.message || t('chat.archiveFailed', 'Не удалось изменить архив'));
    }
  };

  const handleMute = async () => {
    if (!selected) return;
    try {
      await setMuted(selected.id, !isMuted);
    } catch (e: any) {
      toast.error(e?.message || t('chat.muteFailed', 'Не удалось изменить уведомления'));
    }
  };

  const headerLabel = selected ? chatRoomLabel(selected, uid, nameCache, avatarCache) : null;

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[30rem] flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary-500" />
            {t('chat.title', 'Чат')}
            {unreadIds.size > 0 && <span className="badge-red">{unreadIds.size}</span>}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('chat.subtitle', 'Переписка внутри учебного центра — с коллегами и студентами')}
          </p>
        </div>
        {/* Диалог один на один здесь не заводится — люди стоят прямо в списке,
            и переписка начинается кликом по человеку. Кнопка осталась для того,
            что в один клик не помещается: у группы есть имя и состав. */}
        {canStartChat && canCreateGroup && (
          <button type="button" onClick={() => setNewGroupOpen(true)}
            className="btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t('chat.newGroup', 'Новая группа')}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[20rem_1fr]
        rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm
        bg-white dark:bg-slate-900">

        {/* ─────────── СЛЕВА: список комнат ─────────── */}
        <aside
          aria-label={t('chat.aria.roomList', 'Список чатов')}
          className={`min-h-0 flex flex-col border-r border-slate-200 dark:border-slate-700
            ${mobileView === 'chat' ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="p-3 border-b border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('chat.searchRooms', 'Поиск по чатам…')} className="input pl-9" />
            </div>
            {/* Категории собеседников. Группа — своя категория: у неё собеседник
                не один, и приписывать её к персоналу по создателю было бы враньём. */}
            <div className="flex flex-wrap gap-1">
              {(['all', ...CHAT_CATEGORIES, 'groups'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${category === c
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {c === 'all'
                    ? t('chat.cat.all', 'Все')
                    : t(`chat.cat.${c}`, CATEGORY_LABELS_RU[c] || c)}
                  {!!categoryCounts[c] && (
                    <span className={category === c ? 'ml-1 text-white/70' : 'ml-1 text-slate-400'}>
                      {categoryCounts[c]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 px-0.5">
              <input type="checkbox" checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600" />
              {t('chat.showArchived', 'Показывать архив')}
            </label>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 && strangers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                {search
                  ? t('chat.noMatches', 'Никого не нашли')
                  : category !== 'all'
                    ? t('chat.noRoomsInCategory', 'В этой категории чатов пока нет')
                    : t('chat.noPeople', 'Писать пока некому — в организации нет других активных участников')}
              </div>
            ) : (
              <>
                {filtered.map((room) => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    selfUid={uid}
                    nameCache={nameCache}
                    avatarCache={avatarCache}
                    active={room.id === selectedId}
                    unread={unreadIds.has(room.id)}
                    onSelect={() => selectRoom(room.id)}
                  />
                ))}

                {/* Люди, с которыми ещё не переписывались, — отдельной секцией
                    под чатами: у чата есть история и время, у человека нет
                    ничего, и вперемешку список читался бы как «эти вам писали». */}
                {strangers.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide
                      text-slate-400 bg-slate-50 dark:bg-slate-800/50
                      border-y border-slate-100 dark:border-slate-800">
                      {t('chat.startConversation', 'Начать переписку')}
                      <span className="ml-1.5 normal-case tracking-normal">{strangers.length}</span>
                    </div>
                    {strangers.map((p) => (
                      <PersonRow
                        key={p.uid}
                        person={p}
                        onClick={() => startChat(p.uid)}
                        trailing={startingUid === p.uid
                          ? <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                          : <MessageSquarePlus className="w-4 h-4 text-slate-300 dark:text-slate-600" />}
                      />
                    ))}
                  </>
                )}

                {peopleLoading && canStartChat && (
                  <div className="p-3 space-y-2">
                    {[0, 1].map((i) => (
                      <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ─────────── СПРАВА: переписка ─────────── */}
        <section
          aria-label={t('chat.aria.conversation', 'Переписка')}
          className={`min-h-0 flex flex-col ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}
        >
          {!selected || !headerLabel ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6
              bg-slate-50 dark:bg-slate-900/50">
              <div className="p-3.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <MessageSquarePlus className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                {t('chat.selectRoom', 'Выберите чат слева или начните новый.')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-900/50">
              {/* Шапка комнаты */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-200
                dark:border-slate-700 bg-white dark:bg-slate-900">
                <button type="button" onClick={() => setMobileView('list')}
                  className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-500
                    hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={t('common.back', 'Назад')}>
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <ChatAvatar name={headerLabel.title} url={headerLabel.avatarUrl} size="sm" />

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {headerLabel.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {selected.type === 'group'
                      ? t('chat.membersCount', '{{n}} участников', { n: selected.participantIds.length })
                      : t('chat.directChat', 'Личная переписка')}
                    {selected.isArchived && ` · ${t('chat.archivedTag', 'в архиве')}`}
                  </div>
                </div>

                <button type="button" onClick={handleMute}
                  title={isMuted ? t('chat.unmute', 'Включить уведомления') : t('chat.mute', 'Отключить уведомления')}
                  className="p-2 rounded-lg text-slate-500 hover:text-primary-600
                    hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </button>

                {selected.type === 'group' && (
                  <button type="button" onClick={() => setMembersOpen(true)}
                    title={t('chat.members', 'Участники')}
                    className="p-2 rounded-lg text-slate-500 hover:text-primary-600
                      hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <Users className="w-4 h-4" />
                  </button>
                )}

                <button type="button" onClick={handleArchive}
                  title={selected.isArchived
                    ? t('chat.unarchive', 'Вернуть из архива')
                    : t('chat.archive', 'В архив')}
                  className="p-2 rounded-lg text-slate-500 hover:text-amber-600
                    hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <Archive className="w-4 h-4" />
                </button>
              </div>

              {/* Лента */}
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4 space-y-3">
                {messagesLoading && messages.length === 0 ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                        <div className="h-14 w-52 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
                    <div className="p-3 rounded-full bg-primary-50 dark:bg-primary-900/30">
                      <MessageSquare className="w-7 h-7 text-primary-500" />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                      {t('chat.noMessages', 'Сообщений пока нет — напишите первым.')}
                    </p>
                  </div>
                ) : (
                  <>
                    {hasMore && (
                      <div className="flex justify-center">
                        <button type="button" onClick={loadMore}
                          className="btn-ghost text-xs flex items-center gap-1.5">
                          {messagesLoading
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <ChevronUp className="w-3.5 h-3.5" />}
                          {t('chat.loadEarlier', 'Показать более ранние')}
                        </button>
                      </div>
                    )}
                    {messages.map((m, i) => {
                      const prev = messages[i - 1];
                      const showDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                      return (
                        <div key={m.id} className="space-y-3">
                          {showDay && (
                            <div className="flex justify-center">
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium
                                bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300">
                                {dayLabel(m.createdAt, t)}
                              </span>
                            </div>
                          )}
                          <ChatMessageBubble
                            message={m}
                            isMine={m.senderId === uid}
                            showSender={selected.type === 'group'}
                            canDeleteAny={canModerate}
                            onReply={setReplyTo}
                            onDelete={handleDelete}
                            onOpenImage={setLightbox}
                          />
                        </div>
                      );
                    })}
                  </>
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
                      {t('chat.typing', '{{name}} печатает…', { name: typingNames[0] })}
                    </span>
                  </div>
                )}

                <div ref={endRef} />
              </div>

              <ChatComposer
                organizationId={organizationId || ''}
                roomId={selected.id}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onSend={handleSend}
                onTyping={startTyping}
              />
            </div>
          )}
        </section>
      </div>

      {newGroupOpen && (
        <NewGroupDialog
          onClose={() => setNewGroupOpen(false)}
          onCreated={(roomId) => { setNewGroupOpen(false); selectRoom(roomId); }}
        />
      )}

      {membersOpen && selected && (
        <RoomMembersDialog
          room={selected}
          selfUid={uid}
          canManage={isRoomAdmin || canModerate}
          onClose={() => setMembersOpen(false)}
        />
      )}

      {lightbox && <SupportImageLightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function RoomRow({
  room, selfUid, nameCache, avatarCache, active, unread, onSelect,
}: {
  room: ChatRoom;
  selfUid: string;
  nameCache: Record<string, string>;
  avatarCache: Record<string, string>;
  active: boolean;
  unread: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const { title, avatarUrl } = chatRoomLabel(room, selfUid, nameCache, avatarCache);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors
        border-b border-slate-100 dark:border-slate-800 ${active
          ? 'bg-primary-50 dark:bg-primary-900/20'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
    >
      <ChatAvatar name={title} url={avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm truncate flex-1 ${unread
            ? 'font-semibold text-slate-900 dark:text-white'
            : 'font-medium text-slate-700 dark:text-slate-200'}`}>
            {title}
          </span>
          <span className="text-[10px] text-slate-400 shrink-0">
            {relativeTime(room.lastMessageAt, t)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">
            {room.lastMessagePreview || t('chat.noMessagesShort', 'Нет сообщений')}
          </span>
          {unread && <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />}
          {room.isArchived && <Archive className="w-3 h-3 text-slate-400 shrink-0" />}
        </div>
      </div>
    </button>
  );
}
