import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { Plus, Search, Printer, Trash2, UserCheck, Pencil, Users, X, Lock } from 'lucide-react';
import EmptyState from '../../../components/ui/EmptyState';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import RowMenu from '../../../components/ui/RowMenu';
import { categoryForAge, participantAge, authorsLabel, type ContestParticipant, type ParticipantStatus } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { Field, Label, Modal, ModalFooter, ParticipantBadge, NumberChip, WarnNote, Segmented } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls, categoryLabel, ageRangeLabel, participantStatusLabel } from '../uiStyles';

type AuthorDraft = { name: string; age: string };
type Form = { participantId?: string; authors: AuthorDraft[]; phone: string; city: string; projectTitle: string; projectDescription: string; categoryId: string };
const emptyForm: Form = { authors: [{ name: '', age: '' }], phone: '', city: '', projectTitle: '', projectDescription: '', categoryId: '' };

const STATUSES: ParticipantStatus[] = ['registered', 'arrived', 'withdrawn'];
// Русский фолбэк для t(`contests.part.short.${status}`).
const STATUS_SHORT: Record<ParticipantStatus, string> = { registered: 'Ждём', arrived: 'Пришёл', withdrawn: 'Снят' };

const STATUS_TONE: Record<ParticipantStatus, string> = {
  registered: 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900', arrived: 'bg-emerald-600 text-white', withdrawn: 'bg-rose-600 text-white',
};

/** Переключатель статуса прямо в строке: один контрол вместо трёх иконок. */
const StatusSwitch: React.FC<{ value: ParticipantStatus; onChange: (s: ParticipantStatus) => void }> = ({ value, onChange }) => (
  <Segmented label={i18n.t('contests.part.statusLabel', 'Статус участника')} value={value} onChange={onChange}
    options={STATUSES.map((s) => ({ value: s, label: i18n.t(`contests.part.short.${s}`, STATUS_SHORT[s]), title: participantStatusLabel(s) }))}
    className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900/40"
    optionCls={(on, s) => `px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors ${on ? STATUS_TONE[s] : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`} />
);

