import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetDemoRequests, adminUpdateDemoRequest, adminDeleteDemoRequest } from '../../lib/api';
import { Inbox, Send, CalendarCheck2, CheckCircle2, XCircle, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

type Status = 'new' | 'contacted' | 'scheduled' | 'done' | 'rejected';

interface DemoRequest {
  id: string;
  orgName: string;
  ownerName: string;
  telegramDisplay: string;
  telegramUrl: string | null;
  note?: string;
  adminNote?: string;
  status: Status;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_META: Record<Status, { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  new: { label: 'Новая', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: Inbox },
  contacted: { label: 'Связались', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: Send },
  scheduled: { label: 'Демо назначено', bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', icon: CalendarCheck2 },
  done: { label: 'Закрыта', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  rejected: { label: 'Отклонена', bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', icon: XCircle },
};
const STATUS_ORDER: Status[] = ['new', 'contacted', 'scheduled', 'done', 'rejected'];

const AdminDemoRequestsPage: React.FC = () => {
  const { t } = useTranslation();
  const statusLabel = (s: Status) => t(`admin.demo.status.${s}`, STATUS_META[s].label);
  const [items, setItems] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetDemoRequests(statusFilter === 'all' ? undefined : statusFilter);
      setItems(res.items || []);
    } catch (e: any) {
      toast.error(e?.message || t('admin.demo.loadFailed', 'Не удалось загрузить заявки'));
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: Status) => {
    setBusyId(id);
    try {
      await adminUpdateDemoRequest({ id, status });
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    } catch (e: any) {
      toast.error(e?.message || t('admin.demo.updateFailed', 'Не удалось обновить статус'));
    } finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    if (!confirm(t('admin.demo.confirmDelete', 'Удалить заявку безвозвратно?'))) return;
    setBusyId(id);
    try {
      await adminDeleteDemoRequest(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (e: any) {
      toast.error(e?.message || t('admin.demo.deleteFailed', 'Не удалось удалить'));
    } finally { setBusyId(null); }
  };

  const counts = STATUS_ORDER.reduce<Record<Status, number>>((acc, s) => {
    acc[s] = items.filter((it) => it.status === s).length;
    return acc;
  }, { new: 0, contacted: 0, scheduled: 0, done: 0, rejected: 0 });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('admin.demo.title', 'Заявки на демо')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs">
          {t('admin.demo.subtitle', 'Заявки с лендинга от владельцев учебных центров.')}
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`h-7 px-2 rounded-md text-sm transition-colors ${
            statusFilter === 'all'
              ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {t('common.all', 'Все')} · {items.length}
        </button>
        {STATUS_ORDER.map((s) => {
          const meta = STATUS_META[s];
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`h-7 px-2 rounded-md text-sm transition-colors ${
                active
                  ? `${meta.bg} ${meta.text} font-medium`
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {statusLabel(s)} · {counts[s]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-16 text-center text-slate-400 dark:text-slate-500">
          <Inbox className="w-6 h-6 mx-auto mb-2 text-slate-400" />
          <p>{t('admin.demo.empty', 'Заявок нет')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((it) => {
            const meta = STATUS_META[it.status] || STATUS_META.new;
            const Icon = meta.icon;
            return (
              <div key={it.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{it.orgName}</h3>
                      <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs font-medium gap-1 ${meta.bg} ${meta.text}`}>
                        <Icon className="w-3 h-3" /> {statusLabel(STATUS_META[it.status] ? it.status : 'new')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {it.ownerName} · {new Date(it.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {it.telegramUrl ? (
                      <a href={it.telegramUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5" /> {it.telegramDisplay}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    ) : (
                      <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-mono">{it.telegramDisplay}</span>
                    )}
                  </div>
                </div>

                {it.note && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 whitespace-pre-wrap bg-slate-50 dark:bg-slate-700/40 rounded-md p-2.5 border border-slate-200 dark:border-slate-700">{it.note}</p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={it.status}
                    onChange={(e) => setStatus(it.id, e.target.value as Status)}
                    disabled={busyId === it.id}
                    className="input"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{statusLabel(s)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => remove(it.id)}
                    disabled={busyId === it.id}
                    className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t('common.delete', 'Удалить')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminDemoRequestsPage;
