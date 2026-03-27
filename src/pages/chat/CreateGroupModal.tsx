import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Users, ShieldAlert, Check } from 'lucide-react';
import { apiGetOrgMembers, apiCreateChatRoom } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

export default function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const { t } = useTranslation();
  const { profile, organizationId } = useAuth();
  
  const [type, setType] = useState<'direct' | 'group'>('direct');
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    apiGetOrgMembers(organizationId, 'active')
      .then(res => {
        // Exclude self from the list
        setMembers(res.filter((m: any) => m.userId !== profile?.uid));
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [profile, organizationId]);

  const toggleUser = (uid: string) => {
    const next = new Set(selectedIds);
    if (type === 'direct') {
      next.clear();
      next.add(uid);
    } else {
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
    }
    setSelectedIds(next);
  };

  const handleCreate = async () => {
    if (selectedIds.size === 0) return;
    if (type === 'group' && !title.trim()) return setError(t('chat.groupNameRequired', 'Укажите название группы'));

    setSubmitting(true);
    setError(null);

    const participantIds = [profile!.uid, ...Array.from(selectedIds)];

    try {
      const res = await apiCreateChatRoom({
        type,
        title: type === 'group' ? title : '',
        participantIds
      });
      onCreated(res.id);
      onClose();
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const filteredMembers = members.filter(m => 
    m.userEmail?.toLowerCase().includes(search.toLowerCase()) || 
    m.userDisplayName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl flex flex-col max-h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('chat.newConversation', 'Новый чат')}
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

          {/* Type Toggle */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
            <button
              onClick={() => { setType('direct'); setSelectedIds(new Set()); }}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                type === 'direct' 
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t('chat.personalMessage', 'Личное')}
            </button>
            <button
              onClick={() => { setType('group'); setSelectedIds(new Set()); }}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                type === 'group' 
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t('chat.groupMessage', 'Группа')}
            </button>
          </div>

          {type === 'group' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('chat.groupName', 'Название группы')}
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('chat.groupNamePlaceholder', 'Например: Подготовка к IELTS')}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}

          {/* User Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('chat.searchUsers', 'Поиск пользователей...')}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* User List */}
          <div className="h-64 overflow-y-auto pr-2 space-y-2">
            {loading ? (
              <div className="flex justify-center p-4"><div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" /></div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                {t('chat.noUsersFound', 'Никого не найдено')}
              </div>
            ) : (
              filteredMembers.map(m => {
                const isSelected = selectedIds.has(m.userId);
                return (
                  <button
                    key={m.userId}
                    onClick={() => toggleUser(m.userId)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      isSelected 
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' 
                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {m.userAvatarUrl ? (
                        <img src={m.userAvatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-slate-500">{m.userDisplayName?.[0]?.toUpperCase() || <Users className="w-5 h-5 text-slate-500" />}</span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                        {m.userDisplayName || m.userEmail}
                      </div>
                      <div className="text-xs text-slate-500 capitalize">
                        {m.role}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      isSelected 
                        ? 'bg-primary-500 border-primary-500 text-white' 
                        : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl flex justify-between items-center">
          <div className="text-sm text-slate-500">
            {selectedIds.size > 0 && t('chat.usersSelected', '{{count}} выбрано', { count: selectedIds.size })}
          </div>
          <button
            onClick={handleCreate}
            disabled={submitting || selectedIds.size === 0 || (type === 'group' && !title.trim())}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-medium shadow-sm shadow-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              t('chat.start', 'Начать')
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
