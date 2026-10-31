/**
 * Экран оценивания жюри. Делается под телефон: крупные кнопки, один столбец,
 * сумма и «Сохранить» всегда внизу экрана.
 *
 * Навигация — в адресной строке (?c=конкурс&cat=категория&p=проект), поэтому
 * системная кнопка «Назад» на телефоне возвращает к списку, как ожидается.
 *
 * Связь: черновик каждого проекта живёт в localStorage с первого нажатия. Если
 * сохранение не дошло из-за сети, оценка встаёт в очередь и отправляется сама,
 * когда связь вернётся; с экрана ничего не пропадает.
 *
 * Режим конкурса (contest.judgingMode):
 *  host — ведущий вызывает проект с мониторинга: экран открывает его сам, если
 *         жюри не в середине ввода (иначе плашка «Ведущий открыл …»); список
 *         проектов вторичен.
 *  free — жюри ходят по столам сами: никаких автопереходов, главное — список и
 *         поиск по номеру.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  LogOut, ChevronLeft, ChevronRight, Search, CheckCircle2, Circle, Minus, Plus, Megaphone,
  WifiOff, Lock, Moon, Sun, Gavel, Trophy, CloudUpload,
} from 'lucide-react';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import RowMenu from '../../components/ui/RowMenu';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { signOut } from '../../services/auth.service';
import { apiJudgeBoard, apiJudgeLive, apiJudgeMy, apiJudgeScore } from '../../lib/api';
import { useContestLive } from '../../hooks/useContestLive';
import { maxTotal, normalizeProjectNumber, round2, type JudgeBoard, type JudgeContest, type JudgeProject } from '../../lib/contests';

// ─── Локальное хранилище: черновики и очередь неотправленного ───
type Pending = { contestId: string; participantId: string; scores: Record<string, number>; at: string };
const lsGet = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
const draftKey = (uid: string, c: string, p: string) => `judge:draft:${uid}:${c}:${p}`;
const queueKey = (uid: string) => `judge:queue:${uid}`;

/** Сеть, а не отказ сервера: fetch бросил до ответа (у ошибки нет HTTP-статуса). */
const isNetworkError = (e: any) => !e?.status && (e instanceof TypeError || !navigator.onLine || /fetch|network|failed/i.test(String(e?.message)));

const bigBtn = 'w-full flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 text-left active:scale-[0.99] transition-transform';

