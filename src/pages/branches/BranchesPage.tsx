import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useBranch } from '../../contexts/BranchContext';
import { orgListBranches, orgCreateBranch, orgUpdateBranch, orgArchiveBranch } from '../../lib/api';
import type { Branch } from '../../types';
import { Building2, Plus, MapPin, Phone, Pencil, Archive, Check, Loader2, MessageCircle, User, Search, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

const BranchesPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { canWrite } = usePermissions();
  // Сайдбар-переключатель держит свой список филиалов — без обновления новый филиал в нём не виден до перезагрузки.
  const { refreshBranches } = useBranch();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<Partial<Branch>>({
    name: '', slug: '', city: '', address: '', phone: '', whatsapp: '', contactName: '', description: '', latitude: undefined, longitude: undefined
  });

  // Managers granted the "branches" permission can manage branches too — mirror the
  // backend, which gates every branch mutation on the same branches grant (not role).
  const isAdmin = role === 'admin' || role === 'super_admin' || canWrite('branches');

  const loadBranches = useCallback(async () => {
    try {
      const data = await orgListBranches();
      setBranches(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  const resetForm = () => {
    setForm({ name: '', slug: '', city: '', address: '', phone: '', whatsapp: '', contactName: '', description: '', latitude: undefined, longitude: undefined });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error(t('branches.nameRequired', 'Введите название филиала')); return; }
    setSaving(true);
    try {
      if (editingId) {
        await orgUpdateBranch({ id: editingId, ...form });
        toast.success(t('branches.updated', 'Филиал обновлён'));
      } else {
        await orgCreateBranch(form);
        toast.success(t('branches.created', 'Филиал создан'));
      }
      resetForm();
      loadBranches();
      refreshBranches();
    } catch (e: any) {
      toast.error(e.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm(t('branches.archiveConfirm', 'Архивировать филиал?'))) return;
    try {
      await orgArchiveBranch(id);
      toast.success(t('branches.archived', 'Филиал архивирован'));
      loadBranches();
      refreshBranches();
    } catch (e: any) {
      toast.error(e.message || t('common.error'));
    }
  };

  const startEdit = (branch: Branch) => {
    setForm({
      name: branch.name,
      slug: branch.slug,
      city: branch.city || '',
      address: branch.address || '',
      phone: branch.phone || '',
      whatsapp: branch.whatsapp || '',
      contactName: branch.contactName || '',
      description: branch.description || '',
      latitude: branch.latitude,
      longitude: branch.longitude,
    });
    setEditingId(branch.id);
    setShowForm(true);
  };

  const filtered = branches.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.city || '').toLowerCase().includes(q) ||
      (b.address || '').toLowerCase().includes(q) ||
      (b.contactName || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div className="pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('nav.branches', 'Филиалы')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">{t('branches.totalCount', '{{count}} всего', { count: branches.length })}</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={loadBranches} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {isAdmin && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="btn-primary flex-1 sm:flex-none inline-flex justify-center items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('branches.add', 'Добавить филиал')}
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 relative md:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${t('common.search')}...`}
            className="input pl-8"
          />
        </div>
      </div>

      {/* Branches List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? t('branches.notFound', 'Филиалы не найдены') : t('branches.empty', 'Нет филиалов')}
          description={search ? t('common.trySearch', 'Попробуйте изменить поисковый запрос') : t('branches.emptyDesc', 'Создайте первый филиал для управления локациями')}
          actionLabel={isAdmin ? t('branches.add', 'Добавить филиал') : undefined}
          onAction={isAdmin ? () => { resetForm(); setShowForm(true); } : undefined}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_140px_80px] gap-3 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t('branches.name', 'Филиал')}</span>
            <span>{t('branches.address', 'Адрес')}</span>
            <span>{t('branches.contactName', 'Контакт')}</span>
            <span>{t('branches.phone', 'Телефон')}</span>
            <span></span>
          </div>

          {filtered.map((branch) => (
            <div
              key={branch.id}
              className="group flex flex-col md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)_140px_80px] gap-2 md:gap-3 items-center min-h-[40px] px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {/* Name + city */}
              <div className="flex items-center gap-3 min-w-0 w-full">
                <div className="w-7 h-7 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-xs text-slate-700 font-semibold shrink-0 dark:text-slate-200">
                  {branch.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{branch.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {branch.city && (
                      <span className="text-xs text-slate-400 flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" /> {branch.city}
                      </span>
                    )}
                    {branch.slug && (
                      <span className="text-xs text-slate-300 dark:text-slate-600">/{branch.slug}</span>
                    )}
                  </div>
                  {/* Mobile meta */}
                  <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                    {branch.address && <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{branch.address}</span>}
                    {branch.phone && <span className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{branch.phone}</span>}
                    {branch.contactName && <span className="text-xs text-slate-400 flex items-center gap-1"><User className="w-3 h-3" />{branch.contactName}</span>}
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="hidden md:flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {branch.address ? (
                  <span className="truncate">{branch.address}</span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </div>

              {/* Contact */}
              <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {branch.contactName ? (
                  <><User className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="truncate">{branch.contactName}</span></>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </div>

              {/* Phone */}
              <div className="hidden md:flex flex-col gap-0.5 text-xs text-slate-500 dark:text-slate-400">
                {branch.phone ? (
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" />{branch.phone}</span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
                {branch.whatsapp && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><MessageCircle className="w-3 h-3" />{branch.whatsapp}</span>
                )}
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className="hidden md:flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => startEdit(branch)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={t('common.edit', 'Редактировать')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleArchive(branch.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={t('branches.archive', 'Архивировать')}
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={resetForm}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-lg shadow-pop max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              {editingId ? t('branches.edit', 'Редактировать филиал') : t('branches.new', 'Новый филиал')}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {editingId ? t('branches.editDesc', 'Обновите данные филиала') : t('branches.newDesc', 'Заполните данные нового филиала')}
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('branches.name', 'Название')} *</label>
                  <div className="relative">
                    <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      className="input pl-8"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={t('branches.namePh', 'Центральный филиал')}
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className="label">{t('branches.slug', 'Slug (URL)')}</label>
                  <input
                    className="input"
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="central"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('branches.city', 'Город')}</label>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      className="input pl-8"
                      value={form.city}
                      onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      placeholder={t('branches.cityPh', 'Ош')}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">{t('branches.phone', 'Телефон')}</label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      className="input pl-8"
                      value={form.phone || ''}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+996..."
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('branches.whatsapp', 'WhatsApp')}</label>
                  <div className="relative">
                    <MessageCircle className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      className="input pl-8"
                      value={form.whatsapp || ''}
                      onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                      placeholder="+996700123456"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">{t('branches.contactName', 'Контактное лицо')}</label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      className="input pl-8"
                      value={form.contactName || ''}
                      onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                      placeholder={t('branches.contactPh', 'Менеджер Айгерим')}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="label">{t('branches.address', 'Адрес')}</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder={t('branches.addressPh', 'ул. Примерная, 123')}
                />
              </div>

              {/* Coordinates */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" /> {t('branches.coords', 'Координаты Google Maps')}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('branches.latitude', 'Широта')}</label>
                    <input
                      type="number" step="any"
                      className="input"
                      value={form.latitude !== undefined ? form.latitude : ''}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="42.8746"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('branches.longitude', 'Долгота')}</label>
                    <input
                      type="number" step="any"
                      className="input"
                      value={form.longitude !== undefined ? form.longitude : ''}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="74.5698"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="label">{t('branches.description', 'Описание')}</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={resetForm}
                className="btn-ghost"
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('common.save', 'Сохранить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchesPage;
