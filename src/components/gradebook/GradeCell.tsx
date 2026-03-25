import React, { useState, useEffect, useRef } from 'react';
import type { GradeEntry, GradeSchema, GradeStatus } from '../../types';

interface GradeCellProps {
  studentId: string;
  itemId: string; // lessonId or assignmentId
  value: GradeEntry | undefined;
  schema: GradeSchema;
  onChange: (value: number | null, displayValue: string | undefined, status: GradeStatus, comment?: string) => void;
  tabIndex?: number;
}

const statusColors: Record<GradeStatus, string> = {
  normal: 'text-slate-900 dark:text-white',
  absent: 'bg-red-500/10 text-red-600 dark:text-red-400',
  late: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  excused: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  missing: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

const GradeCell: React.FC<GradeCellProps> = ({ studentId, itemId, value, schema, onChange, tabIndex }) => {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const displayVal = value?.displayValue || (value?.value !== null && value?.value !== undefined ? String(value.value) : '');
  const status = value?.status || 'normal';

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStartEdit = () => {
    setTempVal(displayVal);
    setEditing(true);
  };

  const handleCommit = () => {
    setEditing(false);
    if (tempVal === displayVal) return;

    let numVal: number | null = null;
    let dispVal: string | undefined = undefined;

    if (tempVal.trim() === '') {
      onChange(null, undefined, 'normal', value?.comment);
      return;
    }

    if (schema.gradingType === 'points' || schema.gradingType === 'percent') {
      const parsed = parseFloat(tempVal);
      if (!isNaN(parsed)) {
        numVal = Math.min(Math.max(parsed, schema.scale.min), schema.scale.max);
      }
    } else if (schema.gradingType === 'letter') {
      dispVal = tempVal.toUpperCase();
      // Basic validation against schema could go here
    } else {
      dispVal = tempVal;
    }

    onChange(numVal, dispVal, status, value?.comment);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommit();
      // Grid will handle arrow keys to move focus if not editing,
      // but on Enter, we want to stay in cell or move down? 
      // Usually grid handles Enter if we bubble it or we focus next.
      e.target.dispatchEvent(new Event('blur', { bubbles: true }));
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  };

  const handleWrapperKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editing) {
      if (e.key === 'Enter' || e.key.match(/^[a-zA-Z0-9]$/)) {
        e.preventDefault();
        if (e.key !== 'Enter') {
          setTempVal(e.key);
        } else {
          setTempVal(displayVal);
        }
        setEditing(true);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onChange(null, undefined, 'normal', value?.comment);
      }
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="w-full h-full text-center bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white outline-none border-2 border-primary-500 rounded"
        value={tempVal}
        onChange={(e) => setTempVal(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div
      tabIndex={tabIndex}
      className={`w-full h-full min-h-[40px] flex flex-col items-center justify-center outline-none cursor-text transition-colors border-2 border-transparent focus:border-primary-400 group ${statusColors[status]}`}
      onClick={handleStartEdit}
      onKeyDown={handleWrapperKeyDown}
      data-student-id={studentId}
      data-item-id={itemId}
    >
      {/* Visual Indicator of value */}
      <span className="text-sm font-semibold">{displayVal || (status !== 'normal' ? status.substring(0, 3).toUpperCase() : '-')}</span>
      
      {/* Comment indicator */}
      {value?.comment && (
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" title={value.comment} />
      )}
    </div>
  );
};

export default GradeCell;
