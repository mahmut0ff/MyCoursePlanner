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
}

const GradebookGrid: React.FC<GradebookGridProps> = ({ students, columns, grades, schema, onGradeChange }) => {
  const gridRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gridRef.current?.contains(document.activeElement)) return;
      
      const active = document.activeElement as HTMLElement;
      if (active.tagName === 'INPUT') return; // Don't navigate while editing

      const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (!isArrowKey) return;

      e.preventDefault();

      const cells = Array.from(gridRef.current.querySelectorAll<HTMLElement>('[data-student-id][data-item-id]'));
      const currentIndex = cells.indexOf(active);
      if (currentIndex === -1) return;

      const numCols = columns.length;
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowLeft':
          nextIndex = currentIndex - 1;
          break;
        case 'ArrowRight':
          nextIndex = currentIndex + 1;
          break;
        case 'ArrowUp':
          nextIndex = currentIndex - numCols;
          break;
        case 'ArrowDown':
          nextIndex = currentIndex + numCols;
          break;
      }

      if (nextIndex >= 0 && nextIndex < cells.length) {
        cells[nextIndex].focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [columns.length]);

  return (
    <div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800" ref={gridRef}>
      <table className="w-full border-collapse text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 z-10">
          <tr>
            <th className="sticky left-0 bg-slate-50 dark:bg-slate-900 px-4 py-3 font-medium text-slate-500 dark:text-slate-400 min-w-[200px] border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] z-20">
              User
            </th>
            {columns.map((col) => (
              <th key={col.id} className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 min-w-[120px] text-center border-r border-slate-200 dark:border-slate-700 last:border-r-0">
                <div className="truncate max-w-[150px] mx-auto" title={col.title}>
                  {col.title}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{col.type}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.uid} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 group">
              <td className="sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 px-4 py-2 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] z-10 transition-colors">
                <div className="flex items-center gap-3">
                  {student.avatarUrl ? (
                    <img src={student.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-xs shrink-0">
                      {student.displayName?.charAt(0).toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="truncate">
                    <p className="font-medium text-slate-900 dark:text-white truncate max-w-[160px]">{student.displayName}</p>
                    <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{student.email}</p>
                  </div>
                </div>
              </td>
              {columns.map((col) => {
                const key = `${student.uid}_${col.id}`;
                const entry = grades[key];
                return (
                  <td key={col.id} className="p-0 border-r border-slate-200 dark:border-slate-700 last:border-r-0 relative min-w-[120px] bg-white dark:bg-slate-800 transition-colors">
                    <div className="absolute inset-0">
                      <GradeCell
                        studentId={student.uid}
                        itemId={col.id}
                        value={entry}
                        schema={schema}
                        tabIndex={0}
                        onChange={(val, disp, status, comment) => onGradeChange(student.uid, col.id, val, disp, status, comment)}
                      />
                    </div>
                    {/* Add aspect ratio trick or min-height to table cell so absolute div can fill it */}
                    <div className="h-12 w-full invisible"></div> 
                  </td>
                );
              })}
            </tr>
          ))}
          {students.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                No students found in this course/group.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default GradebookGrid;
