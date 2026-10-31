import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, Megaphone, ChevronRight, ChevronDown, History, Pencil, CheckCircle2, Circle, SkipForward, XCircle, Trophy, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiContestLog } from '../../../lib/api';
import { intlLocale } from '../../../lib/locale';
import { juryForCategory, maxTotal, round2, type ContestJuryMember, type ContestParticipant, type ContestScore, type ContestScoreLogEntry } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { Field, Modal, ModalFooter, WarnNote, JudgingBadge, NumberChip, CategoryPicker } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls, errMessage, judgingModeLabel } from '../uiStyles';

const fmtTime = (iso: string) => (iso ? new Date(iso).toLocaleString(intlLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

const MonitorTab: React.FC<ContestTabProps> = ({ data, act, canEdit, readOnly, goTab, categoryId, selectCategory }) => {
  const { t } = useTranslation();
  const { contest, participants, jury, scores } = data;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ p: ContestParticipant; j: ContestJuryMember; s?: ContestScore } | null>(null);
  const [history, setHistory] = useState<ContestParticipant | null>(null);
  const [busy, setBusy] = useState(false);
  // Категория общая с «Итогами» (в адресной строке); без неё — та, что сейчас открыта.
  const catId = categoryId || contest.categories.find((c) => c.judging === 'open')?.id || contest.categories[0]?.id || '';

  const cat = contest.categories.find((c) => c.id === catId);
  const editable = canEdit && !readOnly;
  const hostMode = contest.judgingMode !== 'free';
  // Вызывать можно до открытия и во время оценивания — как разрешает сервер.
  const canCall = editable && hostMode && (cat?.judging === 'pending' || cat?.judging === 'open');
  const projects = useMemo(() => participants.filter((p) => p.categoryId === catId && p.status === 'arrived').sort((a, b) => a.seq - b.seq), [participants, catId]);
  const waiting = useMemo(() => participants.filter((p) => p.categoryId === catId && p.status === 'registered').length, [participants, catId]);
  const catJury = useMemo(() => juryForCategory(jury, catId), [jury, catId]);
  const scoreOf = (pid: string, uid: string) => scores.find((s) => s.participantId === pid && s.juryUid === uid);
  const max = maxTotal(contest.criteria);

  if (!contest.categories.length) return <WarnNote>{t('contests.setCategoriesFirst', 'Сначала задайте категории.')}</WarnNote>;

  const current = cat?.currentParticipantId ? participants.find((p) => p.id === cat.currentParticipantId) : undefined;
  const currentIdx = current ? projects.findIndex((p) => p.id === current.id) : -1;
  const nextProject = projects[currentIdx + 1];

  const call = async (participantId: string | null) => {
    setBusy(true);
    await act('setCurrent', { categoryId: catId, participantId }, participantId ? t('contests.mon.called', 'Проект вызван — у жюри он открылся') : t('contests.mon.callCleared', 'Вызов снят'));
    setBusy(false);
  };
  const setJudging = async (state: 'open' | 'closed') => {
    setBusy(true);
    await act('setJudging', { categoryId: catId, state }, state === 'open' ? t('contests.mon.opened', 'Оценивание категории {{code}} открыто', { code: cat?.code }) : t('contests.mon.closed', 'Категория {{code}} закрыта. Дальше — итоги', { code: cat?.code }));
    setBusy(false);
  };

  const doneBy = (uid: string) => projects.filter((p) => scoreOf(p.id, uid)).length;
  const allDone = projects.length > 0 && catJury.length > 0 && catJury.every((j) => doneBy(j.uid) === projects.length);

  return (
    <div className="space-y-5">
      <CategoryPicker categories={contest.categories} value={catId} onChange={selectCategory}
        extra={(c) => t('contests.projects', { count: participants.filter((p) => p.categoryId === c.id && p.status === 'arrived').length, defaultValue: '{{count}} проектов' })} />

      {cat && (
        <>
          {contest.status !== 'judging' && contest.status !== 'finished' && (
            <WarnNote>{t('contests.mon.pressStart', 'Чтобы открыть оценивание, нажмите «Начать день конкурса» вверху страницы.')}</WarnNote>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Управление категорией */}
            <section className={`${cardCls} p-5 xl:col-span-2`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-primary-500" />{t('contests.categoryCode', 'Категория {{code}}', { code: cat.code })} <JudgingBadge state={cat.judging} />
                </h2>
                {editable && cat.judging !== 'approved' && (
                  cat.judging === 'open'
                    ? <button onClick={() => setJudging('closed')} disabled={busy} className={allDone ? primaryBtn : secondaryBtn}><Pause className="w-4 h-4" />{t('contests.mon.closeJudging', 'Закрыть оценивание')}</button>
                    : <button onClick={() => setJudging('open')} disabled={busy || contest.status !== 'judging'} className={primaryBtn}><Play className="w-4 h-4" />{cat.judging === 'closed' ? t('contests.mon.reopen', 'Открыть снова') : t('contests.mon.openJudging', 'Открыть оценивание')}</button>
                )}
              </div>

              {/* Закрыто или утверждено: вместо пульта — дорога дальше. */}
              {cat.judging === 'closed' || cat.judging === 'approved' ? (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {cat.judging === 'approved' ? t('contests.mon.approvedTitle', 'Итоги утверждены, места зафиксированы.') : allDone ? t('contests.mon.allDone', 'Все жюри оценили все проекты.') : t('contests.mon.closedTitle', 'Оценивание закрыто.')}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                      {cat.judging === 'approved'
                        ? t('contests.mon.approvedHint', 'Протокол и выгрузка — на вкладке «Итоги».')
                        : t('contests.mon.closedHint', 'Проверьте рейтинг, разрешите ничьи, если они есть, и утвердите итоги. Пока итоги не утверждены, категорию можно открыть снова.')}
                    </p>
                  </div>
                  {/* Вызов из старых данных: сервер снимает его при закрытии только с этой версии. */}
                  {editable && current && <button onClick={() => call(null)} disabled={busy} className={secondaryBtn}><XCircle className="w-4 h-4" />{t('contests.mon.clearCallN', 'Снять вызов {{number}}', { number: current.number })}</button>}
                  <button onClick={() => goTab('results', cat.id)} className={primaryBtn}><Trophy className="w-4 h-4" />{t('contests.mon.categoryResults', 'Итоги категории {{code}}', { code: cat.code })}<ChevronRight className="w-4 h-4" /></button>
                </div>
              ) : hostMode ? (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  {current ? (
                    <>
                      <NumberChip value={current.number} large />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">{t('contests.mon.nowJudging', 'Сейчас на оценке')}{cat.currentSetAt ? ` · ${t('contests.mon.since', 'с {{time}}', { time: new Date(cat.currentSetAt).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' }) })}` : ''}</div>
                        <div className="font-bold text-slate-900 dark:text-white truncate">{current.projectTitle}</div>
                        <div className="text-[13px] text-slate-600 dark:text-slate-300 truncate">{current.authors.map((a) => a.name).join(', ')}</div>
                        <div className="text-[12px] text-slate-600 dark:text-slate-300 mt-1">{t('contests.mon.scoredBy', 'Оценили: {{x}} из {{y}}', { x: catJury.filter((j) => scoreOf(current.id, j.uid)).length, y: catJury.length })}</div>
                      </div>
                      {editable && (
                        <div className="flex flex-wrap gap-2">
                          {nextProject && <button onClick={() => call(nextProject.id)} disabled={busy} className={primaryBtn}><SkipForward className="w-4 h-4" />{t('contests.mon.next', 'Следующий: {{number}}', { number: nextProject.number })}</button>}
                          <button onClick={() => call(null)} disabled={busy} className={secondaryBtn}><XCircle className="w-4 h-4" />{t('contests.mon.clearCall', 'Снять вызов')}</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-sm text-slate-600 dark:text-slate-300">{t('contests.mon.callHint', 'Вызовите проект — у всех жюри категории он откроется на телефоне сам.')}</p>
                      {canCall && projects[0] && <button onClick={() => call(projects[0].id)} disabled={busy} className={primaryBtn}><Megaphone className="w-4 h-4" />{t('contests.mon.startWith', 'Начать с {{number}}', { number: projects[0].number })}</button>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-600 dark:text-slate-300">
                  <b className="text-slate-900 dark:text-white">{judgingModeLabel('free').title}.</b> {judgingModeLabel('free').hint} {t('contests.mon.modeOnOverview', 'Режим меняется на вкладке «Обзор».')}
                </div>
              )}

              {cat.judging === 'pending' && waiting > 0 && (
                <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />{t('contests.notMarkedArrived', 'Не отмечены пришедшими: {{n}}', { n: waiting })}.
                  <button onClick={() => goTab('participants')} className="underline underline-offset-2 font-medium">{t('contests.mon.markOnParticipants', 'Отметить на вкладке «Участники»')}</button>
                </p>
              )}
            </section>

            {/* Прогресс жюри */}
            <section className={`${cardCls} p-5`}>
              <h2 className="font-bold text-slate-900 dark:text-white mb-3">{t('contests.mon.juryProgress', 'Прогресс жюри')}</h2>
              {!catJury.length && <p className="text-sm text-slate-600 dark:text-slate-300">{t('contests.mon.noJury', 'На категорию не назначено жюри.')} <button onClick={() => goTab('jury')} className="underline underline-offset-2 font-medium">{t('contests.mon.assign', 'Назначить')}</button></p>}
              <ul className="space-y-3">
                {catJury.map((j) => {
                  const d = doneBy(j.uid);
                  const all = projects.length;
                  const pct = all ? Math.round((d / all) * 100) : 0;
                  const done = d === all && all > 0;
                  return (
                    <li key={j.uid}>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-800 dark:text-slate-100 truncate">{j.name}</span>
                        <span className={`font-semibold ${done ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>{d}/{all}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 mt-1 overflow-hidden" role="progressbar" aria-valuenow={d} aria-valuemax={all} aria-label={t('contests.mon.progressAria', '{{name}}: оценено {{x}} из {{y}}', { name: j.name, x: d, y: all })}>
                        <div className={`h-full ${done ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {/* Матрица проекты × жюри */}
          <section className={`${cardCls} overflow-hidden`}>
            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <h2 className="font-bold text-slate-900 dark:text-white">{t('contests.mon.matrix', 'Проекты × жюри')}</h2>
              <span className="text-[12px] text-slate-600 dark:text-slate-300">{t('contests.mon.maxPerJury', 'максимум от одного жюри: {{max}}', { max })}</span>
            </div>
            {!projects.length ? (
              <p className="text-sm text-slate-600 dark:text-slate-300 text-center pb-8 px-5">
                {t('contests.mon.noArrived', 'Нет пришедших участников в этой категории.')}{' '}
                <button onClick={() => goTab('participants')} className="underline underline-offset-2 font-medium">{t('contests.mon.markArrivedOnParticipants', 'Отметить «Пришёл» на вкладке «Участники»')}</button>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">{t('contests.csv.project', 'Проект')}</th>
                      {catJury.map((j) => <th key={j.uid} className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{j.name}</th>)}
                      <th className="px-3 py-2.5 text-center font-semibold">{t('contests.mon.average', 'Среднее')}</th>
                      <th className="px-3 py-2.5 text-right font-semibold">{t('common.actions', 'Действия')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {projects.map((p) => {
                      const own = catJury.map((j) => scoreOf(p.id, j.uid));
                      const got = own.filter(Boolean) as ContestScore[];
                      const avg = got.length ? got.reduce((a, s) => a + s.total, 0) / got.length : null;
                      const isOpen = expanded === p.id;
                      const isCurrent = hostMode && cat.currentParticipantId === p.id;
                      return (
                        <React.Fragment key={p.id}>
                          <tr className={isCurrent ? 'bg-emerald-50/60 dark:bg-emerald-500/5' : ''}>
                            <td className="px-4 py-2.5">
                              <button onClick={() => setExpanded(isOpen ? null : p.id)} aria-expanded={isOpen} className="flex items-center gap-2 text-left">
                                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden /> : <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden />}
                                <NumberChip value={p.number} />
                                <span className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[220px]">{p.projectTitle}</span>
                                <span className="sr-only">{isOpen ? t('contests.mon.hideCriteria', 'Скрыть баллы по критериям') : t('contests.mon.showCriteria', 'Показать баллы по критериям')}</span>
                              </button>
                            </td>
                            {own.map((s, k) => (
                              <td key={catJury[k].uid} className="px-3 py-2.5 text-center">
                                {s
                                  ? <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white" title={`${fmtTime(s.updatedAt)}${s.updatedByRole === 'admin' ? ` · ${t('contests.mon.fixedByAdmin', 'исправлено администратором')}` : ''}`}>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden />{round2(s.total)}{s.updatedByRole === 'admin' && <span className="text-amber-600" title={t('contests.mon.fixedByAdminCap', 'Исправлено администратором')}>*</span>}
                                    </span>
                                  : <span className="inline-flex" title={t('contests.mon.notScoredCap', 'Не оценён')}><Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" aria-hidden /><span className="sr-only">{t('contests.mon.notScored', 'не оценён')}</span></span>}
                              </td>
                            ))}
                            <td className="px-3 py-2.5 text-center font-bold text-slate-900 dark:text-white">{round2(avg)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              {canCall && !isCurrent && (
                                <button onClick={() => call(p.id)} disabled={busy} className={ghostBtn}><Megaphone className="w-4 h-4" aria-hidden />{t('contests.mon.call', 'Вызвать')}</button>
                              )}
                              <button onClick={() => setHistory(p)} className={ghostBtn}><History className="w-4 h-4" aria-hidden />{t('contests.mon.history', 'История')}</button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50/60 dark:bg-slate-900/30">
                              <td colSpan={catJury.length + 3} className="px-4 py-3">
                                <div className="overflow-x-auto">
                                  <table className="text-[13px]">
                                    <thead><tr className="text-slate-600 dark:text-slate-300">
                                      <th className="pr-4 py-1 text-left font-medium">{t('contests.crit.criterion', 'Критерий')}</th>
                                      {catJury.map((j) => <th key={j.uid} className="px-3 py-1 font-medium">{j.name}</th>)}
                                      <th className="px-3 py-1 font-medium">{t('contests.avgShort', 'Ср.')}</th>
                                    </tr></thead>
                                    <tbody>
                                      {contest.criteria.map((c) => {
                                        const vals = own.map((s) => s?.scores?.[c.id]);
                                        const nums = vals.filter((v): v is number => typeof v === 'number');
                                        return (
                                          <tr key={c.id}>
                                            <td className="pr-4 py-1 text-slate-700 dark:text-slate-200">{c.name} <span className="text-slate-500 dark:text-slate-400">/ {c.maxScore}</span></td>
                                            {vals.map((v, k) => <td key={k} className="px-3 py-1 text-center">{v ?? '—'}</td>)}
                                            <td className="px-3 py-1 text-center font-semibold">{nums.length ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : '—'}</td>
                                          </tr>
                                        );
                                      })}
                                      {editable && cat.judging !== 'approved' && (
                                        <tr>
                                          <td className="pr-4 pt-2 text-slate-600 dark:text-slate-300">{t('contests.mon.fixForJury', 'Исправить за жюри:')}</td>
                                          {catJury.map((j, k) => (
                                            <td key={j.uid} className="px-3 pt-2 text-center">
                                              <button onClick={() => setEdit({ p, j, s: own[k] })} className={`${ghostBtn} text-[12px]`}><Pencil className="w-3 h-3" aria-hidden />{own[k] ? t('contests.mon.fix', 'Исправить') : t('contests.mon.set', 'Выставить')}</button>
                                            </td>
                                          ))}
                                          <td />
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {edit && <ScoreEditModal edit={edit} criteria={contest.criteria} onClose={() => setEdit(null)} act={act} />}
      {history && <HistoryModal contestId={contest.id} participant={history} jury={jury} criteria={contest.criteria} onClose={() => setHistory(null)} />}
    </div>
  );
};

const ScoreEditModal: React.FC<{
  edit: { p: ContestParticipant; j: ContestJuryMember; s?: ContestScore };
  criteria: ContestTabProps['data']['contest']['criteria'];
  onClose: () => void;
  act: ContestTabProps['act'];
}> = ({ edit, criteria, onClose, act }) => {
  const { t } = useTranslation();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(criteria.map((c) => [c.id, edit.s?.scores?.[c.id] != null ? String(edit.s.scores[c.id]) : ''])));
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const total = criteria.reduce((a, c) => a + (Number(vals[c.id]) || 0), 0);
  const invalid = criteria.some((c) => vals[c.id] === '' || Number(vals[c.id]) < 0 || Number(vals[c.id]) > c.maxScore);
  const save = async () => {
    setSaving(true);
    const r = await act('adminScore', {
      participantId: edit.p.id, juryUid: edit.j.uid, comment,
      scores: Object.fromEntries(criteria.map((c) => [c.id, Number(vals[c.id])])),
    }, t('contests.mon.scoreFixed', 'Оценка исправлена, изменение записано в историю'));
    setSaving(false);
    if (r) onClose();
  };
  return (
    <Modal open title={t('contests.mon.scoreFor', '{{number}} · оценка за {{name}}', { number: edit.p.number, name: edit.j.name })} onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={invalid || !comment.trim()} />}>
      <div className="space-y-2">
        {criteria.map((c) => (
          <div key={c.id} className="grid grid-cols-[1fr_90px] gap-3 items-center">
            <label htmlFor={`adm-${c.id}`} className="text-sm text-slate-700 dark:text-slate-200">{c.name} <span className="text-slate-500 dark:text-slate-400">/ {c.maxScore}</span></label>
            <input id={`adm-${c.id}`} type="number" inputMode="decimal" min={0} max={c.maxScore} step={0.5} value={vals[c.id]} onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} className={`${inputCls} text-center`} />
          </div>
        ))}
        <div className="flex justify-between pt-2 text-sm"><span className="text-slate-600 dark:text-slate-300">{t('contests.cat.amount', 'Сумма')}</span><b>{round2(total)}{edit.s ? <span className="text-slate-500 dark:text-slate-400 font-normal"> {t('contests.mon.was', '(было {{v}})', { v: round2(edit.s.total) })}</span> : null}</b></div>
      </div>
      <Field label={t('contests.mon.commentRequired', 'Комментарий (обязательно)')} hint={t('contests.mon.commentHint', 'Запишется в историю оценок: кто, когда, было/стало и почему.')}>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('contests.mon.commentPh', 'Почему оценка исправлена')} className={inputCls} />
      </Field>
    </Modal>
  );
};

const HistoryModal: React.FC<{
  contestId: string;
  participant: ContestParticipant;
  jury: ContestJuryMember[];
  criteria: ContestTabProps['data']['contest']['criteria'];
  onClose: () => void;
}> = ({ contestId, participant, jury, criteria, onClose }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ContestScoreLogEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiContestLog(contestId, participant.id).then(setItems, (e) => setError(errMessage(e))); }, [contestId, participant.id]);
  const nameOf = (uid: string) => jury.find((j) => j.uid === uid)?.name || t('contests.juryLower', 'жюри');
  const diff = (e: ContestScoreLogEntry) => criteria
    .filter((c) => e.before?.scores?.[c.id] !== e.after.scores?.[c.id])
    .map((c) => `${c.name}: ${e.before?.scores?.[c.id] ?? '—'} → ${e.after.scores?.[c.id]}`);
  return (
    <Modal open wide title={t('contests.mon.historyTitle', 'История оценок · {{number}}', { number: participant.number })} onClose={onClose}>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!items && !error && <p className="text-sm text-slate-600 dark:text-slate-300">{t('common.loading', 'Загрузка...')}</p>}
      {items && !items.length && <p className="text-sm text-slate-600 dark:text-slate-300">{t('contests.mon.noHistory', 'Оценок ещё не было.')}</p>}
      <ul className="space-y-3 pb-4">
        {items?.map((e) => (
          <li key={e.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span><b>{e.byName}</b> {e.byRole === 'admin' ? <span className="text-amber-700 dark:text-amber-400">{t('contests.mon.fixedFor', 'исправил(а) оценку за {{name}}', { name: nameOf(e.juryUid) })}</span> : e.before ? t('contests.mon.changedOwn', 'изменил(а) свою оценку') : t('contests.mon.gave', 'выставил(а) оценку')}</span>
              <span className="text-slate-500 dark:text-slate-400">{fmtTime(e.at)}</span>
            </div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">{t('contests.cat.amount', 'Сумма')}: {e.before ? `${round2(e.before.total)} → ` : ''}<b>{round2(e.after.total)}</b></div>
            {e.before && diff(e).length > 0 && <div className="text-[12px] text-slate-600 dark:text-slate-300 mt-1">{diff(e).join(' · ')}</div>}
            {e.comment && <div className="mt-1 text-[13px] italic text-slate-600 dark:text-slate-300">«{e.comment}»</div>}
          </li>
        ))}
      </ul>
    </Modal>
  );
};

export default MonitorTab;
