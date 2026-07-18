import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  LifeBuoy, Search, ArrowLeft, Info, CheckCircle2, RotateCcw,
  Building2, Mail, Phone, MapPin, Shield, CalendarDays, Clock,
  Hash, Copy, GitBranch, Layers, Ban, Loader2, ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SupportThread, SupportThreadStatus, SupportUserInfo } from '../../types';
import { useSupportThreads } from '../../lib/useSupport';
import { apiSupportUserInfo, apiSupportSetStatus } from '../../lib/api';
import SupportChatPane from '../../components/support/SupportChatPane';

type Filter = SupportThreadStatus | 'all';

const STATUS_META: Record<SupportThreadStatus, { labelRu: string; badge: string }> = {
  new: { labelRu: 'Новое', badge: 'badge-yellow' },
  open: { labelRu: 'В работе', badge: 'badge-primary' },
  closed: { labelRu: 'Закрыто', badge: 'badge-slate' },
};

const ROLE_LABELS_RU: Record<string, string> = {
  super_admin: 'Супер-админ',
  admin: 'Владелец УЦ',
  manager: 'Менеджер',
  teacher: 'Преподаватель',
  student: 'Студент',
};

function relativeTime(iso: string, t: (k: string, d: string, o?: any) => string) {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return t('support.justNow', 'только что');
  if (mins < 60) return t('support.minsAgo', '{{n}} мин', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('support.hoursAgo', '{{n}} ч', { n: hours });
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export default function AdminSupportPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [info, setInfo] = useState<SupportUserInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  // Mobile has no room for three columns — the list and the chat take turns.
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [infoOpen, setInfoOpen] = useState(false);

  const { threads, loading } = useSupportThreads(filter);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((th) =>
      th.userName?.toLowerCase().includes(needle) ||
      th.userEmail?.toLowerCase().includes(needle) ||
      th.organizationName?.toLowerCase().includes(needle) ||
      th.userId.toLowerCase().includes(needle));
  }, [threads, search]);

  const selected = useMemo(
    () => threads.find((th) => th.id === selectedId) || null,
    [threads, selectedId],
  );

  // The right-hand panel crosses org boundaries, so it can only come from the
  // backend — refetched per selection rather than denormalised onto the thread.
  useEffect(() => {
    if (!selectedId) { setInfo(null); return; }
    let cancelled = false;
    setInfoLoading(true);
    setInfo(null);
    apiSupportUserInfo(selectedId)
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo(null); })
      .finally(() => { if (!cancelled) setInfoLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const changeStatus = async (status: SupportThreadStatus) => {
    if (!selected) return;
    try {
      await apiSupportSetStatus(selected.id, status);
      toast.success(t('support.statusChanged', 'Статус обновлён'));
    } catch (e: any) {
      toast.error(e?.message || t('support.statusFailed', 'Не удалось изменить статус'));
    }
  };

  const copy = (value: string) => {
    navigator.clipboard.writeText(value)
      .then(() => toast.success(t('support.copied', 'Скопировано')))
      .catch(() => toast.error(t('support.copyFailed', 'Не удалось скопировать')));
  };

  const totalUnread = threads.reduce((acc, th) => acc + (th.unreadForSupport || 0), 0);

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[30rem] flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-primary-500" />
            {t('support.inboxTitle', 'Поддержка')}
            {totalUnread > 0 && (
              <span className="badge-red">{totalUnread}</span>
            )}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('support.inboxSubtitle', 'Обращения пользователей платформы')}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[20rem_1fr] xl:grid-cols-[20rem_1fr_19rem]
        rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm
        bg-white dark:bg-slate-900">

        {/* ─────────── LEFT: thread list ─────────── */}
        <aside
          aria-label={t('support.aria.threadList', 'Список обращений')}
          className={`min-h-0 flex flex-col border-r border-slate-200 dark:border-slate-700
          ${mobileView === 'chat' ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="p-3 border-b border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('support.searchPlaceholder', 'Имя, email, УЦ, uid…')}
                className="input pl-9"
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'new', 'open', 'closed'] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === f
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {f === 'all'
                    ? t('support.filterAll', 'Все')
                    : t(`support.status.${f}`, STATUS_META[f].labelRu)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                {search
                  ? t('support.noMatches', 'Ничего не найдено')
                  : t('support.noThreads', 'Обращений пока нет')}
              </div>
            ) : filtered.map((th) => (
              <ThreadRow
                key={th.id}
                thread={th}
                active={th.id === selectedId}
                onSelect={() => { setSelectedId(th.id); setMobileView('chat'); }}
                t={t}
              />
            ))}
          </div>
        </aside>

        {/* ─────────── CENTER: conversation ─────────── */}
        <section
          aria-label={t('support.aria.conversation', 'Переписка')}
          className={`min-h-0 flex flex-col ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}
        >
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6
              bg-slate-50 dark:bg-slate-900/50">
              <div className="p-3.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <LifeBuoy className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                {t('support.selectThread', 'Выберите обращение слева, чтобы открыть переписку.')}
              </p>
            </div>
          ) : (
            <SupportChatPane
              key={selected.id}
              threadId={selected.id}
              uploadUserId={selected.id}
              viewerSide="support"
              canDeleteAny
              enableQuickReplies
              composerPlaceholder={t('support.placeholderAdmin', 'Ответьте пользователю… «/» — быстрые ответы')}
              header={
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-200
                  dark:border-slate-700 bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-500
                      hover:bg-slate-100 dark:hover:bg-slate-800"
                    title={t('common.back', 'Назад')}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <Avatar name={selected.userName} url={selected.userAvatarUrl} />

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {selected.userName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {selected.organizationName || t('support.noOrg', 'Без организации')}
                      {' · '}
                      {t(`roles.${selected.userRole}`, ROLE_LABELS_RU[selected.userRole] || selected.userRole)}
                    </div>
                  </div>

                  <span className={STATUS_META[selected.status]?.badge || 'badge-slate'}>
                    {t(`support.status.${selected.status}`, STATUS_META[selected.status]?.labelRu || selected.status)}
                  </span>

                  {selected.status === 'closed' ? (
                    <button
                      type="button"
                      onClick={() => changeStatus('open')}
                      title={t('support.reopen', 'Открыть заново')}
                      className="p-2 rounded-lg text-slate-500 hover:text-primary-600
                        hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => changeStatus('closed')}
                      title={t('support.close', 'Закрыть обращение')}
                      className="p-2 rounded-lg text-slate-500 hover:text-emerald-600
                        hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setInfoOpen(true)}
                    className="xl:hidden p-2 rounded-lg text-slate-500
                      hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={t('support.userInfo', 'О пользователе')}
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              }
            />
          )}
        </section>

        {/* ─────────── RIGHT: user info ─────────── */}
        <aside
          aria-label={t('support.aria.userPanel', 'Информация о пользователе')}
          className="hidden xl:flex min-h-0 flex-col border-l border-slate-200 dark:border-slate-700"
        >
          <UserInfoPanel
            thread={selected}
            info={info}
            loading={infoLoading}
            onCopy={copy}
            t={t}
          />
        </aside>
      </div>

      {/* Below xl the info panel becomes a sheet rather than disappearing. */}
      {infoOpen && (
        <div
          className="fixed inset-0 z-50 xl:hidden flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="w-full max-w-sm h-full bg-white dark:bg-slate-900 shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b
              border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-900 dark:text-white">
                {t('support.userInfo', 'О пользователе')}
              </span>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="btn-ghost px-2 py-1 text-sm"
              >
                {t('common.close', 'Закрыть')}
              </button>
            </div>
            <UserInfoPanel thread={selected} info={info} loading={infoLoading} onCopy={copy} t={t} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── pieces ──────────────────────────── */

function Avatar({ name, url, size = 'sm' }: { name: string; url?: string; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-9 h-9 text-xs';
  if (url) {
    return <img src={url} alt={name} className={`${box} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${box} rounded-full shrink-0 flex items-center justify-center font-semibold
      bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300`}>
      {initials(name || '?')}
    </div>
  );
}

function ThreadRow({ thread, active, onSelect, t }: {
  thread: SupportThread;
  active: boolean;
  onSelect: () => void;
  t: any;
}) {
  const unread = thread.unreadForSupport || 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 flex gap-2.5 items-start
        border-b border-slate-100 dark:border-slate-800 transition-colors ${
        active
          ? 'bg-primary-50 dark:bg-primary-900/25'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
    >
      <Avatar name={thread.userName} url={thread.userAvatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm truncate flex-1 ${unread
            ? 'font-semibold text-slate-900 dark:text-white'
            : 'font-medium text-slate-700 dark:text-slate-200'}`}>
            {thread.userName}
          </span>
          <span className="text-[10px] text-slate-400 shrink-0">
            {relativeTime(thread.lastMessageAt, t)}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {thread.organizationName || t('support.noOrg', 'Без организации')}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-xs truncate flex-1 ${unread
            ? 'text-slate-700 dark:text-slate-200'
            : 'text-slate-400 dark:text-slate-500'}`}>
            {thread.lastMessageFrom === 'support' && (
              <span className="text-slate-400">{t('support.youPrefix', 'Вы: ')}</span>
            )}
            {thread.lastMessagePreview}
          </span>
          {unread > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-600
              text-white text-[10px] font-semibold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
          {thread.status === 'new' && !unread && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
        </div>
      </div>
    </button>
  );
}

function InfoRow({ icon: Icon, label, value, onCopy, href }: {
  icon: any;
  label: string;
  value?: string | null;
  onCopy?: () => void;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 group">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
        {href ? (
          <Link to={href} className="text-xs text-primary-600 dark:text-primary-400 hover:underline
            break-words inline-flex items-center gap-1">
            {value}
            <ExternalLink className="w-3 h-3" />
          </Link>
        ) : (
          <div className="text-xs text-slate-700 dark:text-slate-200 break-words">{value}</div>
        )}
      </div>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="p-1 rounded text-slate-300 hover:text-primary-600 opacity-0
            group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
          title="Копировать"
        >
          <Copy className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function UserInfoPanel({ thread, info, loading, onCopy, t }: {
  thread: SupportThread | null;
  info: SupportUserInfo | null;
  loading: boolean;
  onCopy: (v: string) => void;
  t: any;
}) {
  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <p className="text-xs text-slate-400">
          {t('support.infoEmpty', 'Информация о пользователе появится здесь')}
        </p>
      </div>
    );
  }

  const fmtDate = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString('ru-RU', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <div className="flex flex-col items-center text-center gap-2 pb-4
        border-b border-slate-200 dark:border-slate-700">
        <Avatar name={thread.userName} url={info?.avatarUrl || thread.userAvatarUrl} size="lg" />
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{thread.userName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t(`roles.${info?.role || thread.userRole}`,
              ROLE_LABELS_RU[info?.role || thread.userRole] || info?.role || thread.userRole)}
          </div>
        </div>
        {info?.disabled && (
          <span className="badge-red flex items-center gap-1">
            <Ban className="w-3 h-3" />
            {t('support.accountDisabled', 'Аккаунт заблокирован')}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('common.loading', 'Загрузка…')}
        </div>
      )}

      {!loading && (
        <>
          <Section title={t('support.secAccount', 'Аккаунт')}>
            <InfoRow icon={Hash} label="UID" value={info?.uid || thread.userId}
              onCopy={() => onCopy(info?.uid || thread.userId)} />
            <InfoRow icon={Mail} label="Email" value={info?.email || thread.userEmail}
              onCopy={() => onCopy(info?.email || thread.userEmail)} />
            <InfoRow icon={Phone} label={t('support.phone', 'Телефон')} value={info?.phone}
              onCopy={info?.phone ? () => onCopy(info.phone!) : undefined} />
            <InfoRow icon={MapPin} label={t('support.city', 'Город')} value={info?.city} />
            <InfoRow icon={CalendarDays} label={t('support.registered', 'Регистрация')}
              value={fmtDate(info?.createdAt)} />
            <InfoRow icon={Clock} label={t('support.lastSignIn', 'Последний вход')}
              value={fmtDate(info?.lastSignInAt)} />
          </Section>

          <Section title={t('support.secOrg', 'Учебный центр')}>
            {info?.organizationId ? (
              <>
                <InfoRow icon={Building2} label={t('support.orgName', 'Организация')}
                  value={info.organizationName || info.organizationId}
                  href={`/admin/organizations/${info.organizationId}`} />
                <InfoRow icon={Hash} label="Org ID" value={info.organizationId}
                  onCopy={() => onCopy(info.organizationId!)} />
                <InfoRow icon={Layers} label={t('support.plan', 'Тариф')} value={info.planId} />
                <InfoRow icon={Shield} label={t('support.orgRole', 'Роль в УЦ')}
                  value={info.customRoleName || info.membershipRole} />
                <InfoRow icon={GitBranch} label={t('support.branches', 'Филиалы')}
                  value={info.branchNames.length ? info.branchNames.join(', ') : null} />
              </>
            ) : (
              <p className="text-xs text-slate-400">
                {t('support.noOrgLong', 'Пользователь не состоит в организации')}
              </p>
            )}
          </Section>

          {!!info?.memberships?.length && info.memberships.length > 1 && (
            <Section title={t('support.secMemberships', 'Все организации')}>
              {info.memberships.map((m) => (
                <div key={m.organizationId} className="flex items-center justify-between gap-2 text-xs">
                  <Link
                    to={`/admin/organizations/${m.organizationId}`}
                    className="truncate text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {m.organizationName}
                  </Link>
                  <span className="shrink-0 text-slate-400">{m.role}</span>
                </div>
              ))}
            </Section>
          )}

          <Link
            to={`/admin/users/${thread.userId}`}
            className="btn-secondary w-full justify-center flex items-center gap-2 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            {t('support.openProfile', 'Открыть профиль')}
          </Link>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  );
}
