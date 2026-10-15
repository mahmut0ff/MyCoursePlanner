import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronRight, Radio, Flag, Activity, Trophy } from 'lucide-react';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { usePermissions } from '../../contexts/PermissionsContext';
import { apiContestAction, apiContestGet } from '../../lib/api';
import { useContestLive } from '../../hooks/useContestLive';
import { CONTEST_KIND_LABELS, formatContestDate, CONTEST_STATUS_LABELS, type ContestBundle, type ContestStatus } from '../../lib/contests';
import { ErrorNote, StatusBadge } from './ui';
import { primaryBtn, secondaryBtn, errMessage } from './uiStyles';
import OverviewTab from './tabs/OverviewTab';
import CategoriesTab from './tabs/CategoriesTab';
import CriteriaTab from './tabs/CriteriaTab';
import ParticipantsTab from './tabs/ParticipantsTab';
import JuryTab from './tabs/JuryTab';
import MonitorTab from './tabs/MonitorTab';
import ResultsTab from './tabs/ResultsTab';

export type TabId = 'overview' | 'categories' | 'criteria' | 'participants' | 'jury' | 'monitor' | 'results';

export interface ContestTabProps {
  data: ContestBundle;
  reload: () => Promise<void>;
  canEdit: boolean;
  canDelete: boolean;
  /** Конкурс завершён — только просмотр. */
  readOnly: boolean;
  /** POST в api-contests + тост + перечитать. null — ошибка уже показана. */
  act: <T = any>(action: string, payload?: Record<string, unknown>, success?: string) => Promise<T | null>;
  /** Перейти на вкладку; вторым аргументом — выбрать категорию (общая для Мониторинга и Итогов). */
  goTab: (tab: TabId, categoryId?: string) => void;
  /** Категория из адресной строки (`?cat=`), если она ещё существует. */
  categoryId: string | null;
  selectCategory: (categoryId: string) => void;
}

/**
 * Две фазы вместо семи одинаковых вкладок: до дня конкурса настраивают
 * (категории → критерии → участники → жюри), в день конкурса живут на
 * «Мониторинге» и «Итогах». Ids стабильны — они в адресной строке.
 */
const TAB_GROUPS: { label: string; tabs: { id: TabId; label: string }[] }[] = [
  { label: 'Подготовка', tabs: [
    { id: 'overview', label: 'Обзор' },
    { id: 'categories', label: 'Категории и призы' },
    { id: 'criteria', label: 'Критерии' },
    { id: 'participants', label: 'Участники' },
    { id: 'jury', label: 'Жюри' },
  ] },
  { label: 'День конкурса', tabs: [
    { id: 'monitor', label: 'Мониторинг' },
    { id: 'results', label: 'Итоги' },
  ] },
];
const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));

/** Вкладка по умолчанию — там, где сейчас работа. */
const DEFAULT_TAB: Record<ContestStatus, TabId> = {
  draft: 'overview',
  registration: 'participants',
  judging: 'monitor',
  finished: 'results',
};

/** Следующий шаг конкурса: подпись кнопки и что она значит. */
const STATUS_STEP: Record<ContestStatus, { next: ContestStatus; label: string; hint: string } | null> = {
  draft: { next: 'registration', label: 'Открыть регистрацию', hint: 'Можно будет добавлять участников. Настройки остаются доступны.' },
  registration: { next: 'judging', label: 'Начать день конкурса', hint: 'Откроется мониторинг: оценивание по категориям, вызов проектов, итоги. Критерии зафиксируются, как только откроется первая категория.' },
  judging: { next: 'finished', label: 'Завершить конкурс', hint: 'Конкурс станет доступен только для просмотра. Открытые категории закроются. Убедитесь, что итоги всех категорий утверждены.' },
  finished: null,
};

const metaKey = (c: ContestBundle['contest']) =>
  JSON.stringify([c.title, c.season, c.kind, c.theme, c.eventDate, c.venue, c.prizeFund, c.description, c.judgingMode]);
// Только редактируемые поля: счётчики номеров, состояние оценивания и вызванный
// проект меняются в день конкурса и не должны сбрасывать черновик настроек.
const categoriesKey = (c: ContestBundle['contest']) =>
  JSON.stringify(c.categories.map((x) => [x.id, x.code, x.name, x.ageFrom, x.ageTo, x.prizes]));

type Mark = { kind: 'warn' | 'live' | 'done' | 'count'; text?: string; title: string } | null;

