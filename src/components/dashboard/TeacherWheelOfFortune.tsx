import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgGetStudents } from '../../lib/api';
import type { Group, UserProfile } from '../../types';
import { Users, Trophy, Dices, ChevronDown } from 'lucide-react';

const COLORS = [
  '#0d9488', // teal-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#ea580c', // orange-600
  '#2563eb', // blue-600
  '#db2777', // pink-600
  '#0891b2', // cyan-600
  '#b45309', // amber-700
];

function getCoordinatesForAngle(angleInDegrees: number, center: number, radius: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return [
    center + radius * Math.cos(angleInRadians),
    center + radius * Math.sin(angleInRadians),
  ];
}

function getSlicePath(startAngle: number, endAngle: number, center = 50, radius = 50) {
  if (endAngle - startAngle === 360) {
    return `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center} ${center + radius} A ${radius} ${radius} 0 1 1 ${center} ${center - radius} Z`;
  }
  const start = getCoordinatesForAngle(startAngle, center, radius);
  const end = getCoordinatesForAngle(endAngle, center, radius);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${center} ${center} L ${start[0]} ${start[1]} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end[0]} ${end[1]} Z`;
}

interface Props {
  /** Preview/testing seam: skip fetching and use this data directly. */
  initialGroups?: Group[];
  initialStudents?: UserProfile[];
}

/**
 * Classroom tool: pick a random student from a group.
 * Rendered as a collapsed row that expands in place — a game widget should
 * not occupy a prime dashboard cell by default.
 */
const TeacherWheelOfFortune: React.FC<Props> = ({ initialGroups, initialStudents }) => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>(initialGroups || []);
  const [students, setStudents] = useState<UserProfile[]>(initialStudents || []);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialGroups?.[0]?.id || '');
  const [loading, setLoading] = useState(!initialGroups);
  const [open, setOpen] = useState(() => localStorage.getItem('planula_wheel_open') === 'true');

  // Wheel state
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<UserProfile | null>(null);
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
    if (initialGroups) return; // seeded externally (preview/testing)
    if (!profile?.uid) return;
    Promise.all([
      orgGetGroups().catch(() => []),
      orgGetStudents().catch(() => [])
    ]).then(([gRes, sRes]) => {
      let g = Array.isArray(gRes) ? gRes : [];
      const s = Array.isArray(sRes) ? sRes : [];

      // Keep only groups where teacher is assigned
      if (profile.role === 'teacher') {
        g = g.filter((group: Group) => group.teacherIds?.includes(profile.uid));
      }
      setGroups(g);
      setStudents(s);
      if (g.length > 0) setSelectedGroupId(g[0].id);
      setLoading(false);
    });
  }, [profile?.uid, profile?.role, initialGroups]);

  const wheelStudents = useMemo(() => {
    if (!selectedGroupId) return [];
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return [];
    return students.filter(s => group.studentIds.includes(s.uid));
  }, [groups, students, selectedGroupId]);

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    localStorage.setItem('planula_wheel_open', String(nextOpen));
  };

  const spin = () => {
    if (spinning || wheelStudents.length === 0) return;
    setSpinning(true);
    setWinner(null);
    setShowWinner(false);

    const randomIndex = Math.floor(Math.random() * wheelStudents.length);
    const sliceAngle = 360 / wheelStudents.length;
    // The center angle of the winning slice
    const sliceCenter = randomIndex * sliceAngle + (sliceAngle / 2);

    // Add a random offset within 80% of the slice so pointer doesn't land perfectly on edges
    const randomOffset = (Math.random() - 0.5) * (sliceAngle * 0.8);

    // Pointer is at TOP (0 degrees). We want (sliceCenter + R) % 360 = 0.
    // Which means R = 360 - sliceCenter.
    let targetOffset = 360 - (sliceCenter + randomOffset);
    if (targetOffset < 0) targetOffset += 360;

    const extraSpins = 360 * 5; // Spin 5 times
    const currentBase = rotation - (rotation % 360);
    const newRotation = currentBase + extraSpins + targetOffset;

    setRotation(newRotation);

    setTimeout(() => {
      setWinner(wheelStudents[randomIndex]);
      setShowWinner(true);
      setSpinning(false);
    }, 4000);
  };

  if (loading) return null;
  if (groups.length === 0) return null; // Only show if teacher has groups

  return (
    <section className="card overflow-hidden">
      {/* Collapsed header row = toggle */}
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
      >
        <Dices className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('teacherDashboard.wheelTitle', 'Колесо фортуны')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {t('teacherDashboard.wheelDesc', 'Случайный студент из группы')}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-5 flex flex-col items-center">
          {/* Group selector */}
          <div className="relative w-full max-w-[320px] mb-4">
            <select
              value={selectedGroupId}
              onChange={(e) => {
                setSelectedGroupId(e.target.value);
                setRotation(0);
                setWinner(null);
                setShowWinner(false);
              }}
              disabled={spinning}
              className="input appearance-none pr-8"
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {wheelStudents.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 w-full">
              <Users className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{t('teacherDashboard.wheelEmpty', 'В этой группе нет студентов')}</p>
            </div>
          ) : (
            <>
              <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-square relative mb-5">
                {/* The Pointer */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 text-slate-800 dark:text-slate-100 drop-shadow-md">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="rotate-180">
                    <path d="M12 2L2 22h20L12 2z" />
                  </svg>
                </div>

                {/* The SVG Wheel */}
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-full drop-shadow-lg"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
                  }}
                >
                  {wheelStudents.map((st, i) => {
                    const sliceAngle = 360 / wheelStudents.length;
                    const startAngle = i * sliceAngle;
                    const endAngle = (i + 1) * sliceAngle;
                    const fill = COLORS[i % COLORS.length];

                    return (
                      <g key={st.uid}>
                        <path d={getSlicePath(startAngle, endAngle)} fill={fill} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                        {wheelStudents.length > 1 && (
                          <g transform={`translate(50, 50) rotate(${startAngle + sliceAngle / 2})`}>
                            <text
                              x="0"
                              y="-42"
                              fill="white"
                              fontSize={wheelStudents.length > 15 ? '2.5' : wheelStudents.length > 10 ? '3' : '3.5'}
                              fontWeight="700"
                              textAnchor="end"
                              dominantBaseline="middle"
                              transform="rotate(-90, 0, -42)"
                              style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}
                            >
                              {st.displayName.split(' ')[0]} {/* Use first name to save space */}
                            </text>
                          </g>
                        )}
                        {wheelStudents.length === 1 && (
                          <text x="50" y="50" fill="white" fontSize="4" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                            {st.displayName}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Center hub */}
                  <circle cx="50" cy="50" r="12" fill="#ffffff" className="dark:fill-slate-800" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
                  <circle cx="50" cy="50" r="10" fill="#f8fafc" className="dark:fill-slate-700" />
                  <path d="M50 43 L52 48 L57 48 L53 51 L54 56 L50 53 L46 56 L47 51 L43 48 L48 48 Z" fill="#94a3b8" opacity="0.5" />
                </svg>

                {/* Winner overlay */}
                <div className={`absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm z-30 transition-all duration-500 rounded-full flex flex-col items-center justify-center ${showWinner ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                  <div className="bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-600 rounded-2xl p-5 text-center w-[85%]">
                    <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Trophy className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('teacherDashboard.wheelWinner', 'Выбран(а)')}</p>
                    <p className="font-bold text-xl text-slate-900 dark:text-white leading-tight mb-4">
                      {winner?.displayName}
                    </p>
                    <button
                      onClick={() => setShowWinner(false)}
                      className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold py-2 rounded-lg transition-colors"
                    >
                      {t('teacherDashboard.wheelContinue', 'Продолжить')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Action */}
              <button
                onClick={spin}
                disabled={spinning || wheelStudents.length <= 1}
                className="btn-primary w-full max-w-[320px] text-sm font-semibold"
              >
                {spinning
                  ? t('teacherDashboard.wheelSpinning', 'Вращение…')
                  : t('teacherDashboard.wheelSpin', 'Крутить колесо')}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default TeacherWheelOfFortune;
