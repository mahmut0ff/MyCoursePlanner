import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('invites.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('invites.subtitle')}</p>
        </div>
        <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">{error}</div>}
      {success && <div className="mb-4 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
        </div>
      ) : invites.length === 0 ? (
        <div className="text-center py-20">
          <Inbox className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t('invites.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <div key={invite.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary-200/50 dark:shadow-primary-900/30">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{invite.organizationName || t('invites.unknownOrg')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('invites.invitedBy')}: {invite.invitedByName || invite.invitedBy}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] px-2 py-0.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full font-medium capitalize">{invite.role}</span>
                    <span className="text-[10px] text-slate-400">{new Date(invite.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAccept(invite.id)}
                    disabled={processingId === invite.id}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {processingId === invite.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    {t('invites.accept')}
                  </button>
                  <button
                    onClick={() => handleDecline(invite.id)}
                    disabled={processingId === invite.id}
                    className="bg-slate-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/20 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
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
