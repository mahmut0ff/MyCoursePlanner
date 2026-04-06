import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getStudyRooms, createStudyRoom } from '../../services/study-rooms.service';
import type { StudyRoom } from '../../types';
import { Headphones, Plus, Users, Search, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const StudyRoomListPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const data = await getStudyRooms();
      setRooms(data);
    } catch (err: any) {
      toast.error(err.message || 'Ошибка загрузки комнат');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!newTitle.trim()) {
      toast.error('Введите название комнаты');
      return;
    }

    try {
      const id = await createStudyRoom({
        title: newTitle.trim(),
        youtubeUrl: newUrl.trim(),
        creatorId: profile.uid,
        creatorName: profile.displayName || 'Студент',
      });
      setShowModal(false);
      navigate(`/study-rooms/${id}`);
    } catch (err: any) {
      toast.error(err.message || 'Ошибка при создании комнаты');
    }
  };

  const filtered = rooms.filter(r => r.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white border-l-4 border-slate-900 dark:border-white pl-3">
            Co-Study Rooms
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm">
            Учитесь вместе с другими студентами под приятную музыку.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Создать комнату
        </button>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 mb-6 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Глобальное пространство</p>
          <p>В этих комнатах вы можете учиться вместе со студентами со всей планеты. Фокусируйтесь на своих задачах, оставаясь в приятной компании.</p>
        </div>
      </div>

      <div className="mb-6 relative">
        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск комнат по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 pl-10 pr-4 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-slate-500 transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-slate-300 dark:border-slate-700 border-t-slate-900 dark:border-t-white rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <Headphones className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">Нет активных комнат</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">К сожалению, сейчас никто не учится.</p>
          <button 
            onClick={() => setShowModal(true)}
            className="mt-4 text-sm font-medium text-slate-900 dark:text-white underline hover:text-slate-600 dark:hover:text-slate-300"
          >
            Создайте свою первую комнату
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(room => (
            <div 
              key={room.id}
              className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f172a] p-5 hover:border-slate-400 dark:hover:border-slate-500 transition-colors flex flex-col"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-lg line-clamp-2 leading-tight">
                  {room.title}
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Создатель: {room.creatorName}</p>
              
              <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium">{room.participantsCount}</span>
                </div>
                <button
                  onClick={() => navigate(`/study-rooms/${room.id}`)}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 px-4 py-1.5 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Войти
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-none">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Новая комната</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Название фокуса</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Например: Математика, полная тишина"
                    className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:border-slate-600 dark:focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Фоновая музыка (YouTube)</label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://youtu.be/jfKfPfyJRdk"
                    className="w-full border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:border-slate-600 dark:focus:border-slate-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Оставьте пустым, если музыка не нужна.</p>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Отмена
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200">
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudyRoomListPage;
