import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, Megaphone, ChevronRight, ChevronDown, History, Pencil, CheckCircle2, Circle, SkipForward, XCircle, Trophy, Users } from 'lucide-react';
import { apiContestLog } from '../../../lib/api';
import { juryForCategory, maxTotal, round2, JUDGING_MODE_LABELS, type ContestJuryMember, type ContestParticipant, type ContestScore, type ContestScoreLogEntry } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { Field, Modal, ModalFooter, WarnNote, JudgingBadge, NumberChip, CategoryPicker } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls, errMessage } from '../uiStyles';

const fmtTime = (iso: string) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

const MonitorTab: React.FC<ContestTabProps> = ({ data, act, canEdit, readOnly, goTab, categoryId, selectCategory }) => {
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
  const projects = useMemo(() => participants.filter((p) => p.categoryId === catId && p.status === 'arrived').sort((a, b) => a.seq - b.seq), [participants, catId]);
  const waiting = useMemo(() => participants.filter((p) => p.categoryId === catId && p.status === 'registered').length, [participants, catId]);
  const catJury = useMemo(() => juryForCategory(jury, catId), [jury, catId]);
  const scoreOf = (pid: string, uid: string) => scores.find((s) => s.participantId === pid && s.juryUid === uid);
  const max = maxTotal(contest.criteria);

  if (!contest.categories.length) return <WarnNote>Сначала задайте категории.</WarnNote>;

  const current = cat?.currentParticipantId ? participants.find((p) => p.id === cat.currentParticipantId) : undefined;
  const currentIdx = current ? projects.findIndex((p) => p.id === current.id) : -1;
  const nextProject = projects[currentIdx + 1];

  const call = async (participantId: string | null) => {
    setBusy(true);
    await act('setCurrent', { categoryId: catId, participantId }, participantId ? 'Проект вызван — у жюри он открылся' : 'Вызов снят');
    setBusy(false);
  };
  const setJudging = async (state: 'open' | 'closed') => {
    setBusy(true);
    await act('setJudging', { categoryId: catId, state }, state === 'open' ? `Оценивание категории ${cat?.code} открыто` : `Категория ${cat?.code} закрыта. Дальше — итоги`);
    setBusy(false);
  };

  const doneBy = (uid: string) => projects.filter((p) => scoreOf(p.id, uid)).length;
  const allDone = projects.length > 0 && catJury.length > 0 && catJury.every((j) => doneBy(j.uid) === projects.length);

  return (
    <div className="space-y-5">
      <CategoryPicker categories={contest.categories} value={catId} onChange={selectCategory}
        extra={(c) => `${participants.filter((p) => p.categoryId === c.id && p.status === 'arrived').length} проектов`} />

      {cat && (
        <>
          {contest.status !== 'judging' && contest.status !== 'finished' && (
            <WarnNote>Чтобы открыть оценивание, нажмите «Начать день конкурса» вверху страницы.</WarnNote>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Управление категорией */}
            <section className={`${cardCls} p-5 xl:col-span-2`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-primary-500" />Категория {cat.code} <JudgingBadge state={cat.judging} />
                </h2>
                {editable && cat.judging !== 'approved' && (
                  cat.judging === 'open'
                    ? <button onClick={() => setJudging('closed')} disabled={busy} className={allDone ? primaryBtn : secondaryBtn}><Pause className="w-4 h-4" />Закрыть оценивание</button>
                    : <button onClick={() => setJudging('open')} disabled={busy || contest.status !== 'judging'} className={primaryBtn}><Play className="w-4 h-4" />{cat.judging === 'closed' ? 'Открыть снова' : 'Открыть оценивание'}</button>
                )}
              </div>

              {/* Закрыто или утверждено: вместо пульта — дорога дальше. */}
              {cat.judging === 'closed' || cat.judging === 'approved' ? (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {cat.judging === 'approved' ? 'Итоги утверждены, места зафиксированы.' : allDone ? 'Все жюри оценили все проекты.' : 'Оценивание закрыто.'}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                      {cat.judging === 'approved'
                        ? 'Протокол и выгрузка — на вкладке «Итоги».'
                        : 'Проверьте рейтинг, разрешите ничьи, если они есть, и утвердите итоги. Пока итоги не утверждены, категорию можно открыть снова.'}
                    </p>
                  </div>
                  <button onClick={() => goTab('results', cat.id)} className={primaryBtn}><Trophy className="w-4 h-4" />Итоги категории {cat.code}<ChevronRight className="w-4 h-4" /></button>
                </div>
              ) : hostMode ? (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  {current ? (
                    <>
                      <NumberChip value={current.number} large />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Сейчас на оценке{cat.currentSetAt ? ` · с ${fmtTime(cat.currentSetAt).split(', ')[1] || ''}` : ''}</div>
                        <div className="font-bold text-slate-900 dark:text-white truncate">{current.projectTitle}</div>
                        <div className="text-[13px] text-slate-600 dark:text-slate-300 truncate">{current.authors.map((a) => a.name).join(', ')}</div>
                        <div className="text-[12px] text-slate-600 dark:text-slate-300 mt-1">Оценили: {catJury.filter((j) => scoreOf(current.id, j.uid)).length} из {catJury.length}</div>
                      </div>
                      {editable && (
                        <div className="flex flex-wrap gap-2">
                          {nextProject && <button onClick={() => call(nextProject.id)} disabled={busy} className={primaryBtn}><SkipForward className="w-4 h-4" />Следующий: {nextProject.number}</button>}
                          <button onClick={() => call(null)} disabled={busy} className={secondaryBtn}><XCircle className="w-4 h-4" />Снять вызов</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-sm text-slate-600 dark:text-slate-300">Вызовите проект — у всех жюри категории он откроется на телефоне сам.</p>
                      {editable && projects[0] && <button onClick={() => call(projects[0].id)} disabled={busy} className={primaryBtn}><Megaphone className="w-4 h-4" />Начать с {projects[0].number}</button>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-600 dark:text-slate-300">
                  <b className="text-slate-900 dark:text-white">{JUDGING_MODE_LABELS.free.title}.</b> {JUDGING_MODE_LABELS.free.hint} Режим меняется на вкладке «Обзор».
                </div>
              )}

              {cat.judging === 'pending' && waiting > 0 && (
                <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />Не отмечены пришедшими: {waiting}.
                  <button onClick={() => goTab('participants')} className="underline underline-offset-2 font-medium">Отметить на вкладке «Участники»</button>
                </p>
              )}
            </section>

            {/* Прогресс жюри */}
            <section className={`${cardCls} p-5`}>
              <h2 className="font-bold text-slate-900 dark:text-white mb-3">Прогресс жюри</h2>
              {!catJury.length && <p className="text-sm text-slate-600 dark:text-slate-300">На категорию не назначено жюри. <button onClick={() => goTab('jury')} className="underline underline-offset-2 font-medium">Назначить</button></p>}
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
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 mt-1 overflow-hidden" role="progressbar" aria-valuenow={d} aria-valuemax={all} aria-label={`${j.name}: оценено ${d} из ${all}`}>
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
              <h2 className="font-bold text-slate-900 dark:text-white">Проекты × жюри</h2>
              <span className="text-[12px] text-slate-600 dark:text-slate-300">максимум от одного жюри: {max}</span>
            </div>
            {!projects.length ? (
              <p className="text-sm text-slate-600 dark:text-slate-300 text-center pb-8 px-5">
                Нет пришедших участников в этой категории.{' '}
                <button onClick={() => goTab('participants')} className="underline underline-offset-2 font-medium">Отметить «Пришёл» на вкладке «Участники»</button>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Проект</th>
                      {catJury.map((j) => <th key={j.uid} className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{j.name}</th>)}
                      <th className="px-3 py-2.5 text-center font-semibold">Среднее</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
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
                                <span className="sr-only">{isOpen ? 'Скрыть баллы по критериям' : 'Показать баллы по критериям'}</span>
                              </button>
                            </td>
                            {own.map((s, k) => (
                              <td key={catJury[k].uid} className="px-3 py-2.5 text-center">
                                {s
                                  ? <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white" title={`${fmtTime(s.updatedAt)}${s.updatedByRole === 'admin' ? ' · исправлено администратором' : ''}`}>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden />{round2(s.total)}{s.updatedByRole === 'admin' && <span className="text-amber-600" title="Исправлено администратором">*</span>}
                                    </span>
                                  : <span className="inline-flex" title="Не оценён"><Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" aria-hidden /><span className="sr-only">не оценён</span></span>}
                              </td>
                            ))}
                            <td className="px-3 py-2.5 text-center font-bold text-slate-900 dark:text-white">{round2(avg)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              {editable && hostMode && cat.judging === 'open' && !isCurrent && (
                                <button onClick={() => call(p.id)} disabled={busy} className={ghostBtn}><Megaphone className="w-4 h-4" aria-hidden />Вызвать</button>
                              )}
                              <button onClick={() => setHistory(p)} className={ghostBtn}><History className="w-4 h-4" aria-hidden />История</button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50/60 dark:bg-slate-900/30">
                              <td colSpan={catJury.length + 3} className="px-4 py-3">
                                <div className="overflow-x-auto">
                                  <table className="text-[13px]">
                                    <thead><tr className="text-slate-600 dark:text-slate-300">
                                      <th className="pr-4 py-1 text-left font-medium">Критерий</th>
                                      {catJury.map((j) => <th key={j.uid} className="px-3 py-1 font-medium">{j.name}</th>)}
                                      <th className="px-3 py-1 font-medium">Ср.</th>
                                    </tr></thead>
                                    <tbody>
                                      {contest.criteria.map((c) => {
                                        const vals = own.map((s) => s?.scores?.[c.id]);
                                        const nums = vals.filter((v): v is number => typeof v === 'number');
                                        return (
                                          <tr key={c.id}>
                                            <td className="pr-4 py-1 text-slate-700 dark:text-slate-200">{c.name} <span className="text-slate-500 dark:text-slate-500 dark:text-slate-400">/ {c.maxScore}</span></td>
                                            {vals.map((v, k) => <td key={k} className="px-3 py-1 text-center">{v ?? '—'}</td>)}
                                            <td className="px-3 py-1 text-center font-semibold">{nums.length ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : '—'}</td>
                                          </tr>
                                        );
                                      })}
                                      {editable && cat.judging !== 'approved' && (
                                        <tr>
                                          <td className="pr-4 pt-2 text-slate-600 dark:text-slate-300">Исправить за жюри:</td>
                                          {catJury.map((j, k) => (
                                            <td key={j.uid} className="px-3 pt-2 text-center">
                                              <button onClick={() => setEdit({ p, j, s: own[k] })} className={`${ghostBtn} text-[12px]`}><Pencil className="w-3 h-3" aria-hidden />{own[k] ? 'Исправить' : 'Выставить'}</button>
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
    }, 'Оценка исправлена, изменение записано в историю');
    setSaving(false);
    if (r) onClose();
  };
  return (
    <Modal open title={`${edit.p.number} · оценка за ${edit.j.name}`} onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={invalid || !comment.trim()} />}>
      <div className="space-y-2">
        {criteria.map((c) => (
          <div key={c.id} className="grid grid-cols-[1fr_90px] gap-3 items-center">
            <label htmlFor={`adm-${c.id}`} className="text-sm text-slate-700 dark:text-slate-200">{c.name} <span className="text-slate-500 dark:text-slate-500 dark:text-slate-400">/ {c.maxScore}</span></label>
            <input id={`adm-${c.id}`} type="number" inputMode="decimal" min={0} max={c.maxScore} step={0.5} value={vals[c.id]} onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} className={`${inputCls} text-center`} />
          </div>
        ))}
        <div className="flex justify-between pt-2 text-sm"><span className="text-slate-600 dark:text-slate-300">Сумма</span><b>{round2(total)}{edit.s ? <span className="text-slate-500 dark:text-slate-500 dark:text-slate-400 font-normal"> (было {round2(edit.s.total)})</span> : null}</b></div>
      </div>
      <Field label="Комментарий (обязательно)" hint="Запишется в историю оценок: кто, когда, было/стало и почему.">
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Почему оценка исправлена" className={inputCls} />
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
  const [items, setItems] = useState<ContestScoreLogEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiContestLog(contestId, participant.id).then(setItems, (e) => setError(errMessage(e))); }, [contestId, participant.id]);
  const nameOf = (uid: string) => jury.find((j) => j.uid === uid)?.name || 'жюри';
  const diff = (e: ContestScoreLogEntry) => criteria
    .filter((c) => e.before?.scores?.[c.id] !== e.after.scores?.[c.id])
    .map((c) => `${c.name}: ${e.before?.scores?.[c.id] ?? '—'} → ${e.after.scores?.[c.id]}`);
  return (
    <Modal open wide title={`История оценок · ${participant.number}`} onClose={onClose}>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!items && !error && <p className="text-sm text-slate-600 dark:text-slate-300">Загрузка…</p>}
      {items && !items.length && <p className="text-sm text-slate-600 dark:text-slate-300">Оценок ещё не было.</p>}
      <ul className="space-y-3 pb-4">
        {items?.map((e) => (
          <li key={e.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span><b>{e.byName}</b> {e.byRole === 'admin' ? <span className="text-amber-700 dark:text-amber-400">исправил(а) оценку за {nameOf(e.juryUid)}</span> : e.before ? 'изменил(а) свою оценку' : 'выставил(а) оценку'}</span>
              <span className="text-slate-500 dark:text-slate-500 dark:text-slate-400">{fmtTime(e.at)}</span>
            </div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">Сумма: {e.before ? `${round2(e.before.total)} → ` : ''}<b>{round2(e.after.total)}</b></div>
            {e.before && diff(e).length > 0 && <div className="text-[12px] text-slate-600 dark:text-slate-300 mt-1">{diff(e).join(' · ')}</div>}
            {e.comment && <div className="mt-1 text-[13px] italic text-slate-600 dark:text-slate-300">«{e.comment}»</div>}
          </li>
        ))}
      </ul>
    </Modal>
  );
};

export default MonitorTab;
