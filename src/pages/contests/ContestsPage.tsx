import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Trophy, CalendarDays, MapPin, Layers } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { usePermissions } from '../../contexts/PermissionsContext';
import { apiContestCreate, apiContestsList } from '../../lib/api';
import { CONTEST_KIND_LABELS, formatContestDate as formatDate, type Contest } from '../../lib/contests';
import ContestMetaFields from './ContestMetaFields';
import { emptyMetaForm as emptyForm } from './contestForm';
import { formatMoney } from '../../lib/money';
import { Modal, ModalFooter, ErrorNote, StatusBadge } from './ui';
import { primaryBtn, cardCls, errMessage } from './uiStyles';


const ContestsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const canEdit = canWrite('contests');
  const [list, setList] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setList(await apiContestsList()); } catch (e) { setError(errMessage(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setSaving(true); setFormError('');
    try {
      const c = await apiContestCreate({ ...form, prizeFund: Number(form.prizeFund) || 0 });
      toast.success(t('contests.created', 'Конкурс создан'));
      navigate(`/contests/${c.id}?tab=categories`);
    } catch (e) { setFormError(errMessage(e)); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary-500" />{t('nav.contests', 'Конкурсы')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('contests.subtitle', 'Олимпиады, конкурсы проектов и соревнования с электронным оцениванием жюри')}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => { setForm(emptyForm); setFormError(''); setOpen(true); }} className={primaryBtn}>
            <Plus className="w-4 h-4" />{t('contests.create', 'Новый конкурс')}
          </button>
        )}
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
        </div>
      ) : !list.length ? (
        <EmptyState
          icon={Trophy}
          title={t('contests.emptyTitle', 'Конкурсов пока нет')}
          description={t('contests.emptyDesc', 'Создайте олимпиаду или конкурс: категории, критерии, участники и жюри настраиваются внутри.')}
          actionLabel={canEdit ? t('contests.create', 'Новый конкурс') : undefined}
          onAction={canEdit ? () => setOpen(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((c) => (
            <Link key={c.id} to={`/contests/${c.id}`} className={`${cardCls} p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors block`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{CONTEST_KIND_LABELS[c.kind]}{c.season ? ` · ${c.season}` : ''}</span>
                <StatusBadge status={c.status} />
              </div>
              <h2 className="font-bold text-slate-900 dark:text-white leading-snug">{c.title}</h2>
              {c.theme && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{c.theme}</p>}
              <div className="mt-4 space-y-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                {c.eventDate && <div className="flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5" />{formatDate(c.eventDate)}</div>}
                {c.venue && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /><span className="truncate">{c.venue}</span></div>}
                <div className="flex items-center gap-2"><Layers className="w-3.5 h-3.5" />
                  {c.categories.length ? c.categories.map((x) => x.code).join(' · ') : t('contests.noCategories', 'Категории не заданы')}
                  {c.prizeFund > 0 && <span className="ml-auto font-semibold text-slate-700 dark:text-slate-200">{formatMoney(c.prizeFund)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={t('contests.create', 'Новый конкурс')}
        onClose={() => setOpen(false)}
        wide
        footer={<ModalFooter onCancel={() => setOpen(false)} onSave={create} saving={saving} disabled={!form.title.trim()} saveLabel={t('contests.createBtn', 'Создать')} />}
      >
        <ContestMetaFields form={form} setForm={setForm} />
        {formError && <ErrorNote>{formError}</ErrorNote>}
      </Modal>
    </div>
  );
};

export default ContestsPage;
