import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { GradeEntry, GradeSchema, GradeStatus } from '../../types';
import { Loader2, Check, Eraser } from 'lucide-react';
import { schemaChoices, choiceNumericValue } from '../../lib/gradePresets';

interface GradeCellProps {
  studentId: string;
  itemId: string;
  value: GradeEntry | undefined;
  schema: GradeSchema;
  onChange: (value: number | null, displayValue: string | undefined, status: GradeStatus, comment?: string) => void;
  tabIndex?: number;
  isSyncing?: boolean;
  readOnly?: boolean;
}

const statusColors: Record<GradeStatus, string> = {
  normal: 'text-slate-900 dark:text-white',
  absent: 'bg-red-500/10 text-red-600 dark:text-red-400',
  late: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  excused: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  missing: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

const GradeCell: React.FC<GradeCellProps> = ({ studentId, itemId, value, schema, onChange, tabIndex, isSyncing, readOnly = false }) => {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayVal = value?.displayValue || (value?.value !== null && value?.value !== undefined ? String(value.value) : '');
  const status = value?.status || 'normal';

  // Нечисловые шкалы (буквы, зачёт/незачёт, своя) выбираются из списка: набирать
  // отметку руками означало разъезжающиеся написания в одной колонке — «зачет»,
  // «Зачёт», «зач.» — и никакой возможности их потом посчитать.
  const choices = schemaChoices(schema);
  const labels = schema.scale?.labels || {};
  const [pickerIdx, setPickerIdx] = useState(0);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const pickerOpen = pickerPos !== null;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  /**
   * Ячейка, оставшаяся В РЕЖИМЕ ВВОДА, при уходе со страницы фиксирует значение.
   *
   * Это была самая дорогая потеря во всём журнале. Набранное живёт в локальном
   * `tempVal` и уходит наружу только по blur/Enter/Tab. Закрытие вкладки blur не
   * вызывает — преподаватель вводил последнюю оценку и закрывал ноутбук, а она
   * не доходила даже до состояния страницы, не то что до сервера. Снаружи это
   * выглядело как «журнал не сохраняет оценки».
   *
   * `visibilitychange` приходит раньше, чем страницу выгрузят (в том числе при
   * закрытии крышки), поэтому здесь ещё можно успеть отдать значение в очередь
   * сохранения — она сама отправит его тем же событием.
   */
  // Свежие значения держим в ref, чтобы слушатели вешались один раз за сеанс
  // редактирования, а не переподписывались на каждое нажатие клавиши.
  const commitRef = useRef<() => void>(() => {});
  commitRef.current = () => {
    if (tempVal !== displayVal) commitValue(tempVal);
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return;
    const commitIfHidden = () => {
      if (document.visibilityState === 'hidden') commitRef.current();
    };
    document.addEventListener('visibilitychange', commitIfHidden);
    window.addEventListener('pagehide', commitIfHidden);
    return () => {
      document.removeEventListener('visibilitychange', commitIfHidden);
      window.removeEventListener('pagehide', commitIfHidden);
    };
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
      numVal = choiceNumericValue(schema, dispVal);
    } else {
      dispVal = valToCommit;
      numVal = choiceNumericValue(schema, dispVal);
    }

    onChange(numVal, dispVal, status, value?.comment);
  };

  /** Меню отметок висит в портале: гриды скроллятся, и внутри ячейки его бы обрезало. */
  const openPicker = () => {
    const r = cellRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 176);
    const height = Math.min(choices.length * 40 + 48, 280);
    const openUp = r.bottom + height + 8 > window.innerHeight && r.top > height;
    setPickerPos({
      top: openUp ? Math.max(8, r.top - height - 4) : r.bottom + 4,
      left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
      width,
    });
    setPickerIdx(Math.max(0, choices.indexOf(displayVal)));
  };

  const closePicker = (refocus = true) => {
    setPickerPos(null);
    if (refocus) setTimeout(() => cellRef.current?.focus(), 0);
  };

  const pickChoice = (v: string | null, move = true) => {
    setPickerPos(null);
    if (v === null) {
      if (displayVal) onChange(null, undefined, 'normal', value?.comment);
    } else if (v !== displayVal) {
      // Вместе с отметкой сохраняем её числовой эквивалент, иначе буквы и
      // зачёты выпадают из среднего балла и аналитики.
      onChange(choiceNumericValue(schema, v), v, status, value?.comment);
    }
    if (move) {
      window.dispatchEvent(new CustomEvent('gradebook:moveFocus', { detail: { studentId, itemId, direction: 'down' } }));
    } else {
      setTimeout(() => cellRef.current?.focus(), 0);
    }
  };

  // Позиция посчитана в координатах вьюпорта — при скролле/ресайзе она протухает.
  useEffect(() => {
    if (!pickerOpen) return;
    const close = () => setPickerPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (pickerOpen) menuRef.current?.focus();
  }, [pickerOpen]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setPickerIdx((i) => (i + (e.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickChoice(choices[pickerIdx] ?? null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePicker();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      pickChoice(null, false);
    } else if (e.key.length === 1) {
      const hit = choices.findIndex((c) => c.toLowerCase().startsWith(e.key.toLowerCase()));
      if (hit >= 0) {
        e.preventDefault();
        pickChoice(choices[hit]);
      }
    }
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
    if (editing || pickerOpen) return;
    // Read-only viewers keep focus and arrow-key navigation (handled by the grid's
    // window listener) — only the edit/clear keys are inert.
    if (readOnly) return;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange(null, undefined, 'normal', value?.comment);
      return;
    }

    if (choices.length > 0) {
      // Списочная шкала: буква/цифра сразу ставит совпавшую отметку — темп
      // выставления оценок с клавиатуры остаётся прежним.
      if (e.key === 'Enter') {
        e.preventDefault();
        openPicker();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const hit = choices.find((c) => c.toLowerCase().startsWith(e.key.toLowerCase()));
        if (hit) pickChoice(hit);
        else openPicker();
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      setTempVal(displayVal);
      setEditing(true);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Start typing directly!
      e.preventDefault();
      setTempVal(e.key);
      setEditing(true);
    }
  };

  // Подсказка в пустой ячейке — единственное место, где преподаватель узнаёт
  // шкалу курса, не выходя из журнала.
  const placeholder = (() => {
    if (schema.gradingType === 'points' || schema.gradingType === 'percent') {
      return `${schema.scale.min}–${schema.scale.max}`;
    }
    return choices.join(' ');
  })();

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        className="w-full h-full min-h-[48px] text-center bg-white dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white outline-none ring-2 ring-inset ring-primary-500 shadow-[0_0_15px_rgba(99,102,241,0.2)] z-20 relative placeholder:font-normal placeholder:text-xs placeholder:text-slate-300"
        value={tempVal}
        onChange={(e) => setTempVal(e.target.value)}
        onBlur={() => handleCommitAndMove('none')}
        onKeyDown={handleKeyDownEditing}
      />
    );
  }

  return (
    <>
    <div
      ref={cellRef}
      tabIndex={tabIndex}
      aria-haspopup={choices.length > 0 ? 'listbox' : undefined}
      aria-expanded={choices.length > 0 ? pickerOpen : undefined}
      className={`w-full h-full min-h-[48px] flex flex-col items-center justify-center outline-none ${readOnly ? 'cursor-default' : 'cursor-cell'} transition-all ring-inset focus:ring-2 focus:ring-primary-400 ${pickerOpen ? 'ring-2 ring-primary-500 bg-primary-50/50 dark:bg-primary-900/20' : ''} hover:bg-slate-50/80 dark:hover:bg-slate-700/50 group relative ${statusColors[status]}`}
      onClick={() => {
         // Single click to edit for ease.
         if (readOnly) return;
         if (choices.length > 0) { openPicker(); return; }
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

    {pickerOpen && pickerPos && createPortal(
      <>
        <div className="fixed inset-0 z-[60]" onMouseDown={() => closePicker()} />
        <div
          ref={menuRef}
          tabIndex={-1}
          role="listbox"
          onKeyDown={handleMenuKeyDown}
          style={{ top: pickerPos.top, left: pickerPos.left, width: pickerPos.width }}
          className="fixed z-[61] max-h-[280px] overflow-y-auto p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl outline-none"
        >
          {choices.map((c, i) => {
            const selected = c === displayVal;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setPickerIdx(i)}
                onClick={() => pickChoice(c)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${i === pickerIdx ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
              >
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{c}</span>
                  {labels[c] && <span className="text-[11px] text-slate-500 truncate">{labels[c]}</span>}
                </span>
                {selected && <Check className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 shrink-0" />}
              </button>
            );
          })}
          {displayVal && (
            <button
              type="button"
              onClick={() => pickChoice(null, false)}
              className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 border-t border-slate-100 dark:border-slate-700 text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <Eraser className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-medium">Очистить</span>
            </button>
          )}
        </div>
      </>,
      document.body,
    )}
    </>
  );
};

export default GradeCell;
