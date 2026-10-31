import React from 'react';
import type { StudentRiskProfile } from '../../types';
import i18n from '../../i18n';

/**
 * The at-risk marker that replaced the standalone "Светофор рисков" page.
 *
 * It sits on the student's avatar wherever they are listed, so the signal
 * reaches the screens people already use instead of a dashboard nobody opened.
 *
 * Deliberately **static** — no pulse. On a roster where a fifth of the rows are
 * flagged, an animated dot per row turns the list into a strobe and makes the
 * page harder to read, not easier.
 *
 * Colour alone never carries the meaning: every dot has a title tooltip
 * spelling out the reasons, so it survives colour-blindness and screenshots.
 */

export const riskDotClass = (level: StudentRiskProfile['riskLevel']): string =>
  level === 'high'
    ? 'bg-red-500 ring-white dark:ring-slate-800'
    : 'bg-amber-400 ring-white dark:ring-slate-800';

/** "не был(а) 12 дн. · посещаемость 40%" — or a sane fallback. */
export const riskSummary = (risk: StudentRiskProfile): string => {
  const parts = [...(risk.reasons || [])];
  if (risk.hasOverduePayment) parts.push(i18n.t('org.students.risk.overduePayment', 'просрочена оплата'));
  if (parts.length === 0) return risk.riskLevel === 'high' ? i18n.t('org.students.risk.needsAttention', 'Требует внимания') : i18n.t('org.students.risk.watch', 'Стоит присмотреться');
  return parts.join(' · ');
};

interface Props {
  risk?: StudentRiskProfile;
  /** Extra positioning classes — the dot is absolutely placed by its parent. */
  className?: string;
}

/**
 * Renders nothing for a healthy student, so the roster stays quiet by default
 * and a dot always means "look at this one".
 */
const StudentRiskDot: React.FC<Props> = ({ risk, className = '' }) => {
  if (!risk || risk.riskLevel === 'low') return null;

  return (
    <span
      title={riskSummary(risk)}
      aria-label={i18n.t('org.students.risk.ariaLabel', 'В зоне риска: {{summary}}', { summary: riskSummary(risk) })}
      className={`w-3 h-3 rounded-full ring-2 ${riskDotClass(risk.riskLevel)} ${className}`}
    />
  );
};

export default StudentRiskDot;
