import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Printer, ShieldCheck, AlertTriangle, Scale, ArrowUp, ArrowDown, Lock, Medal, Activity } from 'lucide-react';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { blockingTies, round2, type RankedRow } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { categoryRanking, exportResultsCsv, prizeFor } from '../results';
import { Field, Modal, ModalFooter, WarnNote, JudgingBadge, NumberChip, CategoryPicker } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls, categoryLabel } from '../uiStyles';

const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const ResultsTab: React.FC<ContestTabProps> = ({ data, act, canEdit, readOnly, goTab, categoryId, selectCategory }) => {
  const { contest, jury } = data;
  const [tie, setTie] = useState<RankedRow[] | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  // Категория общая с «Мониторингом» (в адресной строке).
  const catId = categoryId || contest.categories.find((c) => c.judging === 'closed')?.id || contest.categories[0]?.id || '';

  const r = categoryRanking(data, catId);
  const editable = canEdit && !readOnly;
  if (!contest.categories.length) return <WarnNote>Сначала задайте категории.</WarnNote>;
  if (!r) return null;
  const { category: cat, rows, approved, resolutions } = r;

  const nameOf = (uid: string) => jury.find((j) => j.uid === uid)?.name || 'жюри';
  const blocking = blockingTies(rows, cat.prizes.length);
  const incomplete = rows.filter((x) => x.missingJuryUids.length > 0);
  const tieGroups = [...new Set(rows.filter((x) => x.needsDecision).map((x) => x.tieGroup))].map((g) => rows.filter((x) => x.tieGroup === g));
  const approvedPlace = new Map((approved?.rows || []).map((x) => [x.participantId, x.place]));
  const placeOf = (row: RankedRow) => (approved ? approvedPlace.get(row.participantId) ?? null : row.place);
  const ordered = approved ? [...rows].sort((a, b) => (placeOf(a) ?? 1e9) - (placeOf(b) ?? 1e9)) : rows;

  // Почему нельзя утвердить — видимой строкой, а не подсказкой при наведении.
  const blocker: { text: string; action?: { label: string; go: () => void } } | null = approved ? null
    : cat.judging === 'pending' ? { text: 'Оценивание ещё не начиналось.', action: { label: 'Открыть на мониторинге', go: () => goTab('monitor', cat.id) } }
      : cat.judging === 'open' ? { text: 'Оценивание ещё идёт — рейтинг меняется в реальном времени.', action: { label: 'Закрыть на мониторинге', go: () => goTab('monitor', cat.id) } }
        : blocking.length ? { text: `Ничья на призовых местах: ${blocking.map((x) => x.number).join(', ')} — нужно решение жюри.` }
          : !rows.some((x) => x.place) ? { text: 'Нет ни одного оценённого проекта.' }
            : null;

  const approve = async () => {
    setBusy(true);
    const res = await act('approve', { categoryId: cat.id }, `Итоги категории ${cat.code} утверждены`);
    setBusy(false);
    if (res) setConfirmApprove(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1"><CategoryPicker categories={contest.categories} value={catId} onChange={selectCategory} /></div>
        <div className="flex gap-2">
          <button onClick={() => exportResultsCsv(data)} className={secondaryBtn}><Download className="w-4 h-4" />Скачать CSV</button>
          <Link to={`/contests/${contest.id}/print?what=protocol&category=${cat.id}`} target="_blank" className={secondaryBtn}><Printer className="w-4 h-4" />Протокол / PDF</Link>
        </div>
      </div>

      <section className={`${cardCls} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">Категория {categoryLabel(cat)} <JudgingBadge state={cat.judging} /></h2>
            {approved
              ? <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" aria-hidden />Утверждено {fmt(approved.at)} · {approved.byName}. Места зафиксированы — протокол и CSV выше.</p>
              : <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Предварительный рейтинг: среднее арифметическое сумм от оценивших жюри.</p>}
          </div>
          {editable && !approved && (
            <div className="flex flex-col items-start sm:items-end gap-1.5">
              <button onClick={() => setConfirmApprove(true)} disabled={!!blocker} className={primaryBtn} aria-describedby={blocker ? 'approve-blocker' : undefined}>
                <ShieldCheck className="w-4 h-4" />Утвердить итоги
              </button>
              {blocker && (
                <p id="approve-blocker" className="text-[12px] text-slate-600 dark:text-slate-300 sm:text-right max-w-xs">
                  {blocker.text}{' '}
                  {blocker.action && <button onClick={blocker.action.go} className="underline underline-offset-2 font-medium inline-flex items-center gap-1"><Activity className="w-3 h-3" aria-hidden />{blocker.action.label}</button>}
                </p>
              )}
            </div>
          )}
        </div>

        {!approved && (
          <div className="space-y-2 mt-4">
            {incomplete.length > 0 && (
              <WarnNote className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Не все назначенные жюри оценили: {incomplete.map((x) => `${x.number} (нет: ${x.missingJuryUids.map(nameOf).join(', ')})`).join('; ')}.</span>
              </WarnNote>
            )}
            {tieGroups.map((g) => (
              <div key={g[0].tieGroup} role="alert" className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-sm text-rose-800 dark:text-rose-300 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Scale className="w-4 h-4" aria-hidden />Требуется решение жюри: {g.map((x) => x.number).join(', ')} — равны по баллам и по всем критериям ничьей (место {g[0].place}).</span>
                {editable && <button onClick={() => setTie(g)} className={primaryBtn}><Scale className="w-4 h-4" aria-hidden />Решить ничью</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Место</th>
                <th className="px-4 py-3 text-left font-semibold">Проект</th>
                <th className="px-3 py-3 text-center font-semibold">Итог</th>
                <th className="px-3 py-3 text-center font-semibold">Сумма</th>
                <th className="px-3 py-3 text-center font-semibold">Жюри</th>
                <th className="px-4 py-3 text-left font-semibold">Приз</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {ordered.map((row) => {
                const place = placeOf(row);
                const prize = prizeFor(cat, place);
                return (
                  <tr key={row.participantId} className={row.needsDecision && !approved ? 'bg-rose-50/60 dark:bg-rose-500/5' : ''}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 font-bold ${place && place <= 3 ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {place && place <= cat.prizes.length && <Medal className={`w-4 h-4 ${place === 1 ? 'text-amber-500' : place === 2 ? 'text-slate-500 dark:text-slate-400' : 'text-orange-600'}`} aria-label="призовое место" role="img" />}
                        {place ?? '—'}{row.needsDecision && !approved && <span className="text-rose-700 dark:text-rose-400 text-[11px] font-semibold ml-1">ничья</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2"><NumberChip value={row.number} /><span className="font-medium text-slate-900 dark:text-white">{row.projectTitle}</span></div>
                      <div className="text-[12px] text-slate-600 dark:text-slate-300 mt-0.5">{row.authors}</div>
                      {row.tieBrokenBy && <div className="text-[12px] text-sky-700 dark:text-sky-300 mt-0.5">при равенстве выше по критерию «{row.tieBrokenBy}»</div>}
                      {row.resolvedManually && <div className="text-[12px] text-violet-700 dark:text-violet-300 mt-0.5">место определено решением жюри</div>}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-slate-900 dark:text-white text-base">{round2(row.average)}</td>
                    <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-300">{round2(row.sum)}</td>
                    <td className={`px-3 py-3 text-center ${row.missingJuryUids.length ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}`} title={row.missingJuryUids.length ? `Не оценили: ${row.missingJuryUids.map(nameOf).join(', ')}` : undefined}>
                      {row.juryCount}/{r.juryUids.length}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 dark:text-slate-300">{prize}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="text-sm text-slate-600 dark:text-slate-300 text-center py-8">В категории нет пришедших участников.</p>}
        </div>
      </section>

      {resolutions.length > 0 && (
        <section className={`${cardCls} p-5`}>
          <h3 className="font-bold text-slate-900 dark:text-white mb-2">Решения жюри по ничьим</h3>
          <ul className="space-y-2 text-sm">
            {resolutions.map((x, i) => (
              <li key={i} className="text-slate-600 dark:text-slate-300">
                {x.participantIds.map((id) => rows.find((row) => row.participantId === id)?.number || '?').join(' > ')} — «{x.comment}» <span className="text-slate-500 dark:text-slate-500 dark:text-slate-400">({x.byName}, {fmt(x.at)})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tie && <TieModal group={tie} onClose={() => setTie(null)} onSave={async (ids, comment) => {
        const res = await act('resolveTie', { categoryId: cat.id, participantIds: ids, comment }, 'Решение жюри сохранено');
        if (res) setTie(null);
      }} />}

      <ConfirmDialog
        open={confirmApprove}
        title={`Утвердить итоги категории ${cat.code}?`}
        message={<>
          Места зафиксируются, после этого оценки в категории не меняются — ни жюри, ни администратором.
          {incomplete.length > 0 && <><br /><br /><b>Внимание:</b> не все назначенные жюри оценили {incomplete.length} проект(ов) — итог посчитан по тем, кто оценил.</>}
        </>}
        confirmLabel="Утвердить"
        busy={busy}
        onConfirm={approve}
        onClose={() => setConfirmApprove(false)}
      />
    </div>
  );
};

const TieModal: React.FC<{ group: RankedRow[]; onClose: () => void; onSave: (ids: string[], comment: string) => Promise<void> }> = ({ group, onClose, onSave }) => {
  const [order, setOrder] = useState(group);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const move = (i: number, d: -1 | 1) => setOrder((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const first = group[0].place || 1;
  return (
    <Modal open title="Решение жюри по ничьей" onClose={onClose}
      footer={<ModalFooter onCancel={onClose} saving={saving} disabled={!comment.trim()} onSave={async () => { setSaving(true); await onSave(order.map((x) => x.participantId), comment); setSaving(false); }} />}>
      <p className="text-sm text-slate-600 dark:text-slate-300">Проекты равны по итоговому баллу и по всем критериям ничьей. Расставьте их в порядке, который решило жюри.</p>
      <ol className="space-y-2">
        {order.map((x, i) => (
          <li key={x.participantId} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
            <span className="font-bold w-6 text-slate-600 dark:text-slate-300">{first + i}</span>
            <NumberChip value={x.number} />
            <span className="flex-1 text-sm truncate">{x.projectTitle}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} className={ghostBtn} aria-label="Выше"><ArrowUp className="w-4 h-4" /></button>
            <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className={ghostBtn} aria-label="Ниже"><ArrowDown className="w-4 h-4" /></button>
          </li>
        ))}
      </ol>
      <Field label="Комментарий (обязательно, войдёт в протокол)">
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: по итогам совещания жюри предпочтение отдано проекту с более проработанной демонстрацией" className={inputCls} />
      </Field>
    </Modal>
  );
};

export default ResultsTab;
