import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToStudyRoom, joinStudyRoom, leaveStudyRoom, updateStudyRoomTimer } from '../../services/study-rooms.service';
import type { StudyRoom, StudyParticipant } from '../../types';
import YoutubeAudioPlayer from '../../components/common/YoutubeAudioPlayer';
import { PinnedBadgesDisplay } from '../../lib/badges';
import { ArrowLeft, User, Focus, BookOpen, Coffee, Play, Square } from 'lucide-react';
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
    if (!room?.timerEndsAt) {
      setTimeLeft(0);
      return;
    }
    const end = new Date(room.timerEndsAt).getTime();
    
    // Initial sync
    setTimeLeft(Math.max(0, end - Date.now()));

    const timer = setInterval(() => {
      const diff = end - Date.now();
      if (diff > 0) {
        setTimeLeft(diff);
      } else {
        setTimeLeft(0);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [room?.timerEndsAt]);

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
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate pr-2">{room.title}</h1>
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
        <div className="lg:col-span-8 order-2 lg:order-1 w-full">
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
                <div key={p.userId} className={`bg-white dark:bg-slate-800 border p-3 flex gap-3 ${isMe ? 'border-slate-800 dark:border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center overflow-hidden">
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
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

        {/* RIGHT COLUMN: Tools (YouTube + Timer) */}
        <div className="lg:col-span-4 order-1 lg:order-2 flex flex-col gap-4 w-full">
          
          {/* Pomodoro Timer */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 flex flex-col items-center">
            <h3 className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[10px] mb-2 text-center w-full">
              Pomodoro Timer
            </h3>
            
            <div className={`text-5xl font-bold py-2 tracking-tighter ${room.timerState === 'break' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
              {formatTime(timeLeft)}
            </div>

            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6 capitalize">
              {room.timerState === 'idle' ? 'Ожидание...' : room.timerState === 'focus' ? 'Время Фокуса' : 'Время Отдыха'}
            </p>

            {/* Controls (Only Creator) */}
            {isCreator && (
              <div className="flex gap-2 w-full justify-center">
                {room.timerState === 'idle' ? (
                  <button 
                    onClick={() => handleTimer('focus', 25)}
                    className="flex-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex justify-center items-center gap-2 py-2 px-3 text-xs font-medium hover:bg-slate-800 dark:hover:bg-white"
                  >
                    <Play className="w-3.5 h-3.5 flex-shrink-0" /> 25 м. Фокус
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => handleTimer('break', 5)}
                      className="flex-1 border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex justify-center items-center gap-2 py-2 px-3 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50"
                    >
                      <Coffee className="w-3.5 h-3.5 flex-shrink-0" /> Отдых (5 м.)
                    </button>
                    <button 
                      onClick={() => handleTimer('idle', 0)}
                      className="flex-none bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 flex justify-center items-center hover:bg-slate-200 dark:hover:bg-slate-600"
                      title="Стоп"
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
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

          {room.youtubeUrl && (
             <div className="w-full">
               <YoutubeAudioPlayer youtubeUrl={room.youtubeUrl} />
               <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center uppercase tracking-wider">Фоновое Видео</p>
             </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default StudyRoomPage;
