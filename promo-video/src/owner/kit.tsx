import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY, C, DISPLAY } from '../theme';
import cues from './cues.json';

// Owner film runs at 60 fps: 120 BPM → one beat = 30 frames, one bar = 120.
export const FPS = 60;
export const BEAT = 30;
export const BAR = 120;
export const b = (beats: number) => Math.round(beats * BEAT);

type Cue = { beat: number; type: string; id?: string };
const CUE_LIST = cues.sfx as Cue[];
export const SECTIONS = cues.sections as unknown as Record<string, [number, number]>;

/** Frame of a named sound cue, relative to the start of `section`. */
export const cueAt = (id: string, section: string) => {
  const c = CUE_LIST.find((x) => x.id === id);
  if (!c) throw new Error(`missing cue ${id}`);
  return b(c.beat) - SECTIONS[section][0] * BAR;
};

const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const IN = Easing.bezier(0.5, 0, 0.75, 0);

export const ease = (frame: number, at: number, dur: number, curve: 'out' | 'inOut' | 'in' = 'out') =>
  interpolate(frame, [at, at + Math.max(1, dur)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: curve === 'out' ? OUT : curve === 'inOut' ? IN_OUT : IN,
  });

export const pop = (frame: number, at: number, bouncy = true) =>
  spring({
    frame: frame - at,
    fps: FPS,
    config: bouncy ? { damping: 14, stiffness: 210, mass: 0.7 } : { damping: 200, stiffness: 170 },
  });

/** Piecewise camera: keyframes of {f, x, y, s}; eased between neighbours. */
export type CamKey = { f: number; x: number; y: number; s: number };
export const camera = (frame: number, keys: CamKey[], dur = 26, cx = 960, cy = 540) => {
  let cur = keys[0];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (frame >= k.f) {
      const t = ease(frame, k.f, dur, 'inOut');
      cur = {
        f: k.f,
        x: interpolate(t, [0, 1], [cur.x, k.x]),
        y: interpolate(t, [0, 1], [cur.y, k.y]),
        s: interpolate(t, [0, 1], [cur.s, k.s]),
      };
    }
  }
  // (x, y) is the canvas point that sits at screen point (cx, cy)
  return { transform: `translate(${cx - cur.x * cur.s}px, ${cy - cur.y * cur.s}px) scale(${cur.s})`, transformOrigin: '0 0' };
};

export const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ |,/g, ' ');

/** Count-up with fixed-width digits so the layout never jitters. */
export const Num: React.FC<{
  value: number;
  from?: number;
  at: number;
  dur?: number;
  size: number;
  color?: string;
  suffix?: string;
  prefix?: string;
  weight?: number;
  family?: string;
  decimals?: number;
}> = ({ value, from = 0, at, dur = 40, size, color = C.ink, suffix = '', prefix = '', weight = 600, family = DISPLAY, decimals = 0 }) => {
  const frame = useCurrentFrame();
  const t = ease(frame, at, dur, 'out');
  const v = from + (value - from) * t;
  const text = decimals ? v.toFixed(decimals).replace('.', ',') : fmt(v);
  return (
    <span style={{ fontFamily: family, fontWeight: weight, fontSize: size, color, letterSpacing: -size * 0.02, whiteSpace: 'nowrap' }}>
      {prefix}
      {text.split('').map((ch, i) => (
        <span key={i} style={{ display: 'inline-block', width: /\d/.test(ch) ? '0.66em' : ch === ' ' ? '0.26em' : undefined, textAlign: 'center' }}>
          {ch}
        </span>
      ))}
      {suffix && <span style={{ fontSize: size * 0.55, color: C.inkSoft, marginLeft: size * 0.12, letterSpacing: 0 }}>{suffix}</span>}
    </span>
  );
};

/** Words that slam in one after another (scale-down + rise), crisp at rest. */
export const Slam: React.FC<{
  text: string;
  at: number;
  size: number;
  color?: string;
  stagger?: number;
  weight?: number;
  family?: string;
  lineHeight?: number;
  align?: 'left' | 'center';
  maxWidth?: number;
  highlight?: string[];
  hiColor?: string;
}> = ({ text, at, size, color = C.ink, stagger = 4, weight = 700, family = DISPLAY, lineHeight = 1.08, align = 'left', maxWidth, highlight = [], hiColor = C.indigo }) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  return (
    <div style={{ fontFamily: family, fontWeight: weight, fontSize: size, lineHeight, letterSpacing: -size * 0.025, color, textAlign: align, maxWidth }}>
      {words.map((w, i) => {
        const p = pop(frame, at + i * stagger);
        const o = ease(frame, at + i * stagger, 6);
        const hi = highlight.includes(w.replace(/[.,—!?]/g, ''));
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: '0.24em',
              opacity: o,
              transform: `translateY(${(1 - p) * size * 0.5}px) scale(${1 + (1 - p) * 0.18})`,
              transformOrigin: '50% 80%',
              color: hi ? hiColor : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

export const Card: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  at: number;
  from?: 'up' | 'down' | 'left' | 'right' | 'scale';
  dark?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ x, y, w, h, at, from = 'up', dark, style, children }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at, false);
  const d = (1 - p) * 70;
  const tr =
    from === 'up' ? `translateY(${d}px)` : from === 'down' ? `translateY(${-d}px)` : from === 'left' ? `translateX(${-d}px)` : from === 'right' ? `translateX(${d}px)` : `scale(${0.9 + 0.1 * p})`;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 26,
        background: dark ? C.nightCard : C.card,
        border: `1px solid ${dark ? C.nightLine : C.line}`,
        boxShadow: dark ? '0 30px 70px -30px rgba(0,0,0,0.6)' : '0 1px 0 rgba(22,20,31,0.04), 0 26px 60px -32px rgba(22,20,31,0.32)',
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: BODY,
        opacity: Math.min(1, p * 1.4),
        transform: tr,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Label: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.inkMute, style }) => (
  <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 18, letterSpacing: 1.8, textTransform: 'uppercase', color, ...style }}>{children}</div>
);