const JudgePage: React.FC = () => {
  const { t } = useTranslation();
  const { profile, firebaseUser } = useAuth();
  const { isDark, toggle } = useTheme();
  const uid = firebaseUser?.uid || '';
  const [params, setParams] = useSearchParams();
  const contestId = params.get('c') || '';
  const categoryId = params.get('cat') || '';
  const projectId = params.get('p') || '';
  const go = useCallback((next: { c?: string | null; cat?: string | null; p?: string | null }, replace = false) => {
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) { if (v) n.set(k, v); else n.delete(k); }
      return n;
    }, { replace });
  }, [setParams]);

  const [contests, setContests] = useState<JudgeContest[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [board, setBoard] = useState<JudgeBoard | null>(null);
  const [boardError, setBoardError] = useState('');
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [queue, setQueue] = useState<Pending[]>(() => (uid ? lsGet<Pending[]>(queueKey(uid), []) : []));

  // ─── Мои конкурсы ───
  const loadMy = useCallback(async () => {
    try {
      const r = await apiJudgeMy();
      setContests(r.contests);
      setLoadError('');
    } catch (e: any) { setLoadError(isNetworkError(e) ? t('judge.err.noConnection', 'Нет связи с сервером') : (e?.message || t('judge.err.load', 'Ошибка загрузки'))); }
  }, [t]);
  useEffect(() => { loadMy(); }, [loadMy]);

  // Один конкурс / одна категория — выбираем сами, без лишнего экрана.
  useEffect(() => {
    if (!contests) return;
    if (!contestId && contests.length === 1) go({ c: contests[0].id }, true);
  }, [contests, contestId, go]);

  const contest = contests?.find((c) => c.id === contestId) || null;

  // ─── Живое состояние: открыта ли категория, кого вызвал ведущий ───
  const { live } = useContestLive(contest?.id, async () => {
    const c = await apiJudgeLive(contestId);
    return { status: c.status, judgingMode: c.judgingMode, rev: 0, categories: Object.fromEntries(c.categories.map((x) => [x.id, x])) };
  }, 6000);
  const liveCat = (id: string) => {
    const base = contest?.categories.find((x) => x.id === id);
    const l = live?.categories?.[id];
    return base ? { ...base, ...(l ? { judging: l.judging, currentParticipantId: l.currentParticipantId, currentSetAt: l.currentSetAt } : {}) } : undefined;
  };
  const cat = categoryId ? liveCat(categoryId) : undefined;
  // Режим — из живого документа: его могут переключить в день конкурса.
  const hostMode = (live?.judgingMode || contest?.judgingMode) !== 'free';

  useEffect(() => {
    if (!contest || categoryId) return;
    if (contest.categories.length === 1) go({ cat: contest.categories[0].id }, true);
  }, [contest, categoryId, go]);

  // ─── Проекты категории + мои оценки ───
  const loadBoard = useCallback(async () => {
    if (!contestId || !categoryId) return;
    try {
      setBoard(await apiJudgeBoard(contestId, categoryId));
      setBoardError('');
    } catch (e: any) { setBoardError(isNetworkError(e) ? t('judge.err.offlineCached', 'Нет связи — показываю последнее загруженное') : (e?.message || t('judge.err.generic', 'Ошибка'))); }
  }, [contestId, categoryId, t]);
  useEffect(() => { setBoard(null); loadBoard(); }, [loadBoard]);
  // Вернулись к списку — освежить отметки.
  useEffect(() => { if (!projectId) loadBoard(); }, [projectId, loadBoard]);
  // Ведущий вызвал проект, которого у нас ещё нет (отметили «Пришёл» только что) — перечитать.
  useEffect(() => {
    const cur = cat?.currentParticipantId;
    if (cur && board && !board.projects.some((p) => p.id === cur)) loadBoard();
  }, [cat?.currentParticipantId, board, loadBoard]);

  // ─── Очередь неотправленных ───
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (!uid || flushing.current) return;
    const q = lsGet<Pending[]>(queueKey(uid), []);
    if (!q.length) return;
    flushing.current = true;
    const left: Pending[] = [];
    let sent = 0;
    for (const item of q) {
      try {
        await apiJudgeScore(item.contestId, item.participantId, item.scores);
        lsSet(draftKey(uid, item.contestId, item.participantId), null);
        sent++;
      } catch (e: any) {
        if (isNetworkError(e)) left.push(item);
        else toast.error(t('judge.scoreRejected', 'Оценка не принята: {{error}}', { error: e?.message || t('judge.err.generic', 'Ошибка') }));
      }
    }
    lsSet(queueKey(uid), left.length ? left : null);
    setQueue(left);
    flushing.current = false;
    if (sent) { toast.success(t('judge.sentCount', 'Отправлено оценок: {{n}}', { n: sent })); loadBoard(); }
  }, [uid, loadBoard, t]);

  useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(() => { if (lsGet<Pending[]>(queueKey(uid), []).length) flush(); }, 15000);
    flush();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, [flush, uid]);

  // ─── Ведущий (только в режиме host) ───
  // НОВЫЙ вызов (другой проект или повторный вызов того же) открывает проект
  // сам, если жюри не в середине ввода. Вызов, который висел ещё до открытия
  // экрана, никуда не уводит: его показывает карточка «Сейчас на сцене» в
  // списке и плашка сверху на экране другого проекта.
  const [dirty, setDirty] = useState(false);
  const called = hostMode && cat?.currentParticipantId ? board?.projects.find((p) => p.id === cat.currentParticipantId) : undefined;
  const callStamp = called ? `${called.id}@${cat?.currentSetAt}` : null;
  const seenCall = useRef<string | null>(null);
  useEffect(() => {
    if (!board || !live) return;
    // Точка отсчёта — первое состояние после загрузки списка и live: что висело
    // на тот момент (или ничего), новым вызовом не считается.
    if (seenCall.current === null) { seenCall.current = callStamp ?? ''; return; }
    if (!callStamp || callStamp === seenCall.current || !called) return;
    seenCall.current = callStamp;
    if (called.id === projectId) return;
    if (!dirty) { go({ p: called.id }); toast(t('judge.hostOpened', 'Ведущий открыл {{number}}', { number: called.number }), { icon: '📣' }); }
  }, [board, live, callStamp, called, projectId, dirty, go, t]);
  // Плашка — только на экране ДРУГОГО проекта; в списке за это отвечает карточка «Сейчас на сцене».
  const callout = projectId && called && called.id !== projectId ? called : null;

  const name = profile?.displayName || '';

  // ─── Разметка ───
  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center gap-2">
          {(contestId && (categoryId || (contests && contests.length > 1))) ? (
            <button onClick={() => (projectId ? go({ p: null }) : categoryId && contest && contest.categories.length > 1 ? go({ cat: null }) : contests && contests.length > 1 ? go({ c: null, cat: null }) : undefined)}
              className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center active:bg-slate-100 dark:active:bg-slate-800" aria-label={projectId ? t('judge.backToProjects', 'К списку проектов') : t('common.back', 'Назад')}><ChevronLeft className="w-6 h-6" /></button>
          ) : <Gavel className="w-5 h-5 text-primary-500" aria-hidden />}
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">{contest ? contest.title : t('judge.title', 'Оценивание')}</div>
            <div className="text-[12px] text-slate-600 dark:text-slate-400 truncate">{cat ? `${t('judge.categoryCode', 'Категория {{code}}', { code: cat.code })}${cat.name ? ` · ${cat.name}` : ''}` : name}</div>
          </div>
          {/* Одно меню вместо двух соседних иконок: «Выйти» — за подтверждением, чтобы промах пальцем не выкинул из оценивания. */}
          <RowMenu label={t('judge.menu', 'Меню')} buttonClassName="w-11 h-11 -mr-2 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800" items={[
            { label: isDark ? t('judge.lightTheme', 'Светлая тема') : t('judge.darkTheme', 'Тёмная тема'), icon: isDark ? Sun : Moon, onSelect: toggle },
            { label: t('judge.logout', 'Выйти из учётной записи'), icon: LogOut, danger: true, separated: true, onSelect: () => setConfirmLogout(true) },
          ]} />
        </div>
        {(!online || queue.length > 0) && (
          <div className={`px-4 py-2 text-[13px] font-medium flex items-center justify-center gap-2 ${online ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200'}`}>
            {online ? <CloudUpload className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {online ? t('judge.sendingQueued', 'Отправляю сохранённые оценки: {{n}}…', { n: queue.length }) : queue.length ? t('judge.offlineQueued', 'Нет связи. Не отправлено оценок: {{n}} — они на телефоне и уйдут сами', { n: queue.length }) : t('judge.offline', 'Нет связи с интернетом')}
          </div>
        )}
        {callout && (
          <button onClick={() => go({ p: callout.id })} className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-700 text-white text-[14px] font-semibold flex items-center justify-center gap-2">
            <Megaphone className="w-4 h-4" aria-hidden />{t('judge.hostOpenedGo', 'Ведущий открыл {{number}} — перейти', { number: callout.number })}
          </button>
        )}
      </header>

      <ConfirmDialog
        open={confirmLogout}
        title={t('judge.logoutConfirm', 'Выйти из учётной записи?')}
        message={queue.length ? t('judge.logoutQueued', 'Не отправлено оценок: {{n}}. Они останутся на этом телефоне и уйдут после следующего входа при наличии связи.', { n: queue.length }) : t('judge.logoutHint', 'Для входа снова понадобятся email и пароль, выданные организатором.')}
        confirmLabel={t('common.logout', 'Выйти')} danger
        onConfirm={() => signOut()}
        onClose={() => setConfirmLogout(false)}
      />

      <main className="max-w-xl mx-auto px-4 py-4 pb-40">
        {loadError && !contests && <Notice tone="error">{loadError}<button onClick={loadMy} className="ml-2 underline">{t('judge.retry', 'Повторить')}</button></Notice>}
        {!contests && !loadError && <Spinner />}

        {/* 1. Конкурсы */}
        {contests && !contestId && (
          contests.length === 0 ? (
            <Empty icon={<Trophy className="w-8 h-8" />} title={t('judge.noContests', 'Пока нет конкурсов для оценивания')} text={t('judge.noContestsText', 'Когда организатор откроет регистрацию или оценивание, конкурс появится здесь.')} />
          ) : (
            <div className="space-y-3">
              <h1 className="text-xl font-bold mb-1">{name ? t('judge.helloName', 'Здравствуйте, {{name}}!', { name }) : t('judge.hello', 'Здравствуйте!')}</h1>
              {contests.map((c) => (
                <button key={c.id} onClick={() => go({ c: c.id })} className={bigBtn}>
                  <Trophy className="w-6 h-6 text-primary-500 shrink-0" />
                  <span className="flex-1 min-w-0"><span className="block font-bold truncate">{c.title}</span><span className="block text-[13px] text-slate-600 dark:text-slate-400 truncate">{c.organizationName}</span></span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              ))}
            </div>
          )
        )}

        {/* 2. Категории */}
        {contest && !categoryId && (
          <div className="space-y-3">
            {contest.status !== 'judging' && <Notice tone="info">{t('judge.notStarted', 'Оценивание ещё не началось. Организатор откроет категории в день конкурса.')}</Notice>}
            <h1 className="text-xl font-bold">{t('judge.pickCategory', 'Выберите категорию')}</h1>
            {contest.categories.map((c0) => {
              const c = liveCat(c0.id)!;
              return (
                <button key={c.id} onClick={() => go({ cat: c.id })} className={bigBtn}>
                  <span className="w-12 h-12 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center text-xl font-black shrink-0">{c.code}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold truncate">{c.name || t('judge.categoryCode', 'Категория {{code}}', { code: c.code })}</span>
                    <JudgingLine state={c.judging} />
                  </span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              );
            })}
          </div>
        )}

        {/* 3. Список проектов */}
        {contest && cat && !projectId && (
          <ProjectList board={board} error={boardError} cat={cat} max={maxTotal(contest.criteria)} queue={queue} hostMode={hostMode}
            onOpen={(id) => go({ p: id })} onRetry={loadBoard} />
        )}

        {/* 4. Оценка проекта */}
        {contest && cat && projectId && board && (() => {
          const idx = board.projects.findIndex((p) => p.id === projectId);
          const project = board.projects[idx];
          if (!project) return <Notice tone="error">{t('judge.projectNotFound', 'Проект не найден в категории.')} <button onClick={() => go({ p: null })} className="underline">{t('judge.toList', 'К списку')}</button></Notice>;
          return (
            <ScoreForm
              key={project.id}
              uid={uid}
              contest={contest}
              project={project}
              open={cat.judging === 'open' && contest.status === 'judging'}
              closedReason={cat.judging === 'approved' ? t('judge.closedApproved', 'Итоги категории утверждены — оценки больше не меняются.') : t('judge.closedByOrganizer', 'Оценивание категории сейчас закрыто организатором. Ваши баллы сохранятся на телефоне — отправите, когда категорию откроют.')}
              saved={board.mine[project.id]}
              next={board.projects[idx + 1]}
              prev={board.projects[idx - 1]}
              onDirty={setDirty}
              onNavigate={(id) => go({ p: id })}
              onSaved={(total, scores) => setBoard((b) => b && ({ ...b, mine: { ...b.mine, [project.id]: { scores, total, updatedAt: new Date().toISOString(), updatedByRole: 'jury' } } }))}
              onQueued={(item) => {
                const q = [...lsGet<Pending[]>(queueKey(uid), []).filter((x) => !(x.contestId === item.contestId && x.participantId === item.participantId)), item];
                lsSet(queueKey(uid), q); setQueue(q);
              }}
            />
          );
        })()}
        {contest && cat && projectId && !board && !boardError && <Spinner />}
        {contest && cat && projectId && !board && boardError && <Notice tone="error">{boardError}</Notice>}
      </main>
    </div>
  );
};

