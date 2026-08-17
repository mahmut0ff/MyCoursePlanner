import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { X, Search, Users, Loader2, UserMinus, UserPlus, Check } from 'lucide-react';
import type { ChatDirectoryEntry, ChatRoom } from '../../types';
import { apiGetChatDirectory, apiCreateChatRoom, apiUpdateChatParticipants } from '../../lib/api';
import { CHAT_CATEGORIES, categoryOfRole, type ChatCategory } from '../../lib/useChat';

/** Подписи категорий — общие для заголовков в справочнике и чипов в списке чатов. */
export const CATEGORY_LABELS_RU: Record<string, string> = {
  students: 'Студенты',
  teachers: 'Преподаватели',
  staff: 'Персонал',
  groups: 'Группы',
  other: 'Прочие',
};

const ROLE_LABELS_RU: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  manager: 'Менеджер',
  teacher: 'Преподаватель',
  mentor: 'Наставник',
  student: 'Студент',
};

export function initials(name: string) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function ChatAvatar({ name, url, size = 'md' }: { name: string; url?: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-xs';
  if (url) {
    return <img src={url} alt={name} className={`${box} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${box} rounded-full shrink-0 flex items-center justify-center font-semibold
      bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300`}>
      {initials(name)}
    </div>
  );
}

/** Общая рамка обоих диалогов — вынесена, чтобы шапка и оверлей не разъезжались. */
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl
          overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3
          border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PersonRow({
  person, selected, onClick, trailing,
}: {
  person: ChatDirectoryEntry;
  selected?: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const content = (
    <>
      <ChatAvatar name={person.name} url={person.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1 text-left">
        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{person.name}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {t(`roles.${person.role}`, ROLE_LABELS_RU[person.role] || person.role)}
        </div>
      </div>
      {trailing}
      {selected !== undefined && (
        <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${selected
          ? 'bg-primary-600 border-primary-600 text-white'
          : 'border-slate-300 dark:border-slate-600'}`}>
          {selected && <Check className="w-3.5 h-3.5" />}
        </span>
      )}
    </>
  );

  if (!onClick) {
    return <div className="w-full flex items-center gap-2.5 px-4 py-2.5">{content}</div>;
  }
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors
        hover:bg-slate-50 dark:hover:bg-slate-700/50">
      {content}
    </button>
  );
}

/**
 * Загрузка справочника собеседников. Общая для диалогов и для страницы: список
 * чатов берёт отсюда роли, чтобы разложить по категориям комнаты, заведённые до
 * того, как сервер начал проставлять orgRole.
 */
export function useDirectory(open: boolean) {
  const [people, setPeople] = useState<ChatDirectoryEntry[]>([]);
  const [canCreateGroup, setCanCreateGroup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    apiGetChatDirectory()
      .then((res) => {
        if (cancelled) return;
        setPeople(res.items || []);
        setCanCreateGroup(!!res.canCreateGroup);
      })
      .catch(() => { if (!cancelled) setPeople([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const rolesByUid = useMemo(() => {
    const out: Record<string, string> = {};
    people.forEach((p) => { out[p.uid] = p.role; });
    return out;
  }, [people]);

  return { people, canCreateGroup, loading, rolesByUid };
}

/** Люди, разложенные по категориям в порядке CHAT_CATEGORIES; пустые группы отброшены. */
function byCategory(people: ChatDirectoryEntry[]) {
  const buckets = new Map<ChatCategory | 'other', ChatDirectoryEntry[]>();
  for (const p of people) {
    const key = categoryOfRole(p.role) || 'other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }
  const order: (ChatCategory | 'other')[] = [...CHAT_CATEGORIES, 'other'];
  return order
    .filter((k) => buckets.get(k)?.length)
    .map((k) => ({ key: k, people: buckets.get(k)! }));
}

function useSearch(people: ChatDirectoryEntry[], search: string) {
  return useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((p) => p.name.toLowerCase().includes(needle));
  }, [people, search]);
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} className="input pl-9" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Новая группа
//
// Диалог один на один здесь НЕ заводится: люди, которым можно написать, стоят
// прямо в списке чатов, и переписка начинается кликом по человеку. Диалог нужен
// только там, где одним кликом не обойтись — у группы есть название и состав.
// ─────────────────────────────────────────────────────────────────────────────

interface NewGroupProps {
  onClose: () => void;
  /** Возвращает id созданной комнаты. */
  onCreated: (roomId: string) => void;
}

export function NewGroupDialog({ onClose, onCreated }: NewGroupProps) {
  const { t } = useTranslation();
  const { people, loading } = useDirectory(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useSearch(people, search);

  const createGroup = async () => {
    if (!title.trim() || selected.length === 0) return;
    setBusy(true);
    try {
      const room = await apiCreateChatRoom({ type: 'group', title: title.trim(), participantIds: selected });
      onCreated(room.id);
    } catch (e: any) {
      toast.error(e?.message || t('chat.createFailed', 'Не удалось создать группу'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={t('chat.newGroup', 'Новая группа')} onClose={onClose}>
      <div className="p-4 space-y-3 border-b border-slate-200 dark:border-slate-700">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input"
          placeholder={t('chat.groupTitlePlaceholder', 'Название группы')} />
        <SearchField value={search} onChange={setSearch}
          placeholder={t('chat.searchPeople', 'Поиск по имени…')} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {search
              ? t('chat.noMatches', 'Никого не нашли')
              : t('chat.noPeople', 'Писать пока некому — в организации нет других активных участников')}
          </div>
        ) : byCategory(filtered).map(({ key, people: bucket }) => (
          <div key={key}>
            {/* Липкий заголовок: в организации на сотню человек без него не
                видно, где кончились студенты и начались преподаватели. */}
            <div className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-medium uppercase
              tracking-wide text-slate-400 bg-white/95 dark:bg-slate-800/95 backdrop-blur
              border-b border-slate-100 dark:border-slate-700/50">
              {t(`chat.cat.${key}`, CATEGORY_LABELS_RU[key] || key)}
              <span className="ml-1.5 normal-case tracking-normal">{bucket.length}</span>
            </div>
            {bucket.map((p) => (
              <PersonRow
                key={p.uid}
                person={p}
                selected={selected.includes(p.uid)}
                onClick={() => setSelected((s) => s.includes(p.uid) ? s.filter((x) => x !== p.uid) : [...s, p.uid])}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <span className="text-xs text-slate-500 dark:text-slate-400 flex-1">
          {t('chat.selectedCount', 'Выбрано: {{n}}', { n: selected.length })}
        </span>
        <button type="button" className="btn-primary text-sm flex items-center gap-2"
          disabled={busy || !title.trim() || selected.length === 0} onClick={createGroup}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
          {t('chat.createGroup', 'Создать')}
        </button>
      </div>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Состав группы
// ─────────────────────────────────────────────────────────────────────────────

interface MembersProps {
  room: ChatRoom;
  selfUid: string;
  canManage: boolean;
  onClose: () => void;
}

export function RoomMembersDialog({ room, selfUid, canManage, onClose }: MembersProps) {
  const { t } = useTranslation();
  const { people, loading } = useDirectory(canManage);
  const [search, setSearch] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const current: ChatDirectoryEntry[] = useMemo(() => room.participantIds.map((uid) => ({
    uid,
    name: room.participants?.[uid]?.displayName || (uid === selfUid ? t('chat.you', 'Вы') : uid.slice(0, 8) + '…'),
    role: room.participants?.[uid]?.role === 'admin' ? 'admin' : 'member',
    avatarUrl: room.participants?.[uid]?.avatarUrl || '',
  })), [room, selfUid, t]);

  const candidates = useSearch(
    people.filter((p) => !room.participantIds.includes(p.uid)),
    search,
  );

  const mutate = async (uid: string, add: boolean) => {
    setBusyUid(uid);
    try {
      await apiUpdateChatParticipants(room.id, add ? [uid] : undefined, add ? undefined : [uid]);
      toast.success(add
        ? t('chat.memberAdded', 'Участник добавлен')
        : t('chat.memberRemoved', 'Участник убран'));
    } catch (e: any) {
      toast.error(e?.message || t('chat.memberFailed', 'Не удалось изменить состав'));
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <Dialog title={t('chat.members', 'Участники')} onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {t('chat.inRoom', 'В чате — {{n}}', { n: current.length })}
        </div>
        {current.map((p) => (
          <PersonRow
            key={p.uid}
            person={{
              ...p,
              role: p.role === 'admin' ? t('chat.roomAdmin', 'Администратор чата') : t('chat.roomMember', 'Участник'),
            }}
            trailing={canManage && p.uid !== selfUid ? (
              <button type="button" onClick={() => mutate(p.uid, false)} disabled={busyUid === p.uid}
                title={t('chat.removeMember', 'Убрать из чата')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600
                  hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50">
                {busyUid === p.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
              </button>
            ) : undefined}
          />
        ))}

        {canManage && (
          <>
            <div className="px-4 pt-4 pb-2 border-t border-slate-200 dark:border-slate-700 mt-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-2">
                {t('chat.addPeople', 'Добавить')}
              </div>
              <SearchField value={search} onChange={setSearch}
                placeholder={t('chat.searchPeople', 'Поиск по имени…')} />
            </div>
            {loading ? (
              <div className="px-4 pb-4 space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <div className="px-4 pb-6 text-sm text-slate-400">
                {t('chat.noneToAdd', 'Добавить больше некого')}
              </div>
            ) : candidates.slice(0, 50).map((p) => (
              <PersonRow
                key={p.uid}
                person={p}
                trailing={
                  <span className="p-1.5 text-slate-400">
                    {busyUid === p.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  </span>
                }
                onClick={() => { if (!busyUid) mutate(p.uid, true); }}
              />
            ))}
          </>
        )}
      </div>
    </Dialog>
  );
}
