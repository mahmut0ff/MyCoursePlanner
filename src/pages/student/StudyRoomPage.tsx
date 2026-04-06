import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { 
  subscribeToStudyRoom, joinStudyRoom, leaveStudyRoom, 
  updateStudyRoomTimer, updateStudyRoomSettings, toggleStudyRoomTimerPause, kickParticipant,
  sendStudyRoomMessage, subscribeToStudyRoomMessages
} from '../../services/study-rooms.service';
import type { StudyRoom, StudyParticipant, StudyRoomMessage } from '../../types';
import YoutubeAudioPlayer from '../../components/common/YoutubeAudioPlayer';
import { PinnedBadgesDisplay } from '../../lib/badges';
import { ArrowLeft, User, Focus, BookOpen, Play, Square, Settings, X, Pause, MessageSquare, Send } from 'lucide-react';
import toast from 'react-hot-toast';

const StudyRoomPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [participants, setParticipants] = useState<StudyParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasJoined, setHasJoined] = useState(false);
  const [myGoal, setMyGoal] = useState('Фокус');
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  // Custom timer and Settings
  const [customMins, setCustomMins] = useState<string>('25');
  const [showSettings, setShowSettings] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const notifiedRef = useRef(false);

  // Chat
  const [messages, setMessages] = useState<StudyRoomMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || !profile) return;

    const unsub = subscribeToStudyRoom(id, (r, p) => {
      if (!r) {
        toast.error('Комната закрыта или не существует');
        navigate('/study-rooms');
        return;
      }
      setRoom(r);
      setParticipants(p);
      setLoading(false);
    });

    return () => unsub();
  }, [id, profile, navigate]);

  useEffect(() => {
    if (!id) return;
    const unsubMsgs = subscribeToStudyRoomMessages(id, (msgs) => {
      setMessages(msgs);
    });
    return () => unsubMsgs();
  }, [id]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (!id || !profile || loading || hasJoined) return;

    const join = async () => {
      try {
        await joinStudyRoom(id, {
          userId: profile.uid,
          name: profile.displayName || 'Студент',
          avatarUrl: profile.avatarUrl,
          badges: profile.pinnedBadges || [],
          goal: myGoal,
          status: 'focus'
        });
        setHasJoined(true);
      } catch (e) {
        console.error(e);
      }
    };
    join();

    return () => {
      if (hasJoined) {
        leaveStudyRoom(id, profile.uid).catch(console.error);
      }
    };
  }, [id, profile, loading, hasJoined]);

  // Pomodoro Timer Logic
  useEffect(() => {
    if (room?.isTimerPaused) {
      setTimeLeft(room.timerTimeLeft || 0);
      return;
    }
    if (!room?.timerEndsAt) {
      setTimeLeft(0);
      notifiedRef.current = false;
      return;
    }
    const end = new Date(room.timerEndsAt).getTime();
    
    // Initial sync
    setTimeLeft(Math.max(0, end - Date.now()));
    
    // Reset notification if timer is far from ending
    if (end - Date.now() > 2000) {
      notifiedRef.current = false;
    }

    const timer = setInterval(() => {
      const diff = end - Date.now();
      if (diff > 0) {
        setTimeLeft(diff);
      } else {
        setTimeLeft(0);
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          toast.success("Таймер завершен!", { icon: '🔔', duration: 5000 });
          new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(()=> {});
        }
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [room?.timerEndsAt, room?.isTimerPaused, room?.timerTimeLeft]);

  const formatTime = (ms: number) => {
    if (ms <= 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const updateGoal = (newGoal: string) => {
    setMyGoal(newGoal);
    if (id && profile) {
      joinStudyRoom(id, {
          userId: profile.uid,
          name: profile.displayName || 'Студент',
          avatarUrl: profile.avatarUrl,
          badges: profile.pinnedBadges || [],
          goal: newGoal,
          status: 'focus'
      });
    }
  };

  const handleExit = () => {
    if (id && profile) {
      leaveStudyRoom(id, profile.uid);
    }
    navigate('/study-rooms');
  };

  const handleTimer = async (state: 'focus' | 'break' | 'idle', mins: number) => {
    try {
      if (id) await updateStudyRoomTimer(id, state, mins);
    } catch (e: any) {
      toast.error(e.message || 'Ошибка таймера');
    }
  };

  const handleCustomStart = () => {
    const m = parseInt(customMins, 10);
    if (isNaN(m) || m <= 0 || m > 180) {
      toast.error('Введите корректное время (от 1 до 180 мин)');
      return;
    }
    handleTimer('focus', m);
  };
  
  const togglePause = async () => {
    if (!id || !room) return;
    try {
      await toggleStudyRoomTimerPause(id, room);
    } catch(e: any) {
      toast.error(e.message || 'Ошибка паузы');
    }
  };

  const handleKick = async (userId: string) => {
    if (!id) return;
    if (window.confirm("Исключить участника из комнаты?")) {
      await kickParticipant(id, userId);
      toast.success("Участник исключен");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !profile || !chatInput.trim()) return;
    try {
      const text = chatInput.trim();
      setChatInput(''); // clear optimistically
      await sendStudyRoomMessage(id, {
        senderId: profile.uid,
        senderName: profile.displayName || 'Студент',
        senderAvatar: profile.avatarUrl,
        text
      });
    } catch (err: any) {
      toast.error('Ошибка отправки сообщения');
      setChatInput(chatInput); // restore on error
    }
  };

  const openSettings = () => {
    if (room) {
      setEditTitle(room.title);
      setEditUrl(room.youtubeUrl || '');
      setShowSettings(true);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!editTitle.trim()) {
      toast.error('Пустое название');
      return;
    }
    try {
      await updateStudyRoomSettings(id, editTitle.trim(), editUrl.trim());
      setShowSettings(false);
      toast.success('Настройки обновлены');
    } catch (err: any) {
      toast.error(err.message || 'Ошибка');
    }
  };

  if (loading || !room) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-[#0f172a]">
        <div className="w-8 h-8 border-2 border-slate-300 dark:border-slate-700 border-t-slate-900 dark:border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const isCreator = profile?.uid === room.creatorId;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-[#0f172a] p-2 sm:p-4 lg:p-8 flex flex-col pt-[70px] lg:pt-8 w-full max-w-[100vw] overflow-x-hidden transition-colors">
      
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-3 w-full">
          <button 
            onClick={handleExit}
            className="p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate pr-2">{room.title}</h1>
            {isCreator && (
              <button onClick={openSettings} className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors" title="Настройки комнаты">
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
          <button 
            onClick={handleExit}
            className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 hidden sm:block"
          >
            Выйти
          </button>
        </div>
      </div>

      {/* Main Grid Layout for Responsiveness */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
        
        {/* LEFT COLUMN: Participants */}
        <div className="lg:col-span-8 order-2 lg:order-1 w-full flex flex-col gap-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Focus className="w-5 h-5" /> 
                В комнате ({participants.length})
              </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {participants.map((p) => {
                const isMe = p.userId === profile?.uid;
                return (
                  <div key={p.userId} className={`bg-white dark:bg-slate-800 border p-3 flex gap-3 relative group ${isMe ? 'border-slate-800 dark:border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}>
                    {isCreator && !isMe && (
                      <button 
                        onClick={() => handleKick(p.userId)}
                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Выгнать участника"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center overflow-hidden">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center pr-6">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-bold text-slate-900 dark:text-white text-sm truncate flex items-center gap-2">
                          {p.name}
                          {isMe && <span className="text-[10px] uppercase bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-1.5 py-0.5 font-bold">Я</span>}
                        </p>
                        {p.badges && p.badges.length > 0 && (
                          <PinnedBadgesDisplay badges={p.badges} className="scale-75 origin-right" />
                        )}
                      </div>
                      
                      {isMe ? (
                        <input 
                          type="text" 
                          value={myGoal}
                          onChange={(e) => setMyGoal(e.target.value)}
                          onBlur={() => updateGoal(myGoal)}
                          className="w-full mt-1 text-xs border-b border-slate-300 dark:border-slate-600 focus:border-slate-800 dark:focus:border-slate-400 outline-none pb-0.5 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                          placeholder="Ваша цель?"
                          maxLength={50}
                        />
                      ) : (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate">
                          {p.goal || 'Фокус на учебе'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Tools (YouTube + Timer + Chat) */}
        <div className="lg:col-span-4 order-1 lg:order-2 flex flex-col gap-4 w-full">
          
          {/* Pomodoro Timer */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 flex flex-col items-center">
            <h3 className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[10px] mb-2 text-center w-full">
              Pomodoro Timer
            </h3>
            
            <div className={`text-5xl font-bold py-2 tracking-tighter ${room.timerState === 'break' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'} ${room.isTimerPaused ? 'opacity-50' : ''}`}>
              {formatTime(timeLeft)}
            </div>

            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6 capitalize">
              {room.timerState === 'idle' ? 'Ожидание...' : room.timerState === 'focus' ? 'Время Фокуса' : 'Время Отдыха'}
              {room.isTimerPaused && ' (Пауза)'}
            </p>

            {/* Controls (Only Creator) */}
            {isCreator && (
              <div className="flex flex-col gap-3 w-full">
                {room.timerState === 'idle' ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                       <button onClick={() => handleTimer('focus', 25)} className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex justify-center items-center gap-2 py-2 px-3 text-xs font-medium hover:bg-slate-800 dark:hover:bg-white"><Play className="w-3.5 h-3.5 flex-shrink-0" /> Фокус 25m</button>
                       <button onClick={() => handleTimer('focus', 50)} className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex justify-center items-center gap-2 py-2 px-3 text-xs font-medium hover:bg-slate-800 dark:hover:bg-white"><Play className="w-3.5 h-3.5 flex-shrink-0" /> Фокус 50m</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" min="1" max="180" className="w-20 border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white px-2 py-2 text-xs focus:outline-none" value={customMins} onChange={e => setCustomMins(e.target.value)} />
                      <button onClick={handleCustomStart} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white flex justify-center items-center py-2 px-3 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600">Свое время (мин)</button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex gap-2">
                      <button 
                        onClick={togglePause}
                        className="flex-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex justify-center items-center gap-2 py-2 px-3 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                       {room.isTimerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                       {room.isTimerPaused ? 'Продолжить' : 'Пауза'}
                      </button>
                      <button 
                        onClick={() => handleTimer('idle', 0)}
                        className="flex-none bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 px-4 flex justify-center items-center hover:bg-red-100 dark:hover:bg-red-900/50"
                        title="Остановить"
                      >
                        <Square className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                       <button onClick={() => handleTimer('break', 5)} className="border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex justify-center items-center py-2 px-3 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50">Перерыв 5m</button>
                       <button onClick={() => handleTimer('break', 10)} className="border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex justify-center items-center py-2 px-3 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50">Перерыв 10m</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shrink-0">
            <h3 className="font-bold text-slate-900 dark:text-white mb-2 text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> 
              Ваша цель
            </h3>
            <input 
              type="text"
              value={myGoal}
              onChange={(e) => setMyGoal(e.target.value)}
              onBlur={() => updateGoal(myGoal)}
              className="w-full border border-slate-300 dark:border-slate-600 bg-transparent text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:border-slate-800 dark:focus:border-slate-400 placeholder-slate-400 dark:placeholder-slate-500"
              placeholder="Над чем сейчас работаете?"
            />
          </div>

          {/* Chat Integration */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col h-[400px] shrink-0">
             <div className="p-3 border-b border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 shrink-0">
                <MessageSquare className="w-4 h-4" />
                Чат комнаты
             </div>
             
             <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 dark:bg-[#0f172a]/50 flex flex-col">
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 dark:text-slate-500 my-auto">
                    Нет сообщений. Напишите что-нибудь!
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {messages.map(msg => (
                      <div key={msg.id} className={`flex flex-col ${msg.senderId === profile?.uid ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                           <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{msg.senderId === profile?.uid ? 'Вы' : msg.senderName}</span>
                           <span className="text-[9px] text-slate-400 dark:text-slate-600">{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div className={`text-sm px-3 py-1.5 break-words max-w-[90%] ${msg.senderId === profile?.uid ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white'}`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
             </div>

             <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 dark:border-slate-700 shrink-0 flex gap-2">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Сообщение..."
                  maxLength={200}
                  className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none placeholder-slate-400 dark:placeholder-slate-500"
                />
                <button 
                  type="submit" 
                  disabled={!chatInput.trim()}
                  className="text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 disabled:hover:text-slate-400 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
             </form>
          </div>

          {room.youtubeUrl && (
             <div className="w-full shrink-0">
               <YoutubeAudioPlayer youtubeUrl={room.youtubeUrl} />
               <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center uppercase tracking-wider">Фоновое Видео</p>
             </div>
          )}

        </div>

      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-none transition-opacity">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Настройки комнаты</h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={saveSettings} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Название фокуса</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:border-slate-600 dark:focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Фоновая музыка (YouTube)</label>
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:border-slate-600 dark:focus:border-slate-500"
                  />
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Отмена
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudyRoomPage;
