import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgListBranches, orgCreateBranch, orgUpdateBranch, orgArchiveBranch } from '../../lib/api';
import type { Branch } from '../../types';
import { Building2, Plus, MapPin, Phone, Pencil, Archive, Check, Loader2, MessageCircle, User, Search, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

const BranchesPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<Partial<Branch>>({
    name: '', slug: '', city: '', address: '', phone: '', whatsapp: '', contactName: '', description: '', latitude: undefined, longitude: undefined
  });

  const isAdmin = role === 'admin' || role === 'super_admin';

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
    <div className="max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
            {t('nav.branches', 'Филиалы')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{branches.length} всего</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={loadBranches} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          {isAdmin && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-semibold flex justify-center items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0"
            >
              <Plus className="w-4 h-4" />
              {t('branches.add', 'Добавить филиал')}
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${t('common.search')}...`}
            className="input pl-9 w-full bg-slate-50 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary-500/20"
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
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_160px_160px_140px_80px] gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>{t('branches.name', 'Филиал')}</span>
            <span>{t('branches.address', 'Адрес')}</span>
            <span>{t('branches.contactName', 'Контакт')}</span>
            <span>{t('branches.phone', 'Телефон')}</span>
            <span></span>
          </div>

          {filtered.map((branch) => (
            <div
              key={branch.id}
              className="group flex flex-col md:grid md:grid-cols-[1fr_160px_160px_140px_80px] gap-2 md:gap-3 items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors"
            >
              {/* Name + city */}
              <div className="flex items-center gap-3 min-w-0 w-full">
                <div className="w-9 h-9 bg-slate-900 dark:bg-slate-600 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-sm shrink-0">
                  {branch.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{branch.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {branch.city && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" /> {branch.city}
                      </span>
                    )}
                    {branch.slug && (
                      <span className="text-[10px] text-slate-300 dark:text-slate-600">/{branch.slug}</span>
                    )}
                  </div>
                  {/* Mobile meta */}
                  <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
                    {branch.address && <span className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{branch.address}</span>}
                    {branch.phone && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{branch.phone}</span>}
                    {branch.contactName && <span className="text-[10px] text-slate-400 flex items-center gap-1"><User className="w-3 h-3" />{branch.contactName}</span>}
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="hidden md:flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {branch.address ? (
                  <span className="truncate">{branch.address}</span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </div>

              {/* Contact */}
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {branch.contactName ? (
                  <><User className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="truncate">{branch.contactName}</span></>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </div>

              {/* Phone */}
              <div className="hidden md:flex flex-col gap-0.5 text-[11px] text-slate-500 dark:text-slate-400">
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
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                    title={t('common.edit', 'Редактировать')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleArchive(branch.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={resetForm}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              {editingId ? t('branches.edit', 'Редактировать филиал') : t('branches.new', 'Новый филиал')}
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              {editingId ? 'Обновите данные филиала' : 'Заполните данные нового филиала'}
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('branches.name', 'Название')} *</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Центральный филиал"
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('branches.slug', 'Slug (URL)')}</label>
                  <input
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="central"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('branches.city', 'Город')}</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                      value={form.city}
                      onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="Ош"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('branches.phone', 'Телефон')}</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                      value={form.phone || ''}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+996..."
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('branches.whatsapp', 'WhatsApp')}</label>
                  <div className="relative">
                    <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                      value={form.whatsapp || ''}
                      onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                      placeholder="+996700123456"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('branches.contactName', 'Контактное лицо')}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                      value={form.contactName || ''}
                      onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                      placeholder="Менеджер Айгерим"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('branches.address', 'Адрес')}</label>
                <input
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="ул. Примерная, 123"
                />
              </div>

              {/* Coordinates */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" /> Google Maps Координаты
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Широта</label>
                    <input
                      type="number" step="any"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-900 dark:focus:border-white"
                      value={form.latitude !== undefined ? form.latitude : ''}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="42.8746"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Долгота</label>
                    <input
                      type="number" step="any"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-900 dark:focus:border-white"
                      value={form.longitude !== undefined ? form.longitude : ''}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="74.5698"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('branches.description', 'Описание')}</label>
                <textarea
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none resize-none"
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={resetForm}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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
