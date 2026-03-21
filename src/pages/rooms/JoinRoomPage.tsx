import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRoomByCode, joinRoom } from '../../services/rooms.service';
import { useAuth } from '../../contexts/AuthContext';
import { Radio, ArrowRight } from 'lucide-react';

const JoinRoomPage: React.FC = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { profile } = useAuth();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) { setError('Please enter a room code'); return; }
    setLoading(true);
    try {
      const room = await getRoomByCode(code.trim().toUpperCase());
      if (!room) { setError('Room not found or no longer active'); setLoading(false); return; }
      await joinRoom(room.id, profile!.uid);
      navigate(`/take/${room.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className="card p-8 text-center">
        <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Radio className="w-8 h-8 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Join an Exam</h1>
        <p className="text-slate-500 mb-6">Enter the room code provided by your teacher</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="input text-center text-2xl font-mono tracking-[0.3em] py-4"
            placeholder="ABCDEF"
            maxLength={6}
          />
          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? 'Joining...' : <><span>Join Exam</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinRoomPage;
