import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useChatRooms } from '../../lib/useChat';
import ChatRoomList from './ChatRoomList';
import ChatRoomView from './ChatRoomView';
import { MessageSquareText } from 'lucide-react';

export default function ChatWorkspace() {
  const { t } = useTranslation();
  const { profile, organizationId } = useAuth();
  
  const { rooms, loading, error } = useChatRooms(organizationId || undefined);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  if (!profile || !organizationId) return null;

  const activeRoom = activeRoomId ? rooms.find(r => r.id === activeRoomId) : null;

  return (
    <div className="h-full min-h-0 -m-4 sm:-m-6 lg:-m-8 flex bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      
      {/* Left Sidebar: Room List */}
      <div className={`w-full md:w-80 shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col ${activeRoomId ? 'hidden md:flex' : 'flex'}`}>
        <ChatRoomList 
          rooms={rooms} 
          loading={loading} 
          error={error} 
          activeRoomId={activeRoomId} 
          onSelectRoom={setActiveRoomId} 
        />
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900 overflow-hidden ${!activeRoomId ? 'hidden md:flex' : 'flex'}`}>
        {activeRoomId && activeRoom ? (
          <ChatRoomView 
            room={activeRoom} 
            onBack={() => setActiveRoomId(null)} 
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 bg-primary-50 dark:bg-primary-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MessageSquareText className="w-8 h-8 text-primary-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                {t('chat.emptyTitle', 'Внутренний чат')}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                {t('chat.emptyDesc', 'Выберите чат слева или создайте новый для общения с коллегами или студентами.')}
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
