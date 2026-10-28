import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Trash2, Users, Gavel, Layers, Wallet } from 'lucide-react';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { apiContestAction } from '../../../lib/api';
import { prizeMoneyTotal } from '../../../lib/contests';
import { formatMoney } from '../../../lib/money';
import type { ContestTabProps } from '../ContestDetailPage';
import ContestMetaFields from '../ContestMetaFields';
import { JudgingBadge } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, errMessage, ageRangeLabel } from '../uiStyles';

const OverviewTab: React.FC<ContestTabProps> = ({ data, act, canEdit, canDelete, readOnly, goTab }) => {
  const { contest, participants, jury } = data;
  const navigate = useNavigate();
  const initial = useMemo(() => ({
    title: contest.title, season: contest.season, kind: contest.kind, theme: contest.theme,
    eventDate: contest.eventDate, venue: contest.venue, prizeFund: String(contest.prizeFund || ''), description: contest.description,
    judgingMode: contest.judgingMode,
  }), [contest]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const prizes = prizeMoneyTotal(contest.categories);
  const diff = contest.prizeFund - prizes;

  const save = async () => {
    setSaving(true);
    await act('update', { ...form, prizeFund: Number(form.prizeFund) || 0 }, 'Сохранено');
    setSaving(false);
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await apiContestAction('delete', contest.id);
      toast.success('Конкурс удалён');
      navigate('/contests');
    } catch (e) { toast.error(errMessage(e)); setDeleting(false); setConfirmDelete(false); }
  };

  const stat = (icon: React.ReactNode, label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className={`${cardCls} p-4`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{icon}{label}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );

  const arrived = participants.filter((p) => p.status === 'arrived').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className={`${cardCls} p-5 lg:col-span-2`}>
        <h2 className="font-bold text-slate-900 dark:text-white mb-4">Паспорт конкурса</h2>
        <ContestMetaFields form={form} setForm={setForm} disabled={!canEdit || readOnly} />
        {canEdit && !readOnly && (
          <div className="flex justify-end mt-5">
            <button onClick={save} disabled={!dirty || saving || !form.title.trim()} className={primaryBtn}>{saving ? '…' : 'Сохранить'}</button>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          {stat(<Users className="w-3.5 h-3.5" />, 'Участники', participants.filter((p) => p.status !== 'withdrawn').length, `пришли: ${arrived}`)}
          {stat(<Gavel className="w-3.5 h-3.5" />, 'Жюри', jury.length)}
          {stat(<Wallet className="w-3.5 h-3.5" />, 'Денежные призы', formatMoney(prizes),
            contest.prizeFund > 0
              ? <span className={diff < 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}>
                  фонд {formatMoney(contest.prizeFund)} · {diff === 0 ? 'совпадает' : diff > 0 ? `остаток ${formatMoney(diff)}` : `превышение ${formatMoney(-diff)}`}
                </span>
              : 'призовой фонд не указан')}
        </div>
        <div className={`${cardCls} p-4`}>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3"><Layers className="w-3.5 h-3.5" />Категории</div>
          {contest.categories.length ? (
            <ul className="space-y-1">
              {contest.categories.map((c) => (
                <li key={c.id}>
                  <button onClick={() => (contest.status === 'judging' || contest.status === 'finished' ? goTab('monitor', c.id) : goTab('categories'))}
                    className="w-full flex items-center justify-between gap-2 text-sm rounded-lg -mx-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left">
                    <span className="text-slate-700 dark:text-slate-200"><b>{c.code}</b> · {ageRangeLabel(c)} · {participants.filter((p) => p.categoryId === c.id && p.status !== 'withdrawn').length} уч.</span>
                    <JudgingBadge state={c.judging} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <button onClick={() => goTab('categories')} className="text-sm underline underline-offset-2 text-slate-700 dark:text-slate-200">Задать категории</button>}
        </div>
        {canDelete && !readOnly && (
          <button onClick={() => setConfirmDelete(true)} className={`${secondaryBtn} w-full text-rose-600 dark:text-rose-400`}>
            <Trash2 className="w-4 h-4" />Удалить конкурс
          </button>
        )}
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить конкурс?"
        message="Удалятся участники, жюри и настройки. Если оценки уже выставлены, удалить нельзя — такой конкурс можно только завершить."
        confirmLabel="Удалить"
        danger busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
};

export default OverviewTab;