/** Индикатор на вкладке: что требует внимания, что идёт, что сделано. */
function tabMark(id: TabId, d: ContestBundle): Mark {
  const { contest: c, participants, jury } = d;
  switch (id) {
    case 'categories':
      return c.categories.length ? null : { kind: 'warn', title: 'Категории не заданы' };
    case 'criteria':
      return c.criteria.length ? null : { kind: 'warn', title: 'Критерии не заданы' };
    case 'participants': {
      if (c.status === 'judging') {
        const waiting = participants.filter((p) => p.status === 'registered').length;
        return waiting ? { kind: 'count', text: String(waiting), title: `Не отмечены пришедшими: ${waiting}` } : null;
      }
      const n = participants.filter((p) => p.status !== 'withdrawn').length;
      if (n) return { kind: 'count', text: String(n), title: `Участников: ${n}` };
      return c.status === 'registration' ? { kind: 'warn', title: 'Участников пока нет' } : null;
    }
    case 'jury':
      if (jury.length) return { kind: 'count', text: String(jury.length), title: `Членов жюри: ${jury.length}` };
      return c.status === 'draft' ? null : { kind: 'warn', title: 'Жюри не назначено' };
    case 'monitor':
      return c.categories.some((x) => x.judging === 'open') ? { kind: 'live', title: 'Идёт оценивание' } : null;
    case 'results': {
      if (c.categories.length && c.categories.every((x) => x.judging === 'approved')) return { kind: 'done', title: 'Итоги всех категорий утверждены' };
      const closed = c.categories.filter((x) => x.judging === 'closed').length;
      return closed ? { kind: 'warn', text: String(closed), title: `Ждут утверждения: ${closed}` } : null;
    }
    default:
      return null;
  }
}

const MarkDot: React.FC<{ mark: Mark }> = ({ mark }) => {
  if (!mark) return null;
  const base = 'inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-none';
  if (mark.kind === 'live') return <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title={mark.title} aria-label={mark.title} role="img" />;
  if (mark.kind === 'done') return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300`} title={mark.title} aria-label={mark.title} role="img">✓</span>;
  if (mark.kind === 'warn') return <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300`} title={mark.title} aria-label={mark.title} role="img">{mark.text || '!'}</span>;
  return <span className={`${base} bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300`} title={mark.title} aria-label={mark.title} role="img">{mark.text}</span>;
};

const ContestDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { canWrite, canDelete } = usePermissions();
  const [data, setData] = useState<ContestBundle | null>(null);
  const [error, setError] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<ContestStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const tablistRef = useRef<HTMLDivElement>(null);

  const inFlight = useRef<Promise<void> | null>(null);
  const reload = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try { setData(await apiContestGet(id)); setError(''); } catch (e) { setError(errMessage(e)); }
    })();
    inFlight.current = run;
    try { await run; } finally { inFlight.current = null; }
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  // Живое обновление: ревизия растёт на каждой оценке/правке — перечитываем.
  const { live, mode } = useContestLive(id, async () => {
    const b = await apiContestGet(id);
    setData(b);
    return { rev: b.contest.rev, status: b.contest.status, categories: {} };
  }, 10000);
  const lastRev = useRef<number | null>(null);
  useEffect(() => {
    if (!live || mode !== 'live') return;
    if (lastRev.current !== null && live.rev !== lastRev.current) reload();
    lastRev.current = live.rev;
  }, [live, mode, reload]);

  const act = useCallback(async <T,>(action: string, payload?: Record<string, unknown>, success?: string): Promise<T | null> => {
    try {
      const res = await apiContestAction<T>(action, id, payload);
      if (success) toast.success(success);
      await reload();
      return res;
    } catch (e) {
      toast.error(errMessage(e));
      return null;
    }
  }, [id, reload]);

  const contest = data?.contest;
  const requestedTab = params.get('tab');
  const tab: TabId = ALL_TABS.includes(requestedTab as TabId)
    ? (requestedTab as TabId)
    : contest ? DEFAULT_TAB[contest.status] : 'overview';
  const requestedCat = params.get('cat');
  const categoryId = contest && requestedCat && contest.categories.some((c) => c.id === requestedCat) ? requestedCat : null;

  const goTab = useCallback((next: TabId, cat?: string) => {
    setParams((p) => { p.set('tab', next); if (cat) p.set('cat', cat); return p; }, { replace: true });
    tablistRef.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [setParams]);
  const selectCategory = useCallback((cat: string) => {
    setParams((p) => { p.set('cat', cat); return p; }, { replace: true });
  }, [setParams]);

  // Клавиатура по вкладкам: стрелки, Home/End — как у нативного tablist.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = ALL_TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? ALL_TABS[(i + 1) % ALL_TABS.length]
      : e.key === 'ArrowLeft' ? ALL_TABS[(i - 1 + ALL_TABS.length) % ALL_TABS.length]
        : e.key === 'Home' ? ALL_TABS[0] : e.key === 'End' ? ALL_TABS[ALL_TABS.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    goTab(next);
    tablistRef.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  };

  const step = useMemo(() => (contest ? STATUS_STEP[contest.status] : null), [contest]);

  const changeStatus = async () => {
    if (!confirmStatus) return;
    setBusy(true);
    const ok = await act('setStatus', { status: confirmStatus }, `Статус: ${CONTEST_STATUS_LABELS[confirmStatus]}`);
    setBusy(false);
    if (ok) {
      setConfirmStatus(null);
      goTab(DEFAULT_TAB[confirmStatus]);
    }
  };

  if (!data || !contest) {
    return (
      <div className="space-y-4">
        <Link to="/contests" className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"><ArrowLeft className="w-4 h-4" />{t('nav.contests', 'Конкурсы')}</Link>
        {error ? <ErrorNote>{error}</ErrorNote> : <CardSkeleton />}
      </div>
    );
  }

  const canEdit = canWrite('contests');
  const props: ContestTabProps = {
    data, reload, act, goTab, categoryId, selectCategory,
    canEdit,
    canDelete: canDelete('contests'),
    readOnly: contest.status === 'finished',
  };

  // В день конкурса главная кнопка шапки ведёт к работе, а не к необратимому
  // «Завершить»: оно остаётся, но второстепенным.
  const dayOfContest = contest.status === 'judging';
  let headerActions: React.ReactNode = null;
  if (canEdit && dayOfContest) {
    headerActions = (
      <div className="flex items-center gap-2">
        {tab !== 'monitor' && tab !== 'results' && (
          <button onClick={() => goTab('monitor')} className={primaryBtn}><Activity className="w-4 h-4" />Мониторинг</button>
        )}
        {step && <button onClick={() => setConfirmStatus(step.next)} className={secondaryBtn} title={step.hint}><Flag className="w-4 h-4" />{step.label}</button>}
      </div>
    );
  } else if (canEdit && step) {
    headerActions = <button onClick={() => setConfirmStatus(step.next)} className={primaryBtn}>{step.label}<ChevronRight className="w-4 h-4" /></button>;
  } else if (contest.status === 'finished' && tab !== 'results') {
    headerActions = <button onClick={() => goTab('results')} className={secondaryBtn}><Trophy className="w-4 h-4" />Итоги</button>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/contests" className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white mb-3"><ArrowLeft className="w-4 h-4" />{t('nav.contests', 'Конкурсы')}</Link>
        <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500 dark:text-slate-400">
              <span>{CONTEST_KIND_LABELS[contest.kind]}{contest.season ? ` · ${contest.season}` : ''}</span>
              <StatusBadge status={contest.status} />
              {dayOfContest && mode === 'live' && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 normal-case tracking-normal"><Radio className="w-3 h-3" />в реальном времени</span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">{contest.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-500 dark:text-slate-400 mt-1">
              {[formatContestDate(contest.eventDate), contest.venue, contest.theme].filter(Boolean).join(' · ')}
            </p>
          </div>
          {headerActions}
        </header>
      </div>

      <div ref={tablistRef} role="tablist" aria-label="Разделы конкурса" onKeyDown={onTabKey}
        className="flex items-stretch gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
        {TAB_GROUPS.map((g, gi) => (
          <React.Fragment key={g.label}>
            {gi > 0 && <span aria-hidden className="w-px my-1.5 bg-slate-300 dark:bg-slate-600 shrink-0" />}
            <div className="flex items-center gap-0.5">
              <span className="hidden md:block px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500 dark:text-slate-400 whitespace-nowrap select-none" aria-hidden>{g.label}</span>
              {g.tabs.map((x) => {
                const active = tab === x.id;
                return (
                  <button
                    key={x.id} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} data-tab={x.id}
                    onClick={() => goTab(x.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${active ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
                  >
                    {x.label}<MarkDot mark={tabMark(x.id, data)} />
                  </button>
                );
              })}
            </div>
          </React.Fragment>
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div role="tabpanel">
        {/* Вкладки с черновиком формы перемонтируются, когда меняются их данные на
            сервере, — так форма не держит устаревшее после чужой правки. */}
        {tab === 'overview' && <OverviewTab key={metaKey(contest)} {...props} />}
        {tab === 'categories' && <CategoriesTab key={categoriesKey(contest)} {...props} />}
        {tab === 'criteria' && <CriteriaTab key={JSON.stringify([contest.criteria, contest.tieBreakCriterionIds])} {...props} />}
        {tab === 'participants' && <ParticipantsTab {...props} />}
        {tab === 'jury' && <JuryTab {...props} />}
        {tab === 'monitor' && <MonitorTab {...props} />}
        {tab === 'results' && <ResultsTab {...props} />}
      </div>

      <ConfirmDialog
        open={!!confirmStatus}
        title={`${step?.label || 'Сменить статус'}?`}
        message={step?.hint || ''}
        confirmLabel={confirmStatus === 'finished' ? 'Завершить' : 'Да, продолжить'}
        danger={confirmStatus === 'finished'}
        busy={busy}
        onConfirm={changeStatus}
        onClose={() => setConfirmStatus(null)}
      />
    </div>
  );
};

export default ContestDetailPage;
