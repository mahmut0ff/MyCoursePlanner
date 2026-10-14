import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronRight, Radio } from 'lucide-react';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { usePermissions } from '../../contexts/PermissionsContext';
import { apiContestAction, apiContestGet } from '../../lib/api';
import { useContestLive } from '../../hooks/useContestLive';
import { CONTEST_KIND_LABELS, formatContestDate, CONTEST_STATUS_LABELS, CONTEST_STATUS_ORDER, type ContestBundle, type ContestStatus } from '../../lib/contests';
import { ErrorNote, StatusBadge } from './ui';
import { primaryBtn, errMessage } from './uiStyles';
import OverviewTab from './tabs/OverviewTab';
import CategoriesTab from './tabs/CategoriesTab';
import CriteriaTab from './tabs/CriteriaTab';
import ParticipantsTab from './tabs/ParticipantsTab';
import JuryTab from './tabs/JuryTab';
import MonitorTab from './tabs/MonitorTab';
import ResultsTab from './tabs/ResultsTab';

export interface ContestTabProps {
  data: ContestBundle;
  reload: () => Promise<void>;
  canEdit: boolean;
  canDelete: boolean;
  /** Конкурс завершён — только просмотр. */
  readOnly: boolean;
  /** POST в api-contests + тост + перечитать. null — ошибка уже показана. */
  act: <T = any>(action: string, payload?: Record<string, unknown>, success?: string) => Promise<T | null>;
}

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'categories', label: 'Категории и призы' },
  { id: 'criteria', label: 'Критерии' },
  { id: 'participants', label: 'Участники' },
  { id: 'jury', label: 'Жюри' },
  { id: 'monitor', label: 'Мониторинг' },
  { id: 'results', label: 'Итоги' },
] as const;
type TabId = typeof TABS[number]['id'];

const NEXT_HINT: Partial<Record<ContestStatus, string>> = {
  draft: 'Откроется регистрация участников.',
  registration: 'Можно будет открывать оценивание по категориям. Критерии зафиксируются, как только откроется первая категория.',
  judging: 'Конкурс станет доступен только для просмотра. Открытые категории закроются. Убедитесь, что итоги всех категорий утверждены.',
};

const metaKey = (c: ContestBundle['contest']) =>
  JSON.stringify([c.title, c.season, c.kind, c.theme, c.eventDate, c.venue, c.prizeFund, c.description]);

const ContestDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { canWrite, canDelete } = usePermissions();
  const [data, setData] = useState<ContestBundle | null>(null);
  const [error, setError] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<ContestStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const tab = (TABS.some((x) => x.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId;
  const setTab = (next: TabId) => setParams((p) => { p.set('tab', next); return p; }, { replace: true });

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
  const nextStatus = useMemo(() => {
    if (!contest) return null;
    const i = CONTEST_STATUS_ORDER.indexOf(contest.status);
    return i >= 0 && i < CONTEST_STATUS_ORDER.length - 1 ? CONTEST_STATUS_ORDER[i + 1] : null;
  }, [contest]);

  const changeStatus = async () => {
    if (!confirmStatus) return;
    setBusy(true);
    const ok = await act('setStatus', { status: confirmStatus }, `Статус: ${CONTEST_STATUS_LABELS[confirmStatus]}`);
    setBusy(false);
    if (ok) setConfirmStatus(null);
  };

  if (!data || !contest) {
    return (
      <div className="space-y-4">
        <Link to="/contests" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"><ArrowLeft className="w-4 h-4" />{t('nav.contests', 'Конкурсы')}</Link>
        {error ? <ErrorNote>{error}</ErrorNote> : <CardSkeleton />}
      </div>
    );
  }

  const props: ContestTabProps = {
    data, reload, act,
    canEdit: canWrite('contests'),
    canDelete: canDelete('contests'),
    readOnly: contest.status === 'finished',
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/contests" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white mb-3"><ArrowLeft className="w-4 h-4" />{t('nav.contests', 'Конкурсы')}</Link>
        <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span>{CONTEST_KIND_LABELS[contest.kind]}{contest.season ? ` · ${contest.season}` : ''}</span>
              <StatusBadge status={contest.status} />
              {contest.status === 'judging' && mode === 'live' && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 normal-case tracking-normal"><Radio className="w-3 h-3" />в реальном времени</span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">{contest.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {[formatContestDate(contest.eventDate), contest.venue, contest.theme].filter(Boolean).join(' · ')}
            </p>
          </div>
          {props.canEdit && nextStatus && (
            <button onClick={() => setConfirmStatus(nextStatus)} className={primaryBtn}>
              {nextStatus === 'finished' ? 'Завершить конкурс' : `Перейти: ${CONTEST_STATUS_LABELS[nextStatus]}`}<ChevronRight className="w-4 h-4" />
            </button>
          )}
        </header>
      </div>

      <div role="tablist" className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
        {TABS.map((x) => (
          <button
            key={x.id} role="tab" aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors ${tab === x.id ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Вкладки с черновиком формы перемонтируются, когда меняются их данные на
          сервере, — так форма не держит устаревшее после чужой правки. */}
      {tab === 'overview' && <OverviewTab key={metaKey(contest)} {...props} />}
      {tab === 'categories' && <CategoriesTab key={JSON.stringify(contest.categories)} {...props} />}
      {tab === 'criteria' && <CriteriaTab key={JSON.stringify([contest.criteria, contest.tieBreakCriterionIds])} {...props} />}
      {tab === 'participants' && <ParticipantsTab {...props} />}
      {tab === 'jury' && <JuryTab {...props} />}
      {tab === 'monitor' && <MonitorTab {...props} />}
      {tab === 'results' && <ResultsTab {...props} />}

      <ConfirmDialog
        open={!!confirmStatus}
        title={confirmStatus === 'finished' ? 'Завершить конкурс?' : `Перевести в «${confirmStatus ? CONTEST_STATUS_LABELS[confirmStatus] : ''}»?`}
        message={confirmStatus ? NEXT_HINT[contest.status] || '' : ''}
        confirmLabel={confirmStatus === 'finished' ? 'Завершить' : 'Перевести'}
        danger={confirmStatus === 'finished'}
        busy={busy}
        onConfirm={changeStatus}
        onClose={() => setConfirmStatus(null)}
      />
    </div>
  );
};

export default ContestDetailPage;
