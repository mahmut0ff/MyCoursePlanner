import React, { useRef, useEffect } from 'react';
import GradeCell from './GradeCell';
import type { GradeEntry, GradeSchema, UserProfile } from '../../types';

interface ColumnDef {
  id: string; // lessonId or assignmentId
  title: string;
  type: 'lesson' | 'assignment';
}

interface GradebookGridProps {
  students: UserProfile[];
  columns: ColumnDef[];
  grades: Record<string, GradeEntry>; // Key: studentId_itemId
  schema: GradeSchema;
  onGradeChange: (studentId: string, itemId: string, value: number | null, displayValue: string | undefined, status: any, comment?: string) => void;
  syncStatus?: Record<string, boolean>; // Key: studentId_itemId -> true if saving
}

const GradebookGrid: React.FC<GradebookGridProps> = ({ students, columns, grades, schema, onGradeChange, syncStatus = {} }) => {
  const gridRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation & Custom Event Listener
  useEffect(() => {
    const handleMoveFocus = (e: Event) => {
      const customEvent = e as CustomEvent<{studentId: string, itemId: string, direction: 'up' | 'down' | 'left' | 'right'}>;
      const { studentId, itemId, direction } = customEvent.detail;
      
      if (!gridRef.current) return;
      
      const cells = Array.from(gridRef.current.querySelectorAll<HTMLElement>('[data-grade-cell="true"]'));
      
      // Find current cell index
      const currentIndex = cells.findIndex(c => c.getAttribute('data-student-id') === studentId && c.getAttribute('data-item-id') === itemId);
      if (currentIndex === -1) return;

      const numCols = columns.length;
      let nextIndex = currentIndex;

      switch (direction) {
        case 'left': nextIndex = currentIndex - 1; break;
        case 'right': nextIndex = currentIndex + 1; break;
        case 'up': nextIndex = currentIndex - numCols; break;
        case 'down': nextIndex = currentIndex + numCols; break;
      }

      if (nextIndex >= 0 && nextIndex < cells.length) {
        cells[nextIndex].focus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gridRef.current?.contains(document.activeElement)) return;
      
      const active = document.activeElement as HTMLElement;
      if (active.tagName === 'INPUT') return; // Don't navigate while editing

      const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (!isArrowKey) return;

      e.preventDefault();

      const cells = Array.from(gridRef.current.querySelectorAll<HTMLElement>('[data-grade-cell="true"]'));
      const currentIndex = cells.indexOf(active);
      if (currentIndex === -1) return;

      const numCols = columns.length;
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowLeft': nextIndex = currentIndex - 1; break;
        case 'ArrowRight': nextIndex = currentIndex + 1; break;
        case 'ArrowUp': nextIndex = currentIndex - numCols; break;
        case 'ArrowDown': nextIndex = currentIndex + numCols; break;
      }

      if (nextIndex >= 0 && nextIndex < cells.length) {
        cells[nextIndex].focus();
      }
    };

    window.addEventListener('gradebook:moveFocus', handleMoveFocus);
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('gradebook:moveFocus', handleMoveFocus);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [columns.length]);

  return (
    <div className="w-full h-full overflow-auto border border-slate-200 dark:border-slate-700/80 rounded-2xl bg-white dark:bg-slate-900 custom-scrollbar shadow-sm" ref={gridRef}>
      <table className="w-full border-collapse text-left text-sm whitespace-nowrap min-w-max">
        <thead className="sticky top-0 z-30">
          <tr>
            <th className="sticky left-0 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md px-5 py-3 font-semibold text-slate-700 dark:text-slate-300 min-w-[240px] max-w-[280px] border-b border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_10px_-4px_rgba(0,0,0,0.1)]">
              Студент
            </th>
            {/* Average Score Column */}
            <th className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md px-4 py-3 font-semibold text-primary-600 dark:text-primary-400 min-w-[100px] border-b border-r border-slate-200 dark:border-slate-800 text-center">
              Сер. Балл
            </th>
            {columns.map((col) => (
              <th key={col.id} className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 w-32 min-w-[128px] max-w-[160px] text-center border-b border-r border-slate-200 dark:border-slate-800 last:border-r-0">
                <div className="truncate mx-auto" title={col.title}>
                  {col.title}
                </div>
                <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mt-1">{col.type}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            // Calculate Average dynamically
            let totalPoints = 0;
            let maxPoints = 0;
            columns.forEach(col => {
              const entry = grades[`${student.uid}_${col.id}`];
              if (entry?.value && typeof entry.value === 'number') {
                totalPoints += entry.value;
                maxPoints += (entry.maxValue || schema.scale.max || 100);
              }
            });
            const avgPct = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : null;

            return (
              <tr key={student.uid} className="border-b border-slate-200 dark:border-slate-800 last:border-b-0 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 group transition-colors">
                <td className="sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 px-5 py-2.5 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_10px_-4px_rgba(0,0,0,0.1)] z-20 transition-colors">
                  <div className="flex items-center gap-3">
                    {student.avatarUrl ? (
                      <img src={student.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-slate-100 dark:ring-slate-800" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/50 dark:to-indigo-800/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-sm shrink-0 ring-2 ring-slate-100 dark:ring-slate-800">
                        {student.displayName?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate" title={student.displayName}>{student.displayName}</p>
                      <p className="text-[11px] font-medium text-slate-500 truncate" title={student.email}>{student.email}</p>
                    </div>
                  </div>
                </td>
                
                {/* Average cell */}
                <td className="p-0 border-r border-slate-200 dark:border-slate-800 text-center font-bold">
                   <div className="flex items-center justify-center h-full min-h-[48px] px-2 bg-slate-50/30 dark:bg-slate-800/20">
                     {avgPct !== null ? (
                       <span className={`px-2 py-0.5 rounded ${avgPct >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : avgPct >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                         {avgPct}%
                       </span>
                     ) : (
                       <span className="text-slate-300 dark:text-slate-600">—</span>
                     )}
                   </div>
                </td>

                {columns.map((col) => {
                  const key = `${student.uid}_${col.id}`;
                  const entry = grades[key];
                  return (
                    <td key={col.id} className="p-0 border-r border-slate-200 dark:border-slate-800 last:border-r-0 relative min-w-[128px] w-32 bg-white dark:bg-slate-900 transition-colors">
                      <div className="absolute inset-0 z-10">
                        <GradeCell
                          studentId={student.uid}
                          itemId={col.id}
                          value={entry}
                          schema={schema}
                          tabIndex={0}
                          isSyncing={syncStatus[key]}
                          onChange={(val, disp, status, comment) => onGradeChange(student.uid, col.id, val, disp, status, comment)}
                        />
                      </div>
                      <div className="h-12 w-full invisible"></div> 
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {students.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                В этой группе или курсе нет студентов.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default GradebookGrid;
