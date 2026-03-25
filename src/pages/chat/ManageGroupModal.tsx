import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, ShieldAlert, Shield } from 'lucide-react';
import { apiGetOrgMembers, apiUpdateChatParticipants } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import type { ChatRoom } from '../../types';

interface ManageGroupModalProps {
  room: ChatRoom;
  onClose: () => void;
}

export default function ManageGroupModal({ room, onClose }: ManageGroupModalProps) {
  const { t } = useTranslation();
  const { profile, organizationId } = useAuth();
  
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSysAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  useEffect(() => {
    if (!organizationId) return;
    apiGetOrgMembers(organizationId, 'active')
      .then(res => {
        setMembers(res);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [organizationId]);

  const handleRemove = async (uid: string) => {
    if (!window.confirm(t('chat.confirmRemoveParticipant', 'Удалить участника из группы?'))) return;
    
    setSubmitting(true);
    setError(null);
    try {
      await apiUpdateChatParticipants(room.id, [], [uid]);
      // optimistic state is somewhat handled if useChatRooms re-fetches or we just wait for snapshot.
      // We don't need to close Modal, snapshot will update `room`.
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const currentParticipantIds = room.participantIds;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('chat.manageParticipants', 'Участники')}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 rounded-xl mb-4 text-sm flex gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* User List */}
          <div className="space-y-2">
            {loading ? (
              <div className="flex justify-center p-4"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>
            ) : (
              members.filter(m => currentParticipantIds.includes(m.userId)).map(m => {
                const partInfo = room.participants[m.userId];
                const isRoomAdmin = partInfo?.role === 'admin';
                const isRemoved = partInfo?.isRemoved;
                const isMe = m.userId === profile?.uid;

                return (
                  <div
                    key={m.userId}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 transition-all ${isRemoved ? 'opacity-50' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-white truncate flex items-center gap-2">
                        {m.userDisplayName || m.userEmail}
                        {isMe && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Вы</span>}
                        {isRoomAdmin && <div title="Admin"><Shield className="w-3.5 h-3.5 text-primary-500" /></div>}
                      </div>
                      <div className="text-xs text-slate-500 capitalize">
                        {isRemoved ? t('chat.removed', 'Удален') : partInfo?.role || m.role}
                      </div>
                    </div>
                    
                    {!isMe && !isRemoved && (isSysAdmin || (!isRoomAdmin)) && (
                      <button
                        onClick={() => handleRemove(m.userId)}
                        disabled={submitting}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title={t('chat.removeParticipant', 'Удалить участника')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
