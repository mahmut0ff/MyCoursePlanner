import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import {
  Maximize2, Minimize2, Pencil, MousePointer,
  Eraser, Trash2, Copy, Users, ChevronUp, ChevronDown, StopCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import LiveCanvas from './LiveCanvas';
import LiveParticipants from './LiveParticipants';
import LiveReactions from './LiveReactions';
import {
  endLiveSession, leaveLiveSession,
  subscribeToLiveSession, subscribeToAnnotations, subscribeToReactions,
  addAnnotation, clearAnnotations, updateTeacherCursor, clearCursorThrottle,
  addReaction, kickParticipant
} from '../../services/live-session.service';
import type {
  LiveSession, LiveParticipant, LiveAnnotation, LiveReaction,
  AnnotationType, LiveReactionType
} from '../../types';

interface LiveSessionOverlayProps {

  isTeacher: boolean;
  session: LiveSession | null;
  onSessionChange: (session: LiveSession | null) => void;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];
const WIDTHS = [2, 4, 6, 8];

const LiveSessionOverlay: React.FC<LiveSessionOverlayProps> = ({
  isTeacher, session, onSessionChange,
}) => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [toolMode, setToolMode] = useState<'laser' | 'draw' | 'eraser'>('laser');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [currentWidth, setCurrentWidth] = useState(4);

  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [annotations, setAnnotations] = useState<LiveAnnotation[]>([]);
  const [reactions, setReactions] = useState<LiveReaction[]>([]);
  const [teacherCursor, setTeacherCursor] = useState<{ x: number; y: number } | null>(null);

  const [codeCopied, setCodeCopied] = useState(false);
  const unsubRef = useRef<(() => void)[]>([]);

  // Subscribe to session data
  useEffect(() => {
    if (!session) return;
    const sessionId = session.id;

    const unsub1 = subscribeToLiveSession(sessionId, (s, p) => {
      // C2 FIX: Handle session ended
      if (s && s.status === 'ended') {
        onSessionChange(null);
        setExpanded(false);
        toast(t('live.sessionEnded'), { icon: '📡' });
        return;
      }
      onSessionChange(s);
      setParticipants(p);

      // Get teacher cursor for students
      if (!isTeacher) {
        const teacher = p.find(pp => pp.role === 'teacher');
        if (teacher && teacher.cursorX != null && teacher.cursorY != null) {
          setTeacherCursor({ x: teacher.cursorX, y: teacher.cursorY });
        }
      }
    });

    const unsub2 = subscribeToAnnotations(sessionId, (a) => {
      setAnnotations(a);
    });

    const unsub3 = subscribeToReactions(sessionId, (r) => {
      setReactions(r);
    });

    unsubRef.current = [unsub1, unsub2, unsub3];

    // C3 FIX: Leave session on tab close (students only)
    const handleBeforeUnload = () => {
      if (!isTeacher && user) {
        leaveLiveSession(sessionId, user.uid).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubRef.current.forEach(fn => fn());
      unsubRef.current = [];
      clearCursorThrottle();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // C3 FIX: Leave on unmount (students only)
      if (!isTeacher && user) {
        leaveLiveSession(sessionId, user.uid).catch(() => {});
      }
    };
  }, [session?.id]);



  // End session
  const handleEnd = async () => {
    if (!session || !confirm(t('live.endConfirm'))) return;
    try {
      await endLiveSession(session.id);
      onSessionChange(null);
      setExpanded(false);
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  // Drawing — H2 FIX: wrapped in try-catch
  const handleDraw = useCallback(async (points: { x: number; y: number }[], color: string, width: number) => {
    if (!session || !user) return;
    try {
      await addAnnotation(session.id, {
        sessionId: session.id,
        type: 'draw' as AnnotationType,
        points,
        color,
        width,
        slideIndex: 0,
        authorId: user.uid,
      });
    } catch (err) {
      console.warn('Draw failed:', err);
    }
  }, [session, user]);

  // Cursor
  const handleCursorMove = useCallback((x: number, y: number) => {
    if (!session || !user) return;
    updateTeacherCursor(session.id, user.uid, x, y);
    setTeacherCursor({ x, y }); // local preview
  }, [session, user]);

  // Clear annotations
  const handleClear = async () => {
    if (!session || !confirm(t('live.clearConfirm'))) return;
    try {
      await clearAnnotations(session.id);
    } catch (err) {
      toast.error('Failed to clear');
    }
  };

  // Copy code
  const copyCode = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.joinCode).catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // Reaction
  const handleReact = async (type: LiveReactionType) => {
    if (!session || !user) return;
    try {
      await addReaction(session.id, user.uid, user.displayName || 'User', type);
    } catch (err) {
      console.warn('Reaction failed:', err);
    }
  };

  // Kick
  const handleKick = async (userId: string) => {
    if (!session) return;
    try {
      await kickParticipant(session.id, userId);
    } catch (err) {
      toast.error('Failed to kick');
    }
  };

  if (!session) return null;

  // Minimized toolbar
  if (!expanded) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 bg-gradient-to-r from-violet-600/95 to-indigo-600/95 backdrop-blur-xl px-5 py-3 rounded-2xl shadow-2xl shadow-violet-500/25 border border-white/10">
          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
              <div className="absolute inset-0 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
            </div>
            <span className="text-white font-semibold text-sm">LIVE</span>
          </div>

          <div className="w-px h-6 bg-white/20" />

          {/* Participants count */}
          <div className="flex items-center gap-1.5 text-white/80 text-sm">
            <Users className="w-4 h-4" />
            <span>{participants.length}</span>
          </div>

          {/* Join code */}
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg transition-colors text-white text-sm font-mono"
          >
            <span>{session.joinCode || '...'}</span>
            <Copy className="w-3.5 h-3.5" />
          </button>

          {/* Reactions */}
          <LiveReactions onReact={handleReact} incomingReactions={reactions} />

          <div className="w-px h-6 bg-white/20" />

          {/* Expand */}
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg transition-colors text-white text-sm"
          >
            <Maximize2 className="w-4 h-4" />
            <span>{t('live.maximize')}</span>
          </button>

          {/* End (teacher only) */}
          {isTeacher && (
            <button
              onClick={handleEnd}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors text-white text-sm font-semibold"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded fullscreen overlay
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Canvas layer */}
      <LiveCanvas
        annotations={annotations}
        teacherCursor={isTeacher ? null : teacherCursor}
        toolMode={toolMode}
        currentColor={currentColor}
        currentWidth={currentWidth}
        isTeacher={isTeacher}
        onDraw={handleDraw}
        onCursorMove={handleCursorMove}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        {/* Left: Live indicator + code */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-red-500/90 px-3 py-1.5 rounded-lg">
            <div className="relative">
              <div className="w-2 h-2 bg-white rounded-full" />
              <div className="absolute inset-0 w-2 h-2 bg-white rounded-full animate-ping" />
            </div>
            <span className="text-white font-bold text-sm">LIVE</span>
          </div>

          <button
            onClick={copyCode}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg text-white text-sm font-mono transition-colors"
            title={t('live.shareCode')}
          >
            {codeCopied ? '✓' : <Copy className="w-3.5 h-3.5" />}
            <span>{session.joinCode || '...'}</span>
          </button>

          <div className="flex items-center gap-1.5 text-white/70 text-sm">
            <Users className="w-4 h-4" />
            <span>{participants.length} {t('live.online')}</span>
          </div>
        </div>

        {/* Right: Minimize + End */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-white text-sm transition-colors"
          >
            <Minimize2 className="w-4 h-4" />
            <span>{t('live.minimize')}</span>
          </button>

          {isTeacher && (
            <button
              onClick={handleEnd}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-white text-sm font-semibold transition-colors"
            >
              <StopCircle className="w-4 h-4" />
              <span>{t('live.endLesson')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/60 to-transparent">
        {/* Collapse toggle */}
        <div className="flex justify-center">
          <button
            onClick={() => setToolbarOpen(o => !o)}
            className="px-4 py-1 bg-white/10 hover:bg-white/20 rounded-t-lg text-white transition-colors"
          >
            {toolbarOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {toolbarOpen && (
          <div className="px-4 pb-4 pt-2 flex flex-wrap items-center gap-4">
            {/* Drawing tools (teacher) */}
            {isTeacher && (
              <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
                <button
                  onClick={() => setToolMode('laser')}
                  className={`p-2.5 rounded-lg transition-all ${toolMode === 'laser' ? 'bg-red-500 text-white shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                  title={t('live.laser')}
                >
                  <MousePointer className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setToolMode('draw')}
                  className={`p-2.5 rounded-lg transition-all ${toolMode === 'draw' ? 'bg-blue-500 text-white shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                  title={t('live.draw')}
                >
                  <Pencil className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setToolMode('eraser')}
                  className={`p-2.5 rounded-lg transition-all ${toolMode === 'eraser' ? 'bg-orange-500 text-white shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                  title={t('live.eraser')}
                >
                  <Eraser className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-white/20 mx-1" />
                <button
                  onClick={handleClear}
                  className="p-2.5 rounded-lg text-white/70 hover:text-red-400 hover:bg-white/10 transition-all"
                  title={t('live.clearAll')}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Color picker (teacher, draw mode) */}
            {isTeacher && toolMode === 'draw' && (
              <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setCurrentColor(c)}
                    className={`w-7 h-7 rounded-lg transition-all border-2 ${currentColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:border-white/40'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            )}

            {/* Width picker (teacher, draw mode) */}
            {isTeacher && toolMode === 'draw' && (
              <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1.5">
                {WIDTHS.map(w => (
                  <button
                    key={w}
                    onClick={() => setCurrentWidth(w)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${currentWidth === w ? 'bg-white/30' : 'hover:bg-white/15'}`}
                    title={`${w}px`}
                  >
                    <div className="rounded-full bg-white" style={{ width: w + 2, height: w + 2 }} />
                  </button>
                ))}
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Reactions */}
            <LiveReactions onReact={handleReact} incomingReactions={reactions} />

            {/* Participants panel */}
            <div className="hidden md:block">
              <LiveParticipants
                participants={participants}
                isTeacher={isTeacher}
                onKick={isTeacher ? handleKick : undefined}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveSessionOverlay;
