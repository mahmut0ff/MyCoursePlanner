import React, { useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle, Award } from 'lucide-react';
import { findAgeOverlaps, prizeMoneyTotal, type ContestCategory, type ContestPrize } from '../../../lib/contests';
import { formatMoney } from '../../../lib/money';
import type { ContestTabProps } from '../ContestDetailPage';
import { Label, WarnNote, JudgingBadge } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls } from '../uiStyles';

type Draft = Pick<ContestCategory, 'code' | 'name' | 'prizes'> & { id?: string; ageFrom: string; ageTo: string; judging?: ContestCategory['judging']; nextSeq?: number };

const toDraft = (c: ContestCategory): Draft => ({ ...c, ageFrom: String(c.ageFrom), ageTo: String(c.ageTo) });
const nextCode = (used: string[]) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !used.includes(l)) || '';

const CategoriesTab: React.FC<ContestTabProps> = ({ data, act, canEdit, readOnly }) => {
  const { contest, participants } = data;
  const initial = useMemo(() => contest.categories.map(toDraft), [contest.categories]);
  const [rows, setRows] = useState<Draft[]>(initial);
  const [saving, setSaving] = useState(false);

  const disabled = !canEdit || readOnly;
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const parsed = rows.map((r, i) => ({ id: r.id || `new-${i}`, code: r.code, ageFrom: Number(r.ageFrom), ageTo: Number(r.ageTo), prizes: r.prizes }));
  // Пустые поля возраста пока не проверяем — иначе «0» из пустой строки дал бы ложное пересечение.
  const overlaps = findAgeOverlaps(parsed.filter((r, i) => rows[i].ageFrom !== '' && rows[i].ageTo !== '' && r.ageFrom <= r.ageTo));
  const codeOf = (id: string) => parsed.find((r) => r.id === id)?.code || '?';
  const prizes = prizeMoneyTotal(parsed);
  const diff = contest.prizeFund - prizes;

  const patch = (i: number, p: Partial<Draft>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const patchPrize = (i: number, j: number, p: Partial<ContestPrize>) =>
    patch(i, { prizes: rows[i].prizes.map((x, k) => (k === j ? { ...x, ...p } : x)) });

  const add = () => {
    const code = nextCode(rows.map((r) => r.code));
    const last = rows[rows.length - 1];
    const from = last ? Number(last.ageTo) + 1 : '';
    setRows((rs) => [...rs, { code, name: '', ageFrom: String(from), ageTo: '', prizes: [{ place: 1, title: '', amount: 0 }, { place: 2, title: '', amount: 0 }, { place: 3, title: '', amount: 0 }] }]);
  };

  const save = async () => {
    setSaving(true);
    await act('saveCategories', {
      categories: rows.map((r) => ({ id: r.id, code: r.code, name: r.name, ageFrom: Number(r.ageFrom), ageTo: Number(r.ageTo), prizes: r.prizes.map((p) => ({ title: p.title, amount: Number(p.amount) || 0 })) })),
    }, 'Категории сохранены');
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm`}>
        <span className="text-slate-500 dark:text-slate-500 dark:text-slate-400">Денежные призы: <b className="text-slate-900 dark:text-white">{formatMoney(prizes)}</b></span>
        <span className="text-slate-500 dark:text-slate-500 dark:text-slate-400">Заявленный фонд: <b className="text-slate-900 dark:text-white">{contest.prizeFund ? formatMoney(contest.prizeFund) : '—'}</b></span>
        {contest.prizeFund > 0 && (
          <span className={`font-semibold ${diff < 0 ? 'text-rose-600 dark:text-rose-400' : diff > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {diff === 0 ? 'Сходится с фондом' : diff > 0 ? `Не распределено: ${formatMoney(diff)}` : `Превышение фонда: ${formatMoney(-diff)}`}
          </span>
        )}
      </div>

      {overlaps.length > 0 && (
        <WarnNote className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Возрастные диапазоны пересекаются: {overlaps.map((o) => `${codeOf(o.a)} и ${codeOf(o.b)}`).join(', ')}. Участник попадёт в первую подходящую категорию.</span>
        </WarnNote>
      )}

      {rows.map((r, i) => {
        const count = r.id ? participants.filter((p) => p.categoryId === r.id).length : 0;
        const codeLocked = !!r.nextSeq && r.nextSeq > 1;
        return (
          <section key={r.id || `new-${i}`} className={`${cardCls} p-5`}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center font-bold">{r.code || '?'}</span>
                <span className="text-sm text-slate-500 dark:text-slate-500 dark:text-slate-400">{count} участн.</span>
                {r.judging && <JudgingBadge state={r.judging} />}
              </div>
              {!disabled && (
                <button onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} disabled={count > 0 || (r.judging && r.judging !== 'pending')}
                  title={count > 0 ? 'В категории есть участники' : 'Удалить категорию'} className={`${ghostBtn} text-rose-600`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <fieldset disabled={disabled} className="grid grid-cols-2 sm:grid-cols-[90px_1fr_110px_110px] gap-3">
              <div>
                <Label>Код</Label>
                <input value={r.code} maxLength={3} disabled={codeLocked} title={codeLocked ? 'Номера уже присвоены — код не меняется' : undefined}
                  onChange={(e) => patch(i, { code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} className={`${inputCls} font-mono font-bold`} />
              </div>
              <div>
                <Label>Название</Label>
                <input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder={`Категория ${r.code}`} className={inputCls} />
              </div>
              <div>
                <Label>Возраст от</Label>
                <input type="number" min={0} inputMode="numeric" value={r.ageFrom} onChange={(e) => patch(i, { ageFrom: e.target.value })} className={inputCls} />
              </div>
              <div>
                <Label>до</Label>
                <input type="number" min={0} inputMode="numeric" value={r.ageTo} onChange={(e) => patch(i, { ageTo: e.target.value })} className={inputCls} />
              </div>
            </fieldset>

            <div className="mt-5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2"><Award className="w-3.5 h-3.5" />Призовые места</div>
              <div className="space-y-2">
                {r.prizes.map((p, j) => (
                  <fieldset key={j} disabled={disabled} className="grid grid-cols-[44px_1fr_120px_32px] gap-2 items-center">
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{j + 1}</span>
                    <input value={p.title} onChange={(e) => patchPrize(i, j, { title: e.target.value })} placeholder="Кубок, диплом I степени" className={inputCls} />
                    <input type="number" min={0} inputMode="numeric" value={p.amount || ''} onChange={(e) => patchPrize(i, j, { amount: Number(e.target.value) || 0 })} placeholder="Сумма" className={inputCls} />
                    {!disabled && (
                      <button onClick={() => patch(i, { prizes: r.prizes.filter((_, k) => k !== j) })} className={ghostBtn} aria-label="Убрать место"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </fieldset>
                ))}
              </div>
              {!disabled && (
                <button onClick={() => patch(i, { prizes: [...r.prizes, { place: r.prizes.length + 1, title: '', amount: 0 }] })} className={`${ghostBtn} mt-2`}>
                  <Plus className="w-3.5 h-3.5" />Добавить место
                </button>
              )}
            </div>
          </section>
        );
      })}

      {!rows.length && <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Категорий пока нет. Пример: A — 12–15 лет, B — 16–20, C — 21–25.</p>}

      {!disabled && (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${dirty ? 'sticky bottom-0 z-10 -mx-1 px-4 py-3 rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-lg' : ''}`}>
          <button onClick={add} className={secondaryBtn}><Plus className="w-4 h-4" />Категория</button>
          <div className="flex items-center gap-3">
            {dirty && <span className="text-[13px] text-slate-600 dark:text-slate-300">Есть несохранённые изменения</span>}
            <button onClick={save} disabled={!dirty || saving} className={primaryBtn}>{saving ? '…' : 'Сохранить категории'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesTab;
