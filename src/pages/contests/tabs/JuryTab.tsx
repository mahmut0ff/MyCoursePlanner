import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Plus, Gavel, KeyRound, Pencil, Trash2, Copy, RefreshCw, Smartphone } from 'lucide-react';
import EmptyState from '../../../components/ui/EmptyState';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { juryForCategory, type ContestJuryMember } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { Field, Label, Modal, ModalFooter, WarnNote } from '../ui';
import { cardCls, primaryBtn, ghostBtn, inputCls } from '../uiStyles';

// Русский фолбэк для t(`contests.jury.account.${type}`).
const ACCOUNT_LABEL: Record<ContestJuryMember['accountType'], string> = {
  jury: 'Учётка жюри',
  staff: 'Сотрудник',
  existing: 'Существующий аккаунт',
};

function genPassword(): string {
  // Без похожих символов (0/O, 1/l) — пароль диктуют вслух или пишут на листке.
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join('');
}

type Form = { juryId?: string; name: string; email: string; title: string; password: string; all: boolean; categoryIds: string[] };

const JuryTab: React.FC<ContestTabProps> = ({ data, act, canEdit, readOnly }) => {
  const { t } = useTranslation();
  const { contest, jury, participants, scores } = data;
  const editable = canEdit && !readOnly;
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string | null; note?: string } | null>(null);
  const [pwFor, setPwFor] = useState<ContestJuryMember | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pendingRemove, setPendingRemove] = useState<ContestJuryMember | null>(null);

  const progress = (j: ContestJuryMember) => {
    const cats = contest.categories.filter((c) => juryForCategory([j], c.id).length);
    const ids = new Set(participants.filter((p) => p.status === 'arrived' && cats.some((c) => c.id === p.categoryId)).map((p) => p.id));
    const done = scores.filter((s) => s.juryUid === j.uid && ids.has(s.participantId)).length;
    return { done, total: ids.size, cats };
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const categoryIds = form.all ? null : form.categoryIds;
    if (form.juryId) {
      const r = await act('updateJury', { juryId: form.juryId, name: form.name, title: form.title, categoryIds }, t('common.saved', 'Сохранено'));
      if (r) setForm(null);
    } else {
      const r = await act<any>('addJury', { name: form.name, email: form.email, title: form.title, password: form.password, categoryIds });
      if (r) {
        setForm(null);
        setCreds({
          name: r.name, email: r.email,
          password: r.existingAccount ? null : form.password,
          note: r.existingAccount
            ? (r.accountType === 'staff'
              ? t('contests.jury.staffNote', 'Это сотрудник вашей организации: он входит своим обычным паролем, в меню у него появится пункт «Оценивание».')
              : t('contests.jury.existingNote', 'Этот email уже зарегистрирован в системе — человек входит своим паролем.'))
            : undefined,
        });
      }
    }
    setSaving(false);
  };

  const copyCreds = () => {
    if (!creds) return;
    const text = t('contests.jury.credsText', 'Вход для жюри «{{title}}»\nАдрес: {{url}}\nЛогин: {{login}}', { title: contest.title, url: `${window.location.origin}/login`, login: creds.email })
      + (creds.password ? `\n${t('contests.jury.password', 'Пароль')}: ${creds.password}` : '');
    navigator.clipboard?.writeText(text).then(() => toast.success(t('contests.copied', 'Скопировано')), () => toast.error(t('contests.copyFailed', 'Не удалось скопировать')));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
          {t('contests.jury.intro', 'Член жюри входит по email и паролю и видит только экран оценивания своих категорий — без доступа к остальной системе, без чужих оценок и общего рейтинга.')}
        </p>
        {editable && (
          <button onClick={() => setForm({ name: '', email: '', title: '', password: genPassword(), all: true, categoryIds: [] })} className={primaryBtn}>
            <Plus className="w-4 h-4" />{t('contests.jury.member', 'Член жюри')}
          </button>
        )}
      </div>

      {!jury.length ? (
        <EmptyState icon={Gavel} title={t('contests.jury.emptyTitle', 'Жюри пока не назначено')} description={t('contests.jury.emptyDesc', 'Добавьте членов жюри — для каждого создастся вход только в оценивание.')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {jury.map((j) => {
            const pr = progress(j);
            const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
            return (
              <div key={j.id} className={`${cardCls} p-5`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{j.name}</div>
                    {j.title && <div className="text-[13px] text-slate-500 dark:text-slate-400">{j.title}</div>}
                    <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">{j.email}</div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap">{t(`contests.jury.account.${j.accountType}`, ACCOUNT_LABEL[j.accountType])}</span>
                </div>
                <div className="mt-3 text-[13px] text-slate-600 dark:text-slate-300">
                  {t('contests.jury.categories', 'Категории')}: <b>{j.categoryIds?.length ? pr.cats.map((c) => c.code).join(', ') : t('contests.jury.allLower', 'все')}</b>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-[12px] text-slate-600 dark:text-slate-300 mb-1"><span>{pr.cats.length === contest.categories.length ? t('contests.jury.scoredAll', 'Оценено по всем категориям') : t('contests.jury.scoredCats', { count: pr.cats.length, defaultValue: 'Оценено по {{count}} кат.' })}</span><span className="font-semibold">{t('contests.xOfY', '{{x}} из {{y}}', { x: pr.done, y: pr.total })}</span></div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {editable && (
                  <div className="flex items-center gap-1 mt-4 -ml-2">
                    <button onClick={() => setForm({ juryId: j.id, name: j.name, email: j.email, title: j.title, password: '', all: !j.categoryIds?.length, categoryIds: j.categoryIds || [] })} className={ghostBtn}><Pencil className="w-3.5 h-3.5" />{t('contests.edit', 'Изменить')}</button>
                    {j.accountType === 'jury' && <button onClick={() => { setPwFor(j); setNewPw(genPassword()); }} className={ghostBtn}><KeyRound className="w-3.5 h-3.5" />{t('contests.jury.password', 'Пароль')}</button>}
                    <button onClick={() => setPendingRemove(j)} className={`${ghostBtn} text-rose-600 ml-auto`} aria-label={t('contests.jury.removeAria', 'Убрать из жюри')}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!form} title={form?.juryId ? t('contests.jury.member', 'Член жюри') : t('contests.jury.new', 'Новый член жюри')} onClose={() => setForm(null)}
        footer={<ModalFooter onCancel={() => setForm(null)} onSave={save} saving={saving}
          disabled={!form || !form.email.trim() || (!form.all && !form.categoryIds.length)} saveLabel={form?.juryId ? t('common.save', 'Сохранить') : t('common.add', 'Добавить')} />}>
        {form && (
          <>
            <Field label={t('common.name', 'Имя')}><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
            <Field label={t('contests.jury.emailLogin', 'Email (логин)')}>
              <input type="email" value={form.email} disabled={!!form.juryId} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t('contests.jury.position', 'Должность / описание (необязательно)')}><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('contests.jury.positionPh', 'Инженер, КГТУ')} className={inputCls} /></Field>
            {!form.juryId && (
              <Field label={t('contests.jury.password', 'Пароль')} hint={t('contests.jury.passwordHint', 'Если email уже есть в системе (например, это ваш сотрудник), пароль не меняется — человек входит своим.')}>
                <div className="flex gap-2">
                  <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={`${inputCls} font-mono`} />
                  <button onClick={() => setForm({ ...form, password: genPassword() })} className={ghostBtn} aria-label={t('contests.jury.generate', 'Сгенерировать')}><RefreshCw className="w-4 h-4" /></button>
                </div>
              </Field>
            )}
            <div>
              <Label>{t('contests.jury.judgesCategories', 'Оценивает категории')}</Label>
              <label className="flex items-center gap-2 text-sm mb-2"><input type="checkbox" checked={form.all} onChange={(e) => setForm({ ...form, all: e.target.checked })} className="w-4 h-4 accent-slate-900 dark:accent-white" />{t('contests.allCategories', 'Все категории')}</label>
              {!form.all && (
                <div className="flex flex-wrap gap-2">
                  {contest.categories.map((c) => {
                    const on = form.categoryIds.includes(c.id);
                    return (
                      <button key={c.id} onClick={() => setForm({ ...form, categoryIds: on ? form.categoryIds.filter((x) => x !== c.id) : [...form.categoryIds, c.id] })}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${on ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                        {c.code} · {c.ageFrom}–{c.ageTo}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!creds} title={t('contests.jury.credsTitle', 'Данные для входа')} onClose={() => setCreds(null)}
        footer={<><button onClick={copyCreds} className={primaryBtn}><Copy className="w-4 h-4" />{t('common.copy', 'Копировать')}</button></>}>
        {creds && (
          <>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-4 font-mono text-sm space-y-1">
              <div>{creds.name}</div>
              <div>{t('contests.jury.login', 'Логин')}: <b>{creds.email}</b></div>
              {creds.password && <div>{t('contests.jury.password', 'Пароль')}: <b>{creds.password}</b></div>}
            </div>
            {creds.note
              ? <WarnNote>{creds.note}</WarnNote>
              : <p className="text-sm text-slate-500 dark:text-slate-400 flex items-start gap-2"><Smartphone className="w-4 h-4 mt-0.5 shrink-0" />{t('contests.jury.handOver', 'Передайте эти данные члену жюри. С телефона он откроет {{url}} и сразу попадёт на экран оценивания. Пароль больше не показывается — при необходимости задайте новый.', { url: `${window.location.host}/login` })}</p>}
          </>
        )}
      </Modal>

      <Modal open={!!pwFor} title={t('contests.jury.newPasswordFor', 'Новый пароль: {{name}}', { name: pwFor?.name || '' })} onClose={() => setPwFor(null)}
        footer={<ModalFooter onCancel={() => setPwFor(null)} saveLabel={t('contests.jury.setPassword', 'Задать пароль')} saving={saving} disabled={newPw.length < 6}
          onSave={async () => {
            if (!pwFor) return;
            setSaving(true);
            const r = await act('resetJuryPassword', { juryId: pwFor.id, password: newPw }, t('contests.jury.passwordChanged', 'Пароль изменён'));
            setSaving(false);
            if (r) { setCreds({ name: pwFor.name, email: pwFor.email, password: newPw }); setPwFor(null); }
          }} />}>
        <div className="flex gap-2">
          <input value={newPw} onChange={(e) => setNewPw(e.target.value)} className={`${inputCls} font-mono`} />
          <button onClick={() => setNewPw(genPassword())} className={ghostBtn} aria-label={t('contests.jury.generate', 'Сгенерировать')}><RefreshCw className="w-4 h-4" /></button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingRemove}
        title={t('contests.jury.removeTitle', 'Убрать {{name}} из жюри?', { name: pendingRemove?.name })}
        message={t('contests.jury.removeMsg', 'Если этот член жюри уже выставлял оценки, убрать его нельзя. Отдельная учётка жюри, больше нигде не используемая, будет отключена.')}
        confirmLabel={t('contests.remove', 'Убрать')} danger
        onConfirm={async () => { if (pendingRemove) await act('removeJury', { juryId: pendingRemove.id }, t('contests.jury.removed', 'Убран из жюри')); setPendingRemove(null); }}
        onClose={() => setPendingRemove(null)}
      />
    </div>
  );
};

export default JuryTab;
