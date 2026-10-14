import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Printer, Trash2, UserCheck, UserX, Pencil, Users, X, RotateCcw } from 'lucide-react';
import EmptyState from '../../../components/ui/EmptyState';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { categoryForAge, participantAge, authorsLabel, type ContestParticipant, type ParticipantStatus } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { Field, Label, Modal, ModalFooter, ParticipantBadge, NumberChip, WarnNote } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls } from '../uiStyles';

type AuthorDraft = { name: string; age: string };
type Form = { participantId?: string; authors: AuthorDraft[]; phone: string; city: string; projectTitle: string; projectDescription: string; categoryId: string };
const emptyForm: Form = { authors: [{ name: '', age: '' }], phone: '', city: '', projectTitle: '', projectDescription: '', categoryId: '' };

const ParticipantsTab: React.FC<ContestTabProps> = ({ data, act, canEdit, canDelete, readOnly }) => {
  const { contest, participants, scores } = data;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState<'' | ParticipantStatus>('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ContestParticipant | null>(null);
  const editable = canEdit && !readOnly;

  const catById = useMemo(() => new Map(contest.categories.map((c) => [c.id, c])), [contest.categories]);
  const scored = useMemo(() => new Set(scores.map((s) => s.participantId)), [scores]);

  const list = participants.filter((p) => {
    if (cat && p.categoryId !== cat) return false;
    if (status && p.status !== status) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return [p.number, p.projectTitle, p.city, p.phone, authorsLabel(p.authors)].join(' ').toLowerCase().includes(needle);
  });

  const counts = {
    registered: participants.filter((p) => p.status === 'registered').length,
    arrived: participants.filter((p) => p.status === 'arrived').length,
    withdrawn: participants.filter((p) => p.status === 'withdrawn').length,
  };

  const openNew = () => { setForm({ ...emptyForm, authors: [{ name: '', age: '' }] }); };
  const openEdit = (p: ContestParticipant) => {
    setForm({
      participantId: p.id,
      authors: p.authors.map((a) => ({ name: a.name, age: a.age == null ? '' : String(a.age) })),
      phone: p.phone, city: p.city, projectTitle: p.projectTitle, projectDescription: p.projectDescription,
      categoryId: p.categoryManual ? p.categoryId : '',
    });
  };

  const autoCat = form ? categoryForAge(contest.categories, participantAge(form.authors.map((a) => ({ name: a.name, age: a.age === '' ? null : Number(a.age) })))) : null;
  const editing = form?.participantId ? participants.find((p) => p.id === form.participantId) : undefined;
  const targetCat = form ? (form.categoryId || autoCat) : null;
  const willRenumber = !!editing && !!targetCat && targetCat !== editing.categoryId;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const payload = {
      participantId: form.participantId,
      authors: form.authors.map((a) => ({ name: a.name, age: a.age === '' ? null : Number(a.age) })),
      phone: form.phone, city: form.city, projectTitle: form.projectTitle, projectDescription: form.projectDescription,
      // '' при редактировании = «снова по возрасту»
      categoryId: form.categoryId || (form.participantId ? '' : undefined),
    };
    const res = await act(form.participantId ? 'updateParticipant' : 'addParticipant', payload, form.participantId ? 'Сохранено' : 'Участник добавлен');
    setSaving(false);
    // Ошибку сервера уже показал тост — форма остаётся открытой с введёнными данными.
    if (res) setForm(null);
  };

  const setP = (p: ContestParticipant, s: ParticipantStatus) => act('setParticipantStatus', { participantId: p.id, status: s });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер, ФИО, проект, телефон" className={`${inputCls} pl-9`} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${inputCls} md:w-44`}>
          <option value="">Все категории</option>
          {contest.categories.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.ageFrom}–{c.ageTo}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={`${inputCls} md:w-48`}>
          <option value="">Все статусы</option>
          <option value="registered">Зарегистрирован ({counts.registered})</option>
          <option value="arrived">Пришёл ({counts.arrived})</option>
          <option value="withdrawn">Снят ({counts.withdrawn})</option>
        </select>
        <Link to={`/contests/${contest.id}/print?what=participants${cat ? `&category=${cat}` : ''}`} target="_blank" className={secondaryBtn}><Printer className="w-4 h-4" />Печать</Link>
        {editable && <button onClick={openNew} disabled={!contest.categories.length} className={primaryBtn}><Plus className="w-4 h-4" />Участник</button>}
      </div>

      {!contest.categories.length && <WarnNote>Сначала задайте возрастные категории — номер проекта присваивается внутри категории.</WarnNote>}

      {!participants.length ? (
        <EmptyState icon={Users} title="Участников пока нет" description="Добавьте участников: категория определится по возрасту, номер присвоится автоматически." />
      ) : (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">№</th>
                  <th className="px-4 py-3 font-semibold">Участник / проект</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Контакты</th>
                  <th className="px-4 py-3 font-semibold">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {list.map((p) => {
                  const c = catById.get(p.categoryId);
                  const frozen = c?.judging === 'approved';
                  return (
                    <tr key={p.id} className={p.status === 'withdrawn' ? 'opacity-60' : ''}>
                      <td className="px-4 py-3 align-top"><NumberChip value={p.number} /></td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-slate-900 dark:text-white">{p.projectTitle || <span className="text-slate-400 font-normal">без названия</span>}</div>
                        <div className="text-slate-500 dark:text-slate-400 text-[13px]">
                          {p.authors.map((a) => `${a.name}${a.age != null ? ` (${a.age})` : ''}`).join(', ')}
                          {p.categoryManual && <span className="ml-1.5 text-[11px] text-amber-600">· категория вручную</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top hidden md:table-cell text-[13px] text-slate-500 dark:text-slate-400">
                        <div>{p.phone}</div><div>{p.city}</div>
                      </td>
                      <td className="px-4 py-3 align-top"><ParticipantBadge status={p.status} /></td>
                      <td className="px-4 py-3 align-top">
                        {editable && !frozen && (
                          <div className="flex items-center justify-end gap-1">
                            {p.status === 'registered' && <button onClick={() => setP(p, 'arrived')} className={`${secondaryBtn} py-1.5`}><UserCheck className="w-4 h-4" />Пришёл</button>}
                            {p.status === 'arrived' && <button onClick={() => setP(p, 'registered')} className={ghostBtn} title="Отменить отметку"><RotateCcw className="w-4 h-4" /></button>}
                            {p.status !== 'withdrawn'
                              ? <button onClick={() => setP(p, 'withdrawn')} className={ghostBtn} title="Снять с конкурса"><UserX className="w-4 h-4" /></button>
                              : <button onClick={() => setP(p, 'registered')} className={ghostBtn} title="Вернуть"><RotateCcw className="w-4 h-4" /></button>}
                            <button onClick={() => openEdit(p)} className={ghostBtn} title="Изменить"><Pencil className="w-4 h-4" /></button>
                            {canDelete && !scored.has(p.id) && <button onClick={() => setPendingDelete(p)} className={`${ghostBtn} text-rose-600`} title="Удалить"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!list.length && <p className="text-sm text-slate-400 text-center py-8">Никого не найдено</p>}
        </div>
      )}

      <Modal open={!!form} wide title={form?.participantId ? `Участник ${editing?.number || ''}` : 'Новый участник'} onClose={() => setForm(null)}
        footer={<ModalFooter onCancel={() => setForm(null)} onSave={save} saving={saving} disabled={!form?.authors.some((a) => a.name.trim()) || !targetCat} />}>
        {form && (
          <>
            <div>
              <Label>Авторы проекта</Label>
              <div className="space-y-2">
                {form.authors.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_32px] gap-2">
                    <input autoFocus={i === 0} value={a.name} placeholder={i === 0 ? 'ФИО участника' : 'ФИО соавтора'}
                      onChange={(e) => setForm({ ...form, authors: form.authors.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} className={inputCls} />
                    <input type="number" inputMode="numeric" min={3} max={120} value={a.age} placeholder="Возраст"
                      onChange={(e) => setForm({ ...form, authors: form.authors.map((x, k) => (k === i ? { ...x, age: e.target.value } : x)) })} className={inputCls} />
                    {form.authors.length > 1
                      ? <button onClick={() => setForm({ ...form, authors: form.authors.filter((_, k) => k !== i) })} className={ghostBtn} aria-label="Убрать автора"><X className="w-4 h-4" /></button>
                      : <span />}
                  </div>
                ))}
              </div>
              <button onClick={() => setForm({ ...form, authors: [...form.authors, { name: '', age: '' }] })} className={`${ghostBtn} mt-2`}><Plus className="w-3.5 h-3.5" />Соавтор (командный проект)</button>
              {form.authors.length > 1 && <p className="text-[11px] text-slate-400 mt-1">Категория команды определяется по старшему участнику.</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Телефон"><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
              <Field label="Город / район"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} /></Field>
            </div>
            <Field label="Название проекта"><input value={form.projectTitle} onChange={(e) => setForm({ ...form, projectTitle: e.target.value })} className={inputCls} /></Field>
            <Field label="Краткое описание"><textarea rows={3} value={form.projectDescription} onChange={(e) => setForm({ ...form, projectDescription: e.target.value })} className={inputCls} /></Field>
            <Field label="Категория" hint={autoCat ? undefined : 'Возраст не подходит ни под одну категорию — выберите вручную'}>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={inputCls}>
                <option value="">{autoCat ? `Авто по возрасту: ${catById.get(autoCat)?.code}` : 'Авто по возрасту: не определена'}</option>
                {contest.categories.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.ageFrom}–{c.ageTo})</option>)}
              </select>
            </Field>
            {willRenumber && <WarnNote>Проект перейдёт в категорию {catById.get(targetCat!)?.code} и получит новый номер в ней. Старый номер {editing?.number} больше не будет использован.</WarnNote>}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Удалить ${pendingDelete?.number}?`}
        message="Номер не освободится — следующий участник категории получит следующий номер. Если участник просто не пришёл, лучше снять его с конкурса."
        confirmLabel="Удалить" danger
        onConfirm={async () => { if (pendingDelete) await act('deleteParticipant', { participantId: pendingDelete.id }, 'Удалено'); setPendingDelete(null); }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default ParticipantsTab;
