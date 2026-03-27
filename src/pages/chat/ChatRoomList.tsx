import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import type { ChatRoom } from '../../types';
import { Search, Plus, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow, isToday, format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import CreateGroupModal from './CreateGroupModal';
import ChatAvatar from './ChatAvatar';

/** Safely convert Firestore Timestamp or ISO string to Date */
function toSafeDate(val: any): Date | null {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** Resolve display title for a room */
function resolveTitle(room: ChatRoom, myUid?: string, nameCache?: Record<string, string>): string {
  if (room.type === 'group') return room.title || 'Group Chat';
  if (!myUid) return room.title || 'Chat';
  const otherUid = room.participantIds.find(id => id !== myUid);
  if (!otherUid) return room.title || 'Chat';
  if (room.participants[otherUid]?.displayName) return room.participants[otherUid].displayName!;
  if (nameCache?.[otherUid]) return nameCache[otherUid];
  return room.title || 'Chat';
}

interface ChatRoomListProps {
  rooms: ChatRoom[];
  loading: boolean;
  error: Error | null;
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  nameCache?: Record<string, string>;
  avatarCache?: Record<string, string>;
}

export default function ChatRoomList({ rooms, loading, error, activeRoomId, onSelectRoom, nameCache, avatarCache }: ChatRoomListProps) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'direct' | 'group'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const dfLocale = i18n.language === 'ru' ? ru : enUS;
  
  const filteredRooms = useMemo(() => {
    return rooms.filter(r => {
      if (filter !== 'all' && r.type !== filter) return false;
      if (search) {
        const query = search.toLowerCase();
        const title = resolveTitle(r, profile?.uid, nameCache);
        if (title.toLowerCase().includes(query)) return true;
        return false;
      }
      return true;
    });
  }, [rooms, search, filter, profile?.uid, nameCache]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col p-4 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl mb-6"></div>
        {[1,2,3,4].map(i => (
          <div key={i} className="flex gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center text-slate-500 h-full">
        <ShieldAlert className="w-8 h-8 text-red-500 mb-2" />
        <p>{t('chat.errorLoadingRooms', 'Ошибка загрузки чатов')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t('chat.messages', 'Сообщения')}
          </h2>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('chat.search', 'Поиск чатов...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:border-primary-500 outline-none text-slate-900 dark:text-white"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {(['all', 'group', 'direct'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f 
                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {f === 'all' && t('chat.filterAll', 'Все')}
              {f === 'group' && t('chat.filterGroups', 'Группы')}
              {f === 'direct' && t('chat.filterDirect', 'Личные')}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 dark:divide-slate-800/50">
        {filteredRooms.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {search ? t('chat.noResults', 'Чаты не найдены') : t('chat.empty', 'У вас пока нет чатов')}
          </div>
        ) : (
          filteredRooms.map(room => {
            const isUnread = profile ? (() => {
              if (activeRoomId === room.id) return false;
              const lastMsg = toSafeDate(room.lastMessageAt);
              const lastRead = toSafeDate(room.participants[profile.uid]?.lastReadAt);
              return lastMsg && (!lastRead || lastMsg > lastRead);
            })() : false;

            const msgDate = toSafeDate(room.lastMessageAt);
            const timeStr = msgDate ? (
              isToday(msgDate) 
                ? format(msgDate, 'HH:mm')
                : formatDistanceToNow(msgDate, { addSuffix: true, locale: dfLocale })
            ) : '';

            const displayTitle = resolveTitle(room, profile?.uid, nameCache);

            // Resolve avatar for this room
            let roomAvatarUrl: string | undefined = room.imageUrl || undefined;
            if (room.type === 'direct' && profile?.uid) {
              const otherUid = room.participantIds.find(id => id !== profile.uid);
              if (otherUid) {
                const p = room.participants[otherUid] as any;
                roomAvatarUrl = p?.avatarUrl || p?.photoURL || avatarCache?.[otherUid] || undefined;
              }
            }

            return (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className={`w-full text-left p-4 flex items-start gap-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80 ${
                  activeRoomId === room.id ? 'bg-primary-50 dark:bg-primary-500/5 border-l-2 border-primary-500' : 'border-l-2 border-transparent'
                }`}
              >
                <div className="relative shrink-0">
                  <ChatAvatar src={roomAvatarUrl} name={displayTitle} size="lg" type={room.type === 'direct' ? 'direct' : 'group'} />
                  {isUnread && (
                    <div className="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm md:text-base font-semibold truncate ${
                      isUnread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'
                    }`}>
                      {displayTitle}
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                      {timeStr}
                    </span>
                  </div>
                  <p className={`text-xs md:text-sm truncate ${
                    isUnread ? 'text-slate-900 dark:text-slate-200 font-medium' : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    {room.lastMessagePreview || 'Начало общения'}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateGroupModal onClose={() => setShowCreateModal(false)} onCreated={onSelectRoom} />
      )}
    </div>
  );
}
