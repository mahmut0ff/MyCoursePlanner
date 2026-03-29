import React, { useState, useEffect, useRef } from 'react';
import type { GradeEntry, GradeSchema, GradeStatus } from '../../types';
import { Loader2 } from 'lucide-react';

interface GradeCellProps {
  studentId: string;
  itemId: string;
  value: GradeEntry | undefined;
  schema: GradeSchema;
  onChange: (value: number | null, displayValue: string | undefined, status: GradeStatus, comment?: string) => void;
  tabIndex?: number;
  isSyncing?: boolean;
}

const statusColors: Record<GradeStatus, string> = {
  normal: 'text-slate-900 dark:text-white',
  absent: 'bg-red-500/10 text-red-600 dark:text-red-400',
  late: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  excused: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  missing: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

const GradeCell: React.FC<GradeCellProps> = ({ studentId, itemId, value, schema, onChange, tabIndex, isSyncing }) => {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const displayVal = value?.displayValue || (value?.value !== null && value?.value !== undefined ? String(value.value) : '');
  const status = value?.status || 'normal';

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitValue = (valToCommit: string) => {
    let numVal: number | null = null;
    let dispVal: string | undefined = undefined;

    if (valToCommit.trim() === '') {
      onChange(null, undefined, 'normal', value?.comment);
      return;
    }

    if (schema.gradingType === 'points' || schema.gradingType === 'percent') {
      const parsed = parseFloat(valToCommit.replace(',', '.'));
      if (!isNaN(parsed)) {
        numVal = Math.min(Math.max(parsed, schema.scale.min), schema.scale.max);
      }
    } else if (schema.gradingType === 'letter') {
      dispVal = valToCommit.toUpperCase();
    } else {
      dispVal = valToCommit;
    }

    onChange(numVal, dispVal, status, value?.comment);
  };

  const handleCommitAndMove = (direction: 'down' | 'right' | 'none') => {
    setEditing(false);
    if (tempVal !== displayVal) {
      commitValue(tempVal);
    }
    
    // Dispatch custom event for grid navigation
    if (direction !== 'none') {
      window.dispatchEvent(new CustomEvent('gradebook:moveFocus', { 
        detail: { studentId, itemId, direction }
      }));
    } else {
      // Return focus to the cell itself
      setTimeout(() => cellRef.current?.focus(), 0);
    }
  };

  const handleKeyDownEditing = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitAndMove(e.shiftKey ? 'none' : 'down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCommitAndMove('right');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
      setTimeout(() => cellRef.current?.focus(), 0);
    }
  };

  const handleKeyDownNormal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      setTempVal(displayVal);
      setEditing(true);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange(null, undefined, 'normal', value?.comment);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Start typing directly!
      e.preventDefault();
      setTempVal(e.key);
      setEditing(true);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="w-full h-full min-h-[48px] text-center bg-white dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none ring-2 ring-inset ring-primary-500 shadow-[0_0_15px_rgba(99,102,241,0.2)] z-20 relative"
        value={tempVal}
        onChange={(e) => setTempVal(e.target.value)}
        onBlur={() => handleCommitAndMove('none')}
        onKeyDown={handleKeyDownEditing}
      />
    );
  }

  return (
    <div
      ref={cellRef}
      tabIndex={tabIndex}
      className={`w-full h-full min-h-[48px] flex flex-col items-center justify-center outline-none cursor-cell transition-all ring-inset focus:ring-2 focus:ring-primary-400 hover:bg-slate-50/80 dark:hover:bg-slate-700/50 group relative ${statusColors[status]}`}
      onClick={() => {
         // Single click to edit for ease.
         setTempVal(displayVal);
         setEditing(true);
      }}
      onKeyDown={handleKeyDownNormal}
      data-student-id={studentId}
      data-item-id={itemId}
      data-grade-cell="true"
    >
      <span className="text-sm font-bold tracking-tight">
        {displayVal || (status !== 'normal' ? status.substring(0, 3).toUpperCase() : <span className="text-slate-200 dark:text-slate-700 font-normal">—</span>)}
      </span>
      
      {value?.comment && (
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm" title={value.comment} />
      )}

      {isSyncing && (
        <div className="absolute bottom-1 right-1 text-slate-300">
           <Loader2 className="w-3 h-3 animate-spin" />
        </div>
      )}
    </div>
  );
};

export default GradeCell;
