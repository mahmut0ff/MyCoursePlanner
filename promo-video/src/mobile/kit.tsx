import React from 'react';
import { interpolateColors, useCurrentFrame } from 'remotion';
import { BODY, C, DISPLAY } from '../theme';
import { b, BAR, ease, pop } from '../owner/kit';
import cues from './cues.json';

// «SabakHub в телефоне» — 1920×1080 @ 60 fps, 120 BPM half-time.
// Primitives (ease/pop/Num/Slam/Mark/…) come from the owner kit; only the
// cue sheet is different, so SECTIONS / cueAt are rebound here.
export { FPS, BEAT, BAR, b, ease, pop, Num, Slam, Mark, Wordmark, Chip, Label, Sweep, camera, fmt } from '../owner/kit';

type Cue = { beat: number; type: string; id?: string };
const CUE_LIST = cues.sfx as Cue[];
export const SECTIONS = cues.sections as unknown as Record<string, [number, number]>;
export const TOTAL = cues.bars * BAR;

export const start = (k: string) => SECTIONS[k][0] * BAR;
export const seq = (k: string) => ({ from: SECTIONS[k][0] * BAR, durationInFrames: SECTIONS[k][1] * BAR });

/** Frame of a named sound cue, relative to the start of `section` (or absolute). */
export const cueAt = (id: string, section?: string) => {
  const c = CUE_LIST.find((x) => x.id === id);
  if (!c) throw new Error(`missing cue ${id}`);
  return b(c.beat) - (section ? SECTIONS[section][0] * BAR : 0);
};

/* ── layout ─────────────────────────────────────────────────────────────── */
export const CAP_X = 120;
export const CAP_W = 870;
export const PHONE_X = 1120;
export const PHONE_Y = 45;

/* ── caption column ─────────────────────────────────────────────────────── */
export type Shot = { at: number; title: string[]; body?: string };

export const Lines: React.FC<{ lines: string[]; at: number; size: number; color: string; out?: number }> = ({ lines, at, size, color, out = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ opacity: 1 - out, transform: `translateY(${-18 * out}px)` }}>
      {lines.map((l, i) => {
        const t = ease(frame, at + i * 5, 22);
        return (
          <div key={i} style={{ overflow: 'hidden', paddingBottom: size * 0.1, marginBottom: -size * 0.1 }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 600,
                fontSize: size,
                lineHeight: 1.14,
                letterSpacing: -size * 0.025,
                color,
                transform: `translateY(${(1 - t) * 105}%)`,
                opacity: Math.min(1, t * 2),
                whiteSpace: 'pre',
              }}
            >
              {l}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Left-column caption for a section: kicker + one or more «shots», each with
 * its own title/body. Shots cross-fade inside the section; the whole thing
 * fades out over the section's last frames.
 */
export const Cap: React.FC<{
  n?: string;
  label: string;
  tag?: string;
  shots: Shot[];
  duration: number;
  dark?: boolean;
  /** section-relative frame at which the backdrop turns to night (text recolours over 30 frames) */
  darkAt?: number;
  top?: number;
  size?: number;
}> = ({ n, label, tag, shots, duration, dark, darkAt, top = 250, size = 52 }) => {
  const frame = useCurrentFrame();
  const sectionOut = ease(frame, duration - 16, 14, 'in');
  const kick = ease(frame, 4, 16);
  const line = ease(frame, 8, 22);
  const d = darkAt !== undefined ? ease(frame, darkAt - 15, 30) : dark ? 1 : 0;
  const ink = interpolateColors(d, [0, 1], [C.ink, C.paper]);
  const soft = interpolateColors(d, [0, 1], [C.inkSoft, '#C9C4D6']);
  const accent = interpolateColors(d, [0, 1], [C.indigo, C.teal]);
  const idx = Math.max(0, shots.filter((s) => frame >= s.at).length - 1);
  const shot = shots[idx];
  const next = shots[idx + 1];
  const out = next ? ease(frame, next.at - 14, 12, 'in') : 0;
  const bodyIn = ease(frame, shot.at + 14, 18);
  return (
    <div style={{ position: 'absolute', left: CAP_X, top, width: CAP_W, opacity: 1 - sectionOut, transform: `translateY(${-24 * sectionOut}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 30, opacity: kick }}>
        {n && <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 22, color: accent }}>{n}</span>}
        <span style={{ width: 52 * line, height: 2, background: accent, opacity: 0.6 }} />
        <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 22, letterSpacing: 2.5, textTransform: 'uppercase', color: soft }}>{label}</span>
        {tag && (
          <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 17, color: C.amber, background: d > 0.5 ? 'rgba(217,150,43,0.16)' : C.amberSoft, borderRadius: 9, padding: '5px 11px', letterSpacing: 0.5 }}>
            {tag}
          </span>
        )}
      </div>
      <Lines key={idx} lines={shot.title} at={shot.at + 2} size={size} color={ink} out={out} />
      {shot.body && (
        <div
          key={`b${idx}`}
          style={{
            marginTop: 28,
            fontFamily: BODY,
            fontSize: 28,
            lineHeight: 1.45,
            color: soft,
            maxWidth: 720,
            opacity: bodyIn * (1 - out),
            transform: `translateY(${(1 - bodyIn) * 16 - 18 * out}px)`,
          }}
        >
          {shot.body}
        </div>
      )}
    </div>
  );
};

/** A card that floats in the caption column — «what the other person sees». */
export const Satellite: React.FC<{
  at: number;
  until?: number;
  y?: number;
  w?: number;
  label?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  dark?: boolean;
}> = ({ at, until, y = 700, w = 620, label, children, style, dark }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const p = pop(frame, at, false);
  const out = until ? ease(frame, until, 12, 'in') : 0;
  return (
    <div style={{ position: 'absolute', left: CAP_X, top: y, width: w, opacity: Math.min(1, p * 1.5) * (1 - out), transform: `translateY(${(1 - p) * 50 - out * 30}px)` }}>
      {label && (
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 17, letterSpacing: 2, textTransform: 'uppercase', color: dark ? '#9B96AC' : C.inkMute, marginBottom: 12 }}>{label}</div>
      )}
      <div style={{ borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 80px -30px rgba(22,20,31,0.55)', ...style }}>{children}</div>
    </div>
  );
};
