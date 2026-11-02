import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { numericDateLocale } from '../../lib/locale';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetMyInvites, apiAcceptInvite, apiDeclineInvite } from '../../lib/api';
import { CheckCircle, XCircle, Building2, RefreshCw, Inbox, Loader2 } from 'lucide-react';
import type { Invite } from '../../types';

const TeacherInvitesPage: React.FC = () => {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    apiGetMyInvites()
      .then((data: any) => setInvites(data || []))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAccept = async (inviteId: string) => {
    setProcessingId(inviteId);
    setError('');
    try {
      await apiAcceptInvite(inviteId);
      setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      setSuccess(t('invites.accepted'));
      setTimeout(() => setSuccess(''), 3000);
      // Refresh profile to update org context
      await refreshProfile();
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    setProcessingId(inviteId);
    setError('');
    try {
      await apiDeclineInvite(inviteId);
      setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      setSuccess(t('invites.declined'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('invites.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('invites.subtitle')}</p>
        </div>
        <button onClick={load} title={t('common.refresh') || 'Refresh'} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">{error}</div>}
      {success && <div className="mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
        </div>
      ) : invites.length === 0 ? (
        <div className="text-center py-20">
          <Inbox className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">{t('invites.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <div key={invite.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-md flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{invite.organizationName || t('invites.unknownOrg')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('invites.invitedBy')}: {invite.invitedByName || invite.invitedBy}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 capitalize">{invite.role}</span>
                    <span className="text-xs text-slate-400">{new Date(invite.createdAt).toLocaleDateString(numericDateLocale())}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAccept(invite.id)}
                    disabled={processingId === invite.id}
                    className="btn-primary inline-flex items-center gap-1.5"
                  >
                    {processingId === invite.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    {t('invites.accept')}
                  </button>
                  <button
                    onClick={() => handleDecline(invite.id)}
                    disabled={processingId === invite.id}
                    className="btn-secondary inline-flex items-center gap-1.5 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {t('invites.decline')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherInvitesPage;