export const Chip: React.FC<{ children: React.ReactNode; color: string; bg: string; size?: number; style?: React.CSSProperties }> = ({ children, color, bg, size = 18, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: BODY,
      fontWeight: 700,
      fontSize: size,
      color,
      background: bg,
      borderRadius: 10,
      padding: `${size * 0.28}px ${size * 0.6}px`,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </span>
);

/** Hand-drawn marker stroke under a word — draws on at `at`. */
export const Underline: React.FC<{ w: number; at: number; color?: string; dur?: number; thickness?: number }> = ({ w, at, color = C.teal, dur = 16, thickness = 7 }) => {
  const t = ease(useCurrentFrame(), at, dur, 'out');
  const d = `M 4 ${thickness + 6} C ${w * 0.3} ${thickness + 1}, ${w * 0.65} ${thickness + 11}, ${w - 4} ${thickness + 3}`;
  return (
    <svg width={w} height={thickness * 2 + 14} style={{ display: 'block', overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t} />
    </svg>
  );
};

/** Brand-colour panel that sweeps across the frame, covering a cut at `at`. */
export const Sweep: React.FC<{ at: number; color?: string; dir?: 1 | -1; len?: number }> = ({ at, color = C.indigo, dir = 1, len = 24 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (frame < at - len / 2 || frame > at + len / 2) return null;
  const t = ease(frame, at - len / 2, len, 'inOut');
  // wide enough that the skewed panel covers the whole frame at the cut (t = 0.5)
  const skew = Math.tan((12 * Math.PI) / 180) * (height / 2 + 40);
  const pad = 160 + skew;
  const panel = width + 2 * pad;
  const x = interpolate(t, [0, 1], [-1.15, 1.15]) * panel * dir;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: -40, bottom: -40, left: x - pad, width: panel, background: color, transform: 'skewX(-12deg)' }} />
    </AbsoluteFill>
  );
};

/** The SabakHub mark, built over ~0.8 s from `start` (60 fps timings). */
const SPOKES: [number, number][] = [
  [256, 126],
  [380, 216],
  [332, 361],
  [180, 361],
  [132, 216],
];
export const Mark: React.FC<{ size: number; start?: number }> = ({ size, start = -999 }) => {
  const frame = useCurrentFrame() - start;
  const tileIn = pop(frame, 0);
  const core = pop(frame, 4);
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="mk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.indigo} />
          <stop offset="1" stopColor={C.violet} />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="115" fill="url(#mk)" style={{ transform: `scale(${tileIn})`, transformOrigin: '256px 256px' }} />
      {SPOKES.map(([x, y], i) => {
        const at = 10 + i * 6;
        const draw = ease(frame, at, 14);
        const node = pop(frame, at + 10);
        const len = Math.hypot(x - 256, y - 256);
        return (
          <g key={i}>
            <line x1="256" y1="256" x2={x} y2={y} stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
            <circle cx={x} cy={y} r={i === 0 ? 29 : 26} fill={i === 0 ? C.teal : '#fff'} style={{ transform: `scale(${node})`, transformOrigin: `${x}px ${y}px` }} />
          </g>
        );
      })}
      <circle cx="256" cy="256" r="50" fill="#fff" style={{ transform: `scale(${core})`, transformOrigin: '256px 256px' }} />
    </svg>
  );
};

export const Wordmark: React.FC<{ at: number; size: number; color?: string }> = ({ at, size, color = C.ink }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', overflow: 'hidden', paddingBottom: size * 0.05 }}>
      {'SabakHub'.split('').map((ch, i) => {
        const t = ease(frame, at + i * 2.5, 22);
        return (
          <span
            key={i}
            style={{
              fontFamily: DISPLAY,
              fontWeight: 600,
              fontSize: size,
              letterSpacing: -size * 0.025,
              color: i >= 5 ? C.indigo : color,
              display: 'inline-block',
              transform: `translateY(${(1 - t) * 110}%)`,
              opacity: t,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

export const Toast: React.FC<{ at: number; x: number; y: number; w?: number; icon?: React.ReactNode; title: string; text?: string; dark?: boolean; until?: number }> = ({
  at,
  x,
  y,
  w = 520,
  icon,
  title,
  text,
  dark = true,
  until,
}) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at);
  const out = until ? ease(frame, until, 12, 'in') : 0;
  if (frame < at) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        padding: '18px 22px',
        borderRadius: 20,
        background: dark ? C.ink : C.card,
        color: dark ? C.paper : C.ink,
        border: dark ? 'none' : `1px solid ${C.line}`,
        boxShadow: '0 30px 60px -24px rgba(22,20,31,0.45)',
        fontFamily: BODY,
        opacity: Math.min(1, p * 1.5) * (1 - out),
        transform: `translateY(${(1 - p) * 40 + out * -20}px)`,
        zIndex: 20,
      }}
    >
      {icon}
      <div>
        <div style={{ fontWeight: 700, fontSize: 22 }}>{title}</div>
        {text && <div style={{ fontSize: 19, opacity: 0.75, marginTop: 4, lineHeight: 1.35 }}>{text}</div>}
      </div>
    </div>
  );
};