// ─── Список проектов ───
const ProjectList: React.FC<{
  board: JudgeBoard | null; error: string; cat: { code: string; judging: JudgeBoard['category']['judging']; currentParticipantId: string | null };
  max: number; queue: Pending[]; hostMode: boolean; onOpen: (id: string) => void; onRetry: () => void;
}> = ({ board, error, cat, max, queue, hostMode, onOpen, onRetry }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  if (!board) return error ? <Notice tone="error">{error}<button onClick={onRetry} className="ml-2 underline">{t('judge.retry', 'Повторить')}</button></Notice> : <Spinner />;
  const done = board.projects.filter((p) => board.mine[p.id]).length;
  const queued = new Set(queue.map((x) => x.participantId));
  const norm = normalizeProjectNumber(q);
  const needle = q.trim().toLowerCase();
  const list = !needle ? board.projects : board.projects.filter((p) => {
    if (norm && (p.number === norm || p.number.endsWith(`-${norm.padStart(2, '0')}`))) return true;
    return p.number.toLowerCase().includes(needle) || p.projectTitle.toLowerCase().includes(needle);
  });
  const exact = norm ? board.projects.find((p) => p.number === norm || (/^\d+$/.test(norm) && p.number === `${cat.code}-${norm.padStart(2, '0')}`)) : undefined;
  const current = hostMode && cat.currentParticipantId ? board.projects.find((p) => p.id === cat.currentParticipantId) : undefined;
  const left = board.projects.length - done;

  return (
    <div className="space-y-3">
      {error && <Notice tone="warn">{error}</Notice>}
      <div className="flex items-center justify-between">
        <JudgingLine state={cat.judging} />
        <span className="text-[13px] text-slate-600 dark:text-slate-300">{t('judge.rated', 'Оценено')} <b className="text-slate-900 dark:text-white">{done}</b> {t('judge.ofTotal', 'из {{total}}', { total: board.projects.length })}{left > 0 && done > 0 ? t('judge.left', ' · осталось {{n}}', { n: left }) : ''}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={done} aria-valuemax={board.projects.length} aria-label={t('judge.ratedProjects', 'Оценено проектов')}>
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${board.projects.length ? (done / board.projects.length) * 100 : 0}%` }} />
      </div>

      {current && (
        <button onClick={() => onOpen(current.id)} className="w-full rounded-2xl bg-emerald-700 text-white px-4 py-3.5 flex items-center gap-3 text-left">
          <Megaphone className="w-5 h-5 shrink-0" aria-hidden />
          <span className="flex-1 min-w-0"><span className="block text-[12px] text-emerald-100">{board.mine[current.id] ? t('judge.onStageRated', 'Сейчас на сцене · вы уже оценили') : t('judge.onStage', 'Сейчас на сцене')}</span><span className="block font-bold truncate">{current.number} · {current.projectTitle}</span></span>
          <ChevronRight className="w-5 h-5" aria-hidden />
        </button>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (exact) onOpen(exact.id); else if (list.length === 1) onOpen(list[0].id); }} className="relative">
        <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('judge.searchPlaceholder', 'Номер, напр. {{example}}', { example: `${cat.code}-03` })} aria-label={t('judge.searchAria', 'Поиск по номеру проекта')} enterKeyHint="go" autoCapitalize="characters"
          className="w-full h-14 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-11 pr-24 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500" />
        {(exact || list.length === 1) && q && <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-4 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold">{t('judge.open', 'Открыть')}</button>}
      </form>

      {!board.projects.length && <Empty icon={<Circle className="w-8 h-8" />} title={t('judge.noProjects', 'Проектов пока нет')} text={t('judge.noProjectsText', 'Здесь появятся участники, отмеченные на месте.')} />}

      <ul className="space-y-2">
        {list.map((p) => {
          const mine = board.mine[p.id];
          const waiting = queued.has(p.id);
          return (
            <li key={p.id}>
              <button onClick={() => onOpen(p.id)} className={`${bigBtn} py-3.5 ${hostMode && p.id === cat.currentParticipantId ? 'ring-2 ring-emerald-500' : ''}`}>
                <span className="font-mono font-black text-lg w-16 shrink-0">{p.number}</span>
                <span className="flex-1 min-w-0 font-medium truncate">{p.projectTitle || t('judge.untitled', 'Без названия')}</span>
                {waiting
                  ? <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-[13px] font-semibold"><WifiOff className="w-4 h-4" aria-hidden />{t('judge.notSent', 'не отправлено')}</span>
                  : mine
                    ? <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold"><CheckCircle2 className="w-5 h-5" aria-hidden /><span className="sr-only">{t('judge.ratedSr', 'оценён, ')}</span>{round2(mine.total)}<span className="text-slate-500 dark:text-slate-400 text-[12px] font-normal">/{max}</span></span>
                    : <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400 text-[13px]"><Circle className="w-5 h-5" aria-hidden />{t('judge.notRated', 'не оценён')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ─── Форма оценки ───
const ScoreForm: React.FC<{
  uid: string;
  contest: JudgeContest;
  project: JudgeProject;
  open: boolean;
  closedReason: string;
  saved?: JudgeBoard['mine'][string];
  next?: JudgeProject;
  prev?: JudgeProject;
  onDirty: (d: boolean) => void;
  onNavigate: (id: string) => void;
  onSaved: (total: number, scores: Record<string, number>) => void;
  onQueued: (item: Pending) => void;
}> = ({ uid, contest, project, open, closedReason, saved, next, prev, onDirty, onNavigate, onSaved, onQueued }) => {
  const { t } = useTranslation();
  const criteria = contest.criteria;
  const dKey = draftKey(uid, contest.id, project.id);
  const fromSaved = useMemo(() => Object.fromEntries(criteria.map((c) => [c.id, saved?.scores?.[c.id] != null ? String(saved.scores[c.id]) : ''])), [criteria, saved]);
  const [vals, setVals] = useState<Record<string, string>>(() => lsGet<Record<string, string> | null>(dKey, null) || fromSaved);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'queued' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  // «Читать полностью» — только если две строки действительно обрезали текст.
  const descRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = descRef.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- замер DOM возможен только после отрисовки
    setClamped(!!el && el.scrollHeight > el.clientHeight);
  }, [project.projectDescription, showDesc]);

  const isDirty = criteria.some((c) => (vals[c.id] ?? '') !== (fromSaved[c.id] ?? ''));
  useEffect(() => { onDirty(isDirty); return () => onDirty(false); }, [isDirty, onDirty]);
  // Черновик — на каждое изменение; снимаем, когда совпал с сохранённым.
  useEffect(() => { lsSet(dKey, isDirty ? vals : null); }, [dKey, vals, isDirty]);

  const total = criteria.reduce((a, c) => a + (Number(vals[c.id]) || 0), 0);
  const max = maxTotal(criteria);
  const errors = Object.fromEntries(criteria.map((c) => {
    const raw = vals[c.id];
    if (raw === '' || raw === undefined) return [c.id, ''];
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) return [c.id, t('judge.invalid', 'Некорректно')];
    if (v > c.maxScore) return [c.id, t('judge.maxN', 'Не больше {{max}}', { max: c.maxScore })];
    if (Math.round(v * 2) !== v * 2) return [c.id, t('judge.halfStep', 'Шаг 0,5')];
    return [c.id, ''];
  }));
  const filledCount = criteria.filter((c) => vals[c.id] !== '' && vals[c.id] !== undefined).length;
  const filled = filledCount === criteria.length;
  const valid = filled && criteria.every((c) => !errors[c.id]);

  const setVal = (id: string, v: string) => { setVals((s) => ({ ...s, [id]: v.replace(',', '.') })); if (state !== 'saving') setState('idle'); };
  // Функциональное обновление: быстрые нажатия подряд не должны читать устаревшее значение.
  const step = (id: string, d: number, maxScore: number) => {
    setVals((s) => {
      const raw = s[id];
      const cur = raw === '' || raw === undefined || !Number.isFinite(Number(raw)) ? (d > 0 ? -1 : 1) : Number(raw);
      const n = Math.min(maxScore, Math.max(0, Math.round((cur + d) * 2) / 2));
      return { ...s, [id]: String(n) };
    });
    if (state !== 'saving') setState('idle');
  };

  const save = async () => {
    if (!valid) return;
    const scores = Object.fromEntries(criteria.map((c) => [c.id, Number(vals[c.id])]));
    setState('saving'); setMessage('');
    try {
      const r = await apiJudgeScore(contest.id, project.id, scores);
      lsSet(dKey, null);
      onSaved(r.total, scores);
      setState('saved');
      toast.success(t('judge.savedToast', '{{number}}: сохранено · {{total}}', { number: project.number, total: round2(r.total) }));
    } catch (e: any) {
      if (isNetworkError(e)) {
        onQueued({ contestId: contest.id, participantId: project.id, scores, at: new Date().toISOString() });
        setState('queued');
        setMessage(t('judge.queuedMsg', 'Нет связи. Оценка сохранена на телефоне и отправится автоматически, когда появится интернет.'));
      } else {
        setState('error');
        setMessage(e?.message || t('judge.saveFailed', 'Не удалось сохранить'));
      }
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-3">
          <span className="font-mono font-black text-2xl px-3 py-1 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">{project.number}</span>
          {saved && <span className="text-[13px] text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{t('judge.ratedTotal', 'оценён · {{total}}', { total: round2(saved.total) })}</span>}
        </div>
        <h1 className="text-lg font-bold mt-3 leading-snug">{project.projectTitle || t('judge.untitled', 'Без названия')}</h1>
        {project.authors.length > 0 && <p className="text-[14px] text-slate-600 dark:text-slate-300 mt-0.5">{project.authors.join(', ')}</p>}
        {project.projectDescription && (
          <div className="mt-2">
            <p ref={descRef} className={`text-[14px] text-slate-600 dark:text-slate-300 ${showDesc ? '' : 'line-clamp-2'}`}>{project.projectDescription}</p>
            {(clamped || showDesc) && (
              <button onClick={() => setShowDesc((s) => !s)} aria-expanded={showDesc} className="mt-1 min-h-[36px] text-[14px] font-semibold text-primary-700 dark:text-primary-400">{showDesc ? t('judge.collapse', 'Свернуть') : t('judge.readMore', 'Читать полностью')}</button>
            )}
          </div>
        )}
      </section>

      {!open && <Notice tone="warn"><Lock className="w-4 h-4 inline mr-1" />{closedReason}</Notice>}

      {criteria.map((c, i) => {
        const err = errors[c.id];
        return (
          <section key={c.id} className={`rounded-2xl bg-white dark:bg-slate-800 border p-4 ${err ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-bold text-[16px] leading-snug">{i + 1}. {c.name}</h2>
              <span className="text-[13px] text-slate-600 dark:text-slate-400 whitespace-nowrap">{t('judge.maxScore', 'макс. {{max}}', { max: c.maxScore })}</span>
            </div>
            {c.description && <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-1">{c.description}</p>}
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => step(c.id, -1, c.maxScore)} className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95" aria-label={t('judge.minus', 'Минус')}><Minus className="w-6 h-6" /></button>
              <input
                value={vals[c.id] ?? ''} onChange={(e) => setVal(c.id, e.target.value)}
                inputMode="decimal" enterKeyHint="next" aria-label={c.name} placeholder="—"
                className={`flex-1 min-w-0 h-14 rounded-2xl text-center text-3xl font-black bg-slate-50 dark:bg-slate-900 border-2 focus:outline-none ${err ? 'border-rose-400 text-rose-600' : 'border-transparent focus:border-primary-500'}`}
              />
              <button onClick={() => step(c.id, 1, c.maxScore)} className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95" aria-label={t('judge.plus', 'Плюс')}><Plus className="w-6 h-6" /></button>
            </div>
            {err && <p role="alert" className="text-[13px] text-rose-700 dark:text-rose-400 font-semibold mt-1.5">{err}</p>}
          </section>
        );
      })}

      <div className="flex gap-2">
        {prev && <button onClick={() => onNavigate(prev.id)} className="flex-1 h-12 rounded-2xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center justify-center gap-1"><ChevronLeft className="w-5 h-5" />{prev.number}</button>}
        {next && <button onClick={() => onNavigate(next.id)} className="flex-1 h-12 rounded-2xl border border-slate-200 dark:border-slate-700 font-semibold flex items-center justify-center gap-1">{next.number}<ChevronRight className="w-5 h-5" /></button>}
      </div>

      {/* Сумма и «Сохранить» — всегда под пальцем */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-xl mx-auto px-4 py-3">
          {message && <p role="alert" className={`text-[13px] font-medium mb-2 ${state === 'queued' ? 'text-amber-800 dark:text-amber-300' : 'text-rose-700 dark:text-rose-400'}`}>{message}</p>}
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <div className="text-[12px] text-slate-600 dark:text-slate-400">{t('judge.yourTotal', 'Ваша сумма')}</div>
              <div className="text-2xl font-black leading-none">{round2(total)}<span className="text-[14px] text-slate-600 dark:text-slate-400 font-semibold">/{max}</span></div>
            </div>
            <button onClick={save} disabled={!valid || state === 'saving' || !open || (!isDirty && !!saved)}
              className={`flex-1 h-14 rounded-2xl text-lg font-bold transition-colors ${!isDirty && saved ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 disabled:opacity-40'}`}>
              {state === 'saving' ? t('judge.saving', 'Сохраняю…') : !isDirty && saved ? t('judge.savedCheck', 'Сохранено ✓') : !filled ? t('judge.filled', 'Заполнено {{n}} из {{total}}', { n: filledCount, total: criteria.length }) : saved ? t('judge.saveChanges', 'Сохранить изменения') : t('common.save', 'Сохранить')}
            </button>
          </div>
          {state === 'saved' && !isDirty && next && (
            <button onClick={() => onNavigate(next.id)} className="w-full mt-2 h-11 rounded-xl text-[15px] font-semibold text-primary-700 dark:text-primary-400 flex items-center justify-center gap-1">{t('judge.nextProject', 'Следующий проект: {{number}}', { number: next.number })}<ChevronRight className="w-4 h-4" aria-hidden /></button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Мелочи ───
const JudgingLine: React.FC<{ state: JudgeBoard['category']['judging'] }> = ({ state }) => {
  const { t } = useTranslation();
  const map = {
    pending: ['text-slate-600 dark:text-slate-400', t('judge.state.pending', 'Оценивание не началось')],
    open: ['text-emerald-700 dark:text-emerald-400', t('judge.state.open', 'Идёт оценивание')],
    closed: ['text-amber-700 dark:text-amber-400', t('judge.state.closed', 'Оценивание закрыто')],
    approved: ['text-primary-700 dark:text-primary-400', t('judge.state.approved', 'Итоги утверждены')],
  };
  const [cls, label] = map[state];
  return <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${cls}`}>{state === 'open' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}{label}</span>;
};

const Notice: React.FC<{ tone: 'error' | 'warn' | 'info'; children: React.ReactNode }> = ({ tone, children }) => {
  const cls = tone === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20'
    : tone === 'warn' ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20'
      : 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:border-sky-500/20';
  return <div className={`rounded-2xl border px-4 py-3 text-[14px] ${cls}`}>{children}</div>;
};

const Spinner = () => { const { t } = useTranslation(); return <div className="flex justify-center py-16" role="status" aria-label={t('common.loading', 'Загрузка...')}><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-300" /></div>; };

const Empty: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => (
  <div className="text-center py-16 px-6">
    <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-4">{icon}</div>
    <h2 className="font-bold">{title}</h2>
    <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-1">{text}</p>
  </div>
);

export default JudgePage;