const ParticipantsTab: React.FC<ContestTabProps> = ({ data, act, canEdit, canDelete, readOnly, categoryId }) => {
  const { t } = useTranslation();
  const { contest, participants, scores } = data;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(categoryId || '');
  const [status, setStatus] = useState<'' | ParticipantStatus>('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ContestParticipant | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const inScope = participants.filter((p) => !cat || p.categoryId === cat);
  const counts = {
    registered: inScope.filter((p) => p.status === 'registered').length,
    arrived: inScope.filter((p) => p.status === 'arrived').length,
    withdrawn: inScope.filter((p) => p.status === 'withdrawn').length,
  };
  // Массовая отметка: все «ждём» в текущем срезе, чья категория ещё не утверждена.
  const markable = inScope.filter((p) => p.status === 'registered' && catById.get(p.categoryId)?.judging !== 'approved');

  const openNew = () => { setForm({ ...emptyForm, authors: [{ name: '', age: '' }], categoryId: '' }); };
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
    const res = await act(form.participantId ? 'updateParticipant' : 'addParticipant', payload, form.participantId ? t('common.saved', 'Сохранено') : t('contests.part.added', 'Участник добавлен'));
    setSaving(false);
    // Ошибку сервера уже показал тост — форма остаётся открытой с введёнными данными.
    if (res) setForm(null);
  };

  const setP = (p: ContestParticipant, s: ParticipantStatus) =>
    act('setParticipantStatus', { participantId: p.id, status: s }, `${p.number}: ${participantStatusLabel(s).toLowerCase()}`);
  const markAll = async () => {
    setBusy(true);
    await act('setParticipantStatus', { participantIds: markable.map((p) => p.id), status: 'arrived' }, t('contests.part.markedN', 'Отмечены пришедшими: {{n}}', { n: markable.length }));
    setBusy(false);
    setConfirmAll(false);
  };

  const chip = (value: '' | ParticipantStatus, label: string, n: number) => ({
    value, label: <>{label}<span className={`ml-1.5 ${status === value ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}>{n}</span></>,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-600 dark:text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('contests.part.searchPh', 'Номер, ФИО, проект, телефон')} aria-label={t('contests.part.searchAria', 'Поиск участника')} className={`${inputCls} pl-9`} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('contests.category', 'Категория')} className={`${inputCls} md:w-48`}>
          <option value="">{t('contests.allCategories', 'Все категории')}</option>
          {contest.categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
        </select>
        <Link to={`/contests/${contest.id}/print?what=participants${cat ? `&category=${cat}` : ''}`} target="_blank" className={secondaryBtn}><Printer className="w-4 h-4" />{t('contests.printBtn', 'Печать')}</Link>
        {editable && <button onClick={openNew} disabled={!contest.categories.length} className={primaryBtn}><Plus className="w-4 h-4" />{t('contests.part.participant', 'Участник')}</button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented label={t('common.status', 'Статус')} value={status} onChange={setStatus} className="flex flex-wrap gap-2"
          options={[chip('', t('common.all', 'Все'), inScope.length), chip('registered', t('contests.part.notArrived', 'Не пришли'), counts.registered), chip('arrived', t('contests.part.arrived', 'Пришли'), counts.arrived), chip('withdrawn', t('contests.part.withdrawn', 'Сняты'), counts.withdrawn)]}
          optionCls={(on) => `px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${on ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'}`} />
        {editable && markable.length > 0 && (
          <button onClick={() => setConfirmAll(true)} disabled={busy} className={`${secondaryBtn} ml-auto`}>
            <UserCheck className="w-4 h-4" />{t('contests.part.markAll', 'Отметить всех пришедшими')}{cat ? ` (${catById.get(cat)?.code})` : ''} · {markable.length}
          </button>
        )}
      </div>

      {!contest.categories.length && <WarnNote>{t('contests.part.needCategories', 'Сначала задайте возрастные категории — номер проекта присваивается внутри категории.')}</WarnNote>}

      {!participants.length ? (
        <EmptyState icon={Users} title={t('contests.noParticipants', 'Участников пока нет')} description={t('contests.part.emptyDesc', 'Добавьте участников: категория определится по возрасту, номер присвоится автоматически.')} />
      ) : (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">№</th>
                  <th className="px-4 py-3 font-semibold">{t('contests.part.participantProject', 'Участник / проект')}</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">{t('contests.part.contacts', 'Контакты')}</th>
                  <th className="px-4 py-3 font-semibold">{t('common.status', 'Статус')}</th>
                  <th className="px-4 py-3 text-right font-semibold"><span className="sr-only">{t('common.actions', 'Действия')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {list.map((p) => {
                  const c = catById.get(p.categoryId);
                  const frozen = c?.judging === 'approved';
                  const canRemove = canDelete && !scored.has(p.id);
                  return (
                    <tr key={p.id} className={p.status === 'withdrawn' ? 'opacity-60' : ''}>
                      <td className="px-4 py-3 align-top"><NumberChip value={p.number} /></td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-slate-900 dark:text-white">{p.projectTitle || <span className="text-slate-500 dark:text-slate-400 font-normal">{t('contests.part.untitled', 'без названия')}</span>}</div>
                        <div className="text-slate-600 dark:text-slate-300 text-[13px]">
                          {p.authors.map((a) => `${a.name}${a.age != null ? ` (${a.age})` : ''}`).join(', ')}
                          {p.categoryManual && <span className="ml-1.5 text-[11px] text-amber-700 dark:text-amber-400">· {t('contests.part.manualCategory', 'категория вручную')}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top hidden md:table-cell text-[13px] text-slate-600 dark:text-slate-300">
                        <div>{p.phone}</div><div>{p.city}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {editable && !frozen
                          ? <StatusSwitch value={p.status} onChange={(s) => setP(p, s)} />
                          : <span className="inline-flex items-center gap-1.5"><ParticipantBadge status={p.status} />{frozen && <Lock className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" aria-label={t('contests.part.frozen', 'Итоги категории утверждены')} role="img" />}</span>}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        {editable && !frozen && (
                          <RowMenu label={`${t('common.actions', 'Действия')}: ${p.number}`} items={[
                            { label: t('contests.edit', 'Изменить'), icon: Pencil, onSelect: () => openEdit(p) },
                            ...(canRemove ? [{ label: t('common.delete', 'Удалить'), icon: Trash2, danger: true, separated: true, onSelect: () => setPendingDelete(p) }] : []),
                          ]} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!list.length && <p className="text-sm text-slate-600 dark:text-slate-300 text-center py-8">{t('contests.part.nobody', 'Никого не найдено')}{status || q || cat ? ` — ${t('contests.part.clearFilters', 'попробуйте снять фильтры')}` : ''}</p>}
        </div>
      )}

      <Modal open={!!form} wide title={form?.participantId ? t('contests.part.participantN', 'Участник {{number}}', { number: editing?.number || '' }) : t('contests.part.new', 'Новый участник')} onClose={() => setForm(null)}
        footer={<ModalFooter onCancel={() => setForm(null)} onSave={save} saving={saving} disabled={!form?.authors.some((a) => a.name.trim()) || !targetCat} saveLabel={form?.participantId ? t('common.save', 'Сохранить') : t('common.add', 'Добавить')} />}>
        {form && (
          <>
            <div>
              <Label>{t('contests.part.authors', 'Авторы проекта')}</Label>
              <div className="space-y-2">
                {form.authors.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_36px] gap-2">
                    <input value={a.name} placeholder={i === 0 ? t('contests.part.nameMain', 'ФИО участника') : t('contests.part.nameCo', 'ФИО соавтора')} aria-label={i === 0 ? t('contests.part.nameMain', 'ФИО участника') : `${t('contests.part.nameCo', 'ФИО соавтора')} ${i}`}
                      onChange={(e) => setForm({ ...form, authors: form.authors.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} className={inputCls} />
                    <input type="number" inputMode="numeric" min={3} max={120} value={a.age} placeholder={t('contests.part.age', 'Возраст')} aria-label={t('contests.part.age', 'Возраст')}
                      onChange={(e) => setForm({ ...form, authors: form.authors.map((x, k) => (k === i ? { ...x, age: e.target.value } : x)) })} className={inputCls} />
                    {form.authors.length > 1
                      ? <button type="button" onClick={() => setForm({ ...form, authors: form.authors.filter((_, k) => k !== i) })} className={ghostBtn} aria-label={t('contests.part.removeAuthor', 'Убрать автора')}><X className="w-4 h-4" /></button>
                      : <span />}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setForm({ ...form, authors: [...form.authors, { name: '', age: '' }] })} className={`${ghostBtn} mt-2`}><Plus className="w-3.5 h-3.5" />{t('contests.part.addCoauthor', 'Соавтор (командный проект)')}</button>
              {form.authors.length > 1 && <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-1">{t('contests.part.teamCategory', 'Категория команды определяется по старшему участнику.')}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('common.phone', 'Телефон')}><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
              <Field label={t('contests.part.city', 'Город / район')}><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} /></Field>
            </div>
            <Field label={t('contests.part.projectTitle', 'Название проекта')}><input value={form.projectTitle} onChange={(e) => setForm({ ...form, projectTitle: e.target.value })} className={inputCls} /></Field>
            <Field label={t('contests.part.projectDesc', 'Краткое описание')}><textarea rows={3} value={form.projectDescription} onChange={(e) => setForm({ ...form, projectDescription: e.target.value })} className={inputCls} /></Field>
            <Field label={t('contests.category', 'Категория')} hint={autoCat ? undefined : t('contests.part.noAutoCat', 'Возраст не подходит ни под одну категорию — выберите вручную')}>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={inputCls}>
                <option value="">{autoCat ? t('contests.part.autoCat', 'Авто по возрасту: {{code}}', { code: catById.get(autoCat)?.code }) : t('contests.part.autoCatNone', 'Авто по возрасту: не определена')}</option>
                {contest.categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}{c.name && c.name !== ageRangeLabel(c) ? ` · ${c.name}` : ''}</option>)}
              </select>
            </Field>
            {willRenumber && <WarnNote>{t('contests.part.renumber', 'Проект перейдёт в категорию {{code}} и получит новый номер в ней. Старый номер {{number}} больше не будет использован.', { code: catById.get(targetCat!)?.code, number: editing?.number })}</WarnNote>}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmAll}
        title={t('contests.part.markTitle', 'Отметить пришедшими: {{n}}?', { n: markable.length })}
        message={cat ? t('contests.part.markMsgCat', 'Все ожидающие участники категории {{code}} получат статус «Пришёл». Отдельного участника потом можно переключить обратно.', { code: catById.get(cat)?.code }) : t('contests.part.markMsg', 'Все ожидающие участники получат статус «Пришёл». Отдельного участника потом можно переключить обратно.')}
        confirmLabel={t('contests.part.mark', 'Отметить')}
        busy={busy}
        onConfirm={markAll}
        onClose={() => setConfirmAll(false)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title={t('contests.part.deleteTitle', 'Удалить {{number}}?', { number: pendingDelete?.number })}
        message={t('contests.part.deleteMsg', 'Номер не освободится — следующий участник категории получит следующий номер. Если участник просто не пришёл, лучше снять его с конкурса.')}
        confirmLabel={t('common.delete', 'Удалить')} danger
        onConfirm={async () => { if (pendingDelete) await act('deleteParticipant', { participantId: pendingDelete.id }, t('contests.part.deleted', 'Удалено')); setPendingDelete(null); }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default ParticipantsTab;
