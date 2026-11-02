import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { BODY, C, DISPLAY, ease, pop } from '../theme';

/* ── backgrounds ─────────────────────────────────────────────────────────── */

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

export const Paper: React.FC<{ tone?: string; dots?: boolean; children?: React.ReactNode }> = ({
  tone = C.paper,
  dots = false,
  children,
}) => (
  <AbsoluteFill style={{ backgroundColor: tone }}>
    {dots && (
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${C.line} 1.6px, transparent 1.6px)`,
          backgroundSize: '36px 36px',
          opacity: 0.7,
        }}
      />
    )}
    {children}
  </AbsoluteFill>
);

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.07 }) => (
  <AbsoluteFill style={{ backgroundImage: GRAIN, opacity, mixBlendMode: 'multiply', pointerEvents: 'none' }} />
);

/* ── logo ────────────────────────────────────────────────────────────────── */

const SPOKES: [number, number][] = [
  [256, 126],
  [380, 216],
  [332, 361],
  [180, 361],
  [132, 216],
];

/**
 * The SabakHub mark, buildable over time. `t` timings are frames relative to
 * `start`; pass `start = -999` to draw it fully built.
 */
export const LogoMark: React.FC<{ size: number; start?: number; tile?: boolean }> = ({
  size,
  start = -999,
  tile = true,
}) => {
  const frame = useCurrentFrame() - start;
  const tileIn = pop(frame, 0);
  const core = pop(frame, 2);
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.indigo} />
          <stop offset="1" stopColor={C.violet} />
        </linearGradient>
      </defs>
      {tile && (
        <rect
          width="512"
          height="512"
          rx="115"
          fill="url(#lg)"
          style={{ transform: `scale(${tileIn})`, transformOrigin: '256px 256px' }}
        />
      )}
      {SPOKES.map(([x, y], i) => {
        const at = 6 + i * 6;
        const draw = ease(frame, at, 9);
        const node = pop(frame, at + 6);
        const len = Math.hypot(x - 256, y - 256);
        return (
          <g key={i}>
            <line
              x1="256"
              y1="256"
              x2={x}
              y2={y}
              stroke="#fff"
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={len * (1 - draw)}
            />
            <circle
              cx={x}
              cy={y}
              r={i === 0 ? 29 : 26}
              fill={i === 0 ? C.teal : '#fff'}
              style={{ transform: `scale(${node})`, transformOrigin: `${x}px ${y}px` }}
            />
          </g>
        );
      })}
      <circle cx="256" cy="256" r="50" fill="#fff" style={{ transform: `scale(${core})`, transformOrigin: '256px 256px' }} />
    </svg>
  );
};

export const BrandBug: React.FC<{ opacity?: number; dark?: boolean }> = ({ opacity = 1, dark }) => (
  <div style={{ position: 'absolute', left: 110, top: 52, display: 'flex', alignItems: 'center', gap: 14, opacity }}>
    <LogoMark size={40} />
    <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, color: dark ? C.paper : C.ink, letterSpacing: -0.3 }}>
      SabakHub
    </span>
  </div>
);

/* ── text ────────────────────────────────────────────────────────────────── */

/** Lines that rise out of a mask, one after another. */
export const RiseText: React.FC<{
  lines: string[];
  at: number;
  stagger?: number;
  size: number;
  color?: string;
  weight?: number;
  family?: string;
  lineHeight?: number;
  tracking?: number;
}> = ({ lines, at, stagger = 4, size, color = C.ink, weight = 600, family = DISPLAY, lineHeight = 1.12, tracking = -1 }) => {
  const frame = useCurrentFrame();
  return (
    <div>
      {lines.map((l, i) => {
        const t = ease(frame, at + i * stagger, 16);
        return (
          <div key={i} style={{ overflow: 'hidden', paddingBottom: size * 0.08 }}>
            <div
              style={{
                fontFamily: family,
                fontWeight: weight,
                fontSize: size,
                lineHeight,
                color,
                letterSpacing: tracking,
                transform: `translateY(${(1 - t) * 105}%)`,
                opacity: interpolate(t, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
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

export const FadeUp: React.FC<{ at: number; dist?: number; dur?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  at,
  dist = 18,
  dur = 14,
  style,
  children,
}) => {
  const t = ease(useCurrentFrame(), at, dur);
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * dist}px)`, ...style }}>{children}</div>;
};

export const Kicker: React.FC<{ n: string; label: string; at: number; dark?: boolean }> = ({ n, label, at, dark }) => {
  const frame = useCurrentFrame();
  const t = ease(frame, at, 14);
  const w = ease(frame, at + 2, 18);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: t, marginBottom: 28 }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 22, color: dark ? C.teal : C.indigo }}>{n}</span>
      <span style={{ width: 56 * w, height: 2, background: dark ? C.teal : C.indigo, opacity: 0.6 }} />
      <span
        style={{
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: 2.5,
          textTransform: 'uppercase',
          color: dark ? '#B9B4C7' : C.inkSoft,
        }}
      >
        {label}
      </span>
    </div>
  );
};

