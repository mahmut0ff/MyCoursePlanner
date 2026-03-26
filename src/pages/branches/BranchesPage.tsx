import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgListBranches, orgCreateBranch, orgUpdateBranch, orgArchiveBranch } from '../../lib/api';
import type { Branch } from '../../types';
import { Building2, Plus, MapPin, Phone, Pencil, Archive, Check, X, Loader2, MessageCircle, User } from 'lucide-react';
import toast from 'react-hot-toast';

const BranchesPage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary-500 rounded-full animate-spin border-t-transparent" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('nav.branches', 'Филиалы')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('branches.subtitle', 'Управление филиалами и локациями')}
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('branches.add', 'Добавить филиал')}
          </button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
            {editingId ? t('branches.edit', 'Редактировать филиал') : t('branches.new', 'Новый филиал')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('branches.name', 'Название')} *</label>
              <input
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-primary-500"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Центральный филиал"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('branches.slug', 'Slug (URL)')}</label>
              <input
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-primary-500"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="central"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('branches.city', 'Город')}</label>
              <input
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-primary-500"
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('branches.phone', 'Телефон')}</label>
              <input
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-primary-500"
                value={form.phone || ''}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+996..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('branches.whatsapp', 'WhatsApp (номер)')}</label>
              <input
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-green-500"
                value={form.whatsapp || ''}
                onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                placeholder="Например, +996700123456"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('branches.contactName', 'Имя контактного лица (Менеджер)')}</label>
              <input
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-primary-500"
                value={form.contactName || ''}
                onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                placeholder="Менеджер Айгерим"
              />
            </div>
            <div className="md:col-span-2">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" /> Google Maps Координаты
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Широта (Latitude)</label>
                    <input
                      type="number" step="any"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:border-primary-500"
                      value={form.latitude !== undefined ? form.latitude : ''}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="42.8746"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Долгота (Longitude)</label>
                    <input
                      type="number" step="any"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:border-primary-500"
                      value={form.longitude !== undefined ? form.longitude : ''}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="74.5698"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('branches.address', 'Адрес')}</label>
              <input
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-primary-500"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{t('branches.description', 'Описание')}</label>
              <textarea
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-primary-500 resize-none"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t('common.save', 'Сохранить')}
            </button>
            <button onClick={resetForm} className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-sm font-medium transition-colors">
              <X className="w-4 h-4" />{t('common.cancel', 'Отмена')}
            </button>
          </div>
        </div>
      )}

      {/* Branches List */}
      {branches.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{t('branches.empty', 'Нет филиалов')}</h2>
          <p className="text-slate-500 text-sm">{t('branches.emptyDesc', 'Создайте первый филиал для управления локациями')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {branches.map(branch => (
            <div key={branch.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg">
                    {branch.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{branch.name}</h3>
                    <p className="text-xs text-slate-400">/{branch.slug}</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(branch)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                      <Pencil className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button onClick={() => handleArchive(branch.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Archive className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
              {(branch.city || branch.address) && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                  <MapPin className="w-3 h-3" />
                  <span>{[branch.city, branch.address].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {branch.contactName && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                  <User className="w-3 h-3" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">{branch.contactName}</span>
                </div>
              )}
              {branch.phone && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                  <Phone className="w-3 h-3" />
                  <span>{branch.phone}</span>
                </div>
              )}
              {branch.whatsapp && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <MessageCircle className="w-3 h-3 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">{branch.whatsapp}</span>
                </div>
              )}
              {branch.latitude && branch.longitude && (
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded w-fit border border-slate-100 dark:border-slate-800">
                  <MapPin className="w-3 h-3" />
                  <span>{branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}</span>
                </div>
              )}
              {branch.description && (
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">{branch.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BranchesPage;
