import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetGroups, orgGetStudents } from '../../lib/api';
import type { Group, UserProfile } from '../../types';
import { Loader2, Users, Trophy, Dices, ChevronDown, CheckCircle2 } from 'lucide-react';

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

const TeacherWheelOfFortune: React.FC = () => {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Wheel state
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<UserProfile | null>(null);
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
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
  }, [profile?.uid, profile?.role]);

  const wheelStudents = useMemo(() => {
    if (!selectedGroupId) return [];
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return [];
    return students.filter(s => group.studentIds.includes(s.uid));
  }, [groups, students, selectedGroupId]);

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

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[250px]">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (groups.length === 0) return null; // Only show if teacher has groups

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden relative flex flex-col items-center">
      {/* Header & Group Selector */}
      <div className="w-full px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/30">
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Dices className="w-5 h-5 text-violet-500" />
          Колесо Фортуны
        </h2>
        
        <div className="relative w-full sm:w-auto min-w-[200px]">
          <select
            value={selectedGroupId}
            onChange={(e) => {
               setSelectedGroupId(e.target.value);
               setRotation(0);
               setWinner(null);
               setShowWinner(false);
            }}
            disabled={spinning}
            className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl pl-3 pr-8 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-primary-500 dark:focus:border-primary-500 disabled:opacity-50"
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <div className="p-6 pb-8 flex flex-col items-center justify-center w-full relative overflow-hidden">
        {wheelStudents.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500 w-full">
            <Users className="w-8 h-8 mx-auto xl:w-12 xl:h-12 mb-3 opacity-20" />
            <p className="text-sm">В этой группе нет студентов</p>
          </div>
        ) : (
          <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-square relative my-4">
            {/* The Pointer */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 text-slate-800 dark:text-slate-100 drop-shadow-md">
               <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="rotate-180">
                 <path d="M12 2L2 22h20L12 2z" />
               </svg>
            </div>

            {/* The SVG Wheel */}
            <svg 
              viewBox="0 0 100 100" 
              className="w-full h-full drop-shadow-xl"
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
              
              {/* Center decorative button/circle */}
              <circle cx="50" cy="50" r="12" fill="#ffffff" className="dark:fill-slate-800" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="10" fill="#f8fafc" className="dark:fill-slate-700" />
              {/* Star or simple icon in center */}
              <path d="M50 43 L52 48 L57 48 L53 51 L54 56 L50 53 L46 56 L47 51 L43 48 L48 48 Z" fill="#94a3b8" opacity="0.5" />
            </svg>
            
            {/* Overlay Winner Block */}
            <div className={`absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm z-30 transition-all duration-500 rounded-full flex flex-col items-center justify-center ${showWinner ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
               <div className="bg-white dark:bg-slate-800 shadow-2xl border border-primary-200 dark:border-primary-800 rounded-2xl p-5 text-center transform w-[85%] relative overflow-hidden">
                  <div className="absolute inset-0 bg-primary-500/5 dark:bg-primary-500/10" />
                  <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center mx-auto mb-2 relative">
                    <Trophy className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-1">Выбран(а)</p>
                  <p className="font-black text-xl text-slate-900 dark:text-white leading-tight mb-4 relative z-10">
                    {winner?.displayName}
                  </p>
                  <button 
                    onClick={() => setShowWinner(false)}
                    className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold py-2 rounded-xl transition-colors relative z-10"
                  >
                    Продолжить
                  </button>
               </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        {wheelStudents.length > 0 && (
          <button 
            onClick={spin}
            disabled={spinning || wheelStudents.length <= 1}
            className={`mt-2 w-full max-w-[320px] py-3.5 px-6 rounded-xl font-black text-base tracking-wide transition-all active:scale-[0.98]
              ${spinning 
                ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed' 
                : 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-600/20 dark:shadow-none'
              }
            `}
          >
            {spinning ? 'ВРАЩЕНИЕ...' : 'КРУТИТЬ КОЛЕСО'}
          </button>
        )}
      </div>
    </div>
  );
};

export default TeacherWheelOfFortune;