/** Left-column caption used by the feature scenes. */
export const Caption: React.FC<{
  n: string;
  label: string;
  title: string[];
  body: string;
  bullets?: { text: string; at: number }[];
  at?: number;
  dark?: boolean;
  width?: number;
  titleSize?: number;
}> = ({ n, label, title, body, bullets = [], at = 0, dark, width = 560, titleSize = 58 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 110, top: 0, bottom: 0, width, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Kicker n={n} label={label} at={at} dark={dark} />
      <RiseText lines={title} at={at + 3} size={titleSize} color={dark ? C.paper : C.ink} />
      <FadeUp at={at + 14} style={{ marginTop: 26 }}>
        <div style={{ fontFamily: BODY, fontSize: 28, lineHeight: 1.45, color: dark ? '#C9C4D6' : C.inkSoft, maxWidth: width }}>{body}</div>
      </FadeUp>
      <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {bullets.map((b, i) => {
          const p = pop(frame, b.at);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                opacity: Math.min(1, p * 1.5),
                transform: `translateX(${(1 - p) * -24}px)`,
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  background: dark ? 'rgba(20,184,166,0.18)' : C.tealSoft,
                  color: dark ? C.teal : C.tealDeep,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: BODY,
                }}
              >
                ✓
              </span>
              <span style={{ fontFamily: BODY, fontWeight: 500, fontSize: 25, color: dark ? C.paper : C.ink }}>{b.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── app chrome ──────────────────────────────────────────────────────────── */

export const Window: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  at?: number;
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  dark?: boolean;
}> = ({ x, y, w, h, at = 0, title, right, children, dark }) => {
  const frame = useCurrentFrame();
  const t = pop(frame, at, false);
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
        boxShadow: '0 1px 0 rgba(22,20,31,0.04), 0 30px 80px -30px rgba(22,20,31,0.28), 0 12px 30px -18px rgba(22,20,31,0.18)',
        border: `1px solid ${dark ? C.nightLine : C.line}`,
        overflow: 'hidden',
        opacity: t,
        transform: `translateY(${(1 - t) * 60}px) scale(${0.97 + 0.03 * t})`,
      }}
    >
      {title !== undefined && (
        <div
          style={{
            height: 74,
            borderBottom: `1px solid ${dark ? C.nightLine : C.line}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 28px',
            gap: 18,
            fontFamily: BODY,
          }}
        >
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 18 }}>{title}</div>
          {right}
        </div>
      )}
      <div style={{ position: 'relative', height: title !== undefined ? h - 74 : h }}>{children}</div>
    </div>
  );
};

export const Tab: React.FC<{ active?: boolean; children: React.ReactNode }> = ({ active, children }) => (
  <span
    style={{
      fontFamily: BODY,
      fontWeight: 600,
      fontSize: 20,
      padding: '9px 18px',
      borderRadius: 12,
      background: active ? C.indigoSoft : 'transparent',
      color: active ? C.indigoDeep : C.inkMute,
    }}
  >
    {children}
  </span>
);

export const Avatar: React.FC<{ name: string; color: string; size?: number; ring?: string }> = ({ name, color, size = 34, ring }) => {
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('');
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: color,
        color: '#fff',
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: size * 0.38,
        display: 'inline-grid',
        placeItems: 'center',
        flexShrink: 0,
        boxShadow: ring ? `0 0 0 3px ${ring}` : undefined,
      }}
    >
      {initials}
    </span>
  );
};

/* ── cursor ──────────────────────────────────────────────────────────────── */

export type CursorKey = { f: number; x: number; y: number; click?: boolean };

/** Pointer that eases between keyframes; `click: true` shows a press + ripple. */
export const Cursor: React.FC<{ keys: CursorKey[]; show?: [number, number]; dark?: boolean }> = ({ keys, show, dark }) => {
  const frame = useCurrentFrame();
  let x = keys[0].x;
  let y = keys[0].y;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame >= a.f && frame <= b.f) {
      const t = ease(frame, a.f, b.f - a.f, 'inOut');
      x = a.x + (b.x - a.x) * t;
      y = a.y + (b.y - a.y) * t;
    } else if (frame > b.f) {
      x = b.x;
      y = b.y;
    }
  }
  const visible = show ? ease(frame, show[0], 6) * (1 - ease(frame, show[1], 6)) : 1;
  const clicks = keys.filter((k) => k.click);
  const pressed = clicks.some((k) => frame >= k.f && frame < k.f + 5);
  return (
    <>
      {clicks.map((k, i) => {
        const r = ease(frame, k.f, 16);
        if (frame < k.f || r >= 1) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: k.x - 30,
              top: k.y - 30,
              width: 60,
              height: 60,
              borderRadius: 30,
              border: `3px solid ${C.indigo}`,
              opacity: (1 - r) * 0.7 * visible,
              transform: `scale(${0.3 + r})`,
            }}
          />
        );
      })}
      <svg
        width="44"
        height="44"
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: x - 6,
          top: y - 3,
          opacity: visible,
          transform: `scale(${pressed ? 0.86 : 1})`,
          transformOrigin: '6px 3px',
          filter: 'drop-shadow(0 4px 6px rgba(22,20,31,0.3))',
        }}
      >
        <path
          d="M5 2.5 L5 19.5 L9.6 15.3 L12.6 21.6 L15.4 20.3 L12.4 14.1 L18.6 14.1 Z"
          fill={dark ? C.paper : C.ink}
          stroke={dark ? C.ink : '#fff'}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};
