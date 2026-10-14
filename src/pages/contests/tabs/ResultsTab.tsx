import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Printer, ShieldCheck, AlertTriangle, Scale, ArrowUp, ArrowDown, Lock, Medal } from 'lucide-react';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { blockingTies, round2, type RankedRow } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { categoryRanking, exportResultsCsv, prizeFor } from '../results';
import { Field, Modal, ModalFooter, WarnNote, JudgingBadge, NumberChip } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls } from '../uiStyles';

const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const ResultsTab: React.FC<ContestTabProps> = ({ data, act, canEdit, readOnly }) => {
  const { contest, jury } = data;
  const [pickedCat, setCatId] = useState(contest.categories[0]?.id || '');
  const [tie, setTie] = useState<RankedRow[] | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const catId = contest.categories.some((c) => c.id === pickedCat) ? pickedCat : contest.categories[0]?.id || '';

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

  const approve = async () => {
    setBusy(true);
    const res = await act('approve', { categoryId: cat.id }, `Итоги категории ${cat.code} утверждены`);
    setBusy(false);
    if (res) setConfirmApprove(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          {contest.categories.map((c) => (
            <button key={c.id} onClick={() => setCatId(c.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${c.id === catId ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
              {c.code} · {c.ageFrom}–{c.ageTo}{c.judging === 'approved' && ' ✓'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportResultsCsv(data)} className={secondaryBtn}><Download className="w-4 h-4" />Excel (CSV)</button>
          <Link to={`/contests/${contest.id}/print?what=protocol&category=${cat.id}`} target="_blank" className={secondaryBtn}><Printer className="w-4 h-4" />Протокол / PDF</Link>
        </div>
      </div>

      <section className={`${cardCls} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">Категория {cat.code} · {cat.name} <JudgingBadge state={cat.judging} /></h2>
            {approved
              ? <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Утверждено {fmt(approved.at)} · {approved.byName}. Места зафиксированы.</p>
              : <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Предварительный рейтинг: среднее арифметическое сумм от оценивших жюри.</p>}
          </div>
          {editable && !approved && (
            <button onClick={() => setConfirmApprove(true)} disabled={cat.judging !== 'closed' || blocking.length > 0 || !rows.some((x) => x.place)} className={primaryBtn}
              title={cat.judging !== 'closed' ? 'Сначала закройте оценивание категории (вкладка «Мониторинг»)' : blocking.length ? 'Есть ничья на призовых местах' : undefined}>
              <ShieldCheck className="w-4 h-4" />Утвердить итоги
            </button>
          )}
        </div>

        {!approved && (
          <div className="space-y-2 mt-4">
            {cat.judging === 'open' && <WarnNote>Оценивание категории ещё идёт — рейтинг меняется в реальном времени. Утвердить итоги можно после закрытия.</WarnNote>}
            {incomplete.length > 0 && (
              <WarnNote className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Не все назначенные жюри оценили: {incomplete.map((x) => `${x.number} (нет: ${x.missingJuryUids.map(nameOf).join(', ')})`).join('; ')}.</span>
              </WarnNote>
            )}
            {tieGroups.map((g) => (
              <div key={g[0].tieGroup} className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-sm text-rose-700 dark:text-rose-300 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Scale className="w-4 h-4" />Требуется решение жюри: {g.map((x) => x.number).join(', ')} — равны по баллам и по всем критериям ничьей (место {g[0].place}).</span>
                {editable && <button onClick={() => setTie(g)} className={secondaryBtn}>Решить</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500">
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
                      <span className={`inline-flex items-center gap-1 font-bold ${place && place <= 3 ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                        {place && place <= cat.prizes.length && <Medal className={`w-4 h-4 ${place === 1 ? 'text-amber-500' : place === 2 ? 'text-slate-400' : 'text-orange-600'}`} />}
                        {place ?? '—'}{row.needsDecision && !approved && <span className="text-rose-600 text-[11px] font-semibold ml-1">ничья</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2"><NumberChip value={row.number} /><span className="font-medium text-slate-900 dark:text-white">{row.projectTitle}</span></div>
                      <div className="text-[12px] text-slate-500 mt-0.5">{row.authors}</div>
                      {row.tieBrokenBy && <div className="text-[11px] text-sky-600 mt-0.5">при равенстве выше по критерию «{row.tieBrokenBy}»</div>}
                      {row.resolvedManually && <div className="text-[11px] text-violet-600 mt-0.5">место определено решением жюри</div>}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-slate-900 dark:text-white text-base">{round2(row.average)}</td>
                    <td className="px-3 py-3 text-center text-slate-500">{round2(row.sum)}</td>
                    <td className={`px-3 py-3 text-center ${row.missingJuryUids.length ? 'text-amber-600 font-semibold' : 'text-slate-500'}`} title={row.missingJuryUids.length ? `Не оценили: ${row.missingJuryUids.map(nameOf).join(', ')}` : undefined}>
                      {row.juryCount}/{r.juryUids.length}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 dark:text-slate-300">{prize}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="text-sm text-slate-400 text-center py-8">В категории нет пришедших участников.</p>}
        </div>
      </section>

      {resolutions.length > 0 && (
        <section className={`${cardCls} p-5`}>
          <h3 className="font-bold text-slate-900 dark:text-white mb-2">Решения жюри по ничьим</h3>
          <ul className="space-y-2 text-sm">
            {resolutions.map((x, i) => (
              <li key={i} className="text-slate-600 dark:text-slate-300">
                {x.participantIds.map((id) => rows.find((row) => row.participantId === id)?.number || '?').join(' > ')} — «{x.comment}» <span className="text-slate-400">({x.byName}, {fmt(x.at)})</span>
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
      <p className="text-sm text-slate-500 dark:text-slate-400">Проекты равны по итоговому баллу и по всем критериям ничьей. Расставьте их в порядке, который решило жюри.</p>
      <ol className="space-y-2">
        {order.map((x, i) => (
          <li key={x.participantId} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
            <span className="font-bold w-6 text-slate-500">{first + i}</span>
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
