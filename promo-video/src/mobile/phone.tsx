import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { BookOpen, CalendarDays, ChevronLeft, Home, LayoutGrid, LucideIcon, Wallet, Wifi } from 'lucide-react';
import { BODY, C, DISPLAY } from '../theme';
import { ease, pop } from './kit';

/* ── device geometry ─────────────────────────────────────────────────────── */
export const PW = 480;
export const PH = 990;
export const BEZEL = 12;
export const SW = PW - BEZEL * 2; // 456
export const SH = PH - BEZEL * 2; // 966
export const STATUS_H = 54;
export const TAB_H = 92;
export const CONTENT_H = SH - STATUS_H - TAB_H;

/* ── device shell ────────────────────────────────────────────────────────── */
export const Device: React.FC<{ children?: React.ReactNode; screenBg?: string; style?: React.CSSProperties }> = ({ children, screenBg = C.paper, style }) => (
  <div style={{ position: 'relative', width: PW, height: PH, ...style }}>
    {/* side buttons */}
    <div style={{ position: 'absolute', left: -3, top: 190, width: 3, height: 36, borderRadius: 2, background: '#2A2734' }} />
    <div style={{ position: 'absolute', left: -3, top: 260, width: 3, height: 70, borderRadius: 2, background: '#2A2734' }} />
    <div style={{ position: 'absolute', left: -3, top: 346, width: 3, height: 70, borderRadius: 2, background: '#2A2734' }} />
    <div style={{ position: 'absolute', right: -3, top: 290, width: 3, height: 110, borderRadius: 2, background: '#2A2734' }} />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 64,
        background: 'linear-gradient(160deg, #1C1927 0%, #0B0A10 55%, #14121C 100%)',
        boxShadow: '0 60px 120px -40px rgba(0,0,0,0.75), 0 24px 50px -30px rgba(0,0,0,0.5), inset 0 0 0 2px #2E2A3A, inset 0 0 0 4px #0B0A10',
      }}
    />
    <div style={{ position: 'absolute', left: BEZEL, top: BEZEL, width: SW, height: SH, borderRadius: 52, overflow: 'hidden', background: screenBg }}>{children}</div>
    {/* dynamic island */}
    <div style={{ position: 'absolute', left: PW / 2 - 60, top: BEZEL + 12, width: 120, height: 35, borderRadius: 18, background: '#0B0A10' }} />
    {/* glass highlight */}
    <div style={{ position: 'absolute', inset: 0, borderRadius: 64, pointerEvents: 'none', background: 'linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 28%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.05) 100%)' }} />
  </div>
);

export const StatusBar: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const ink = dark ? '#fff' : C.ink;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: STATUS_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 30px 0', fontFamily: BODY, color: ink, boxSizing: 'border-box' }}>
      <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: -0.2 }}>9:41</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
          {[6, 9, 12, 15].map((h) => (
            <span key={h} style={{ width: 3.5, height: h, borderRadius: 1, background: ink }} />
          ))}
        </span>
        <Wifi size={17} color={ink} strokeWidth={2.4} />
        <span style={{ width: 27, height: 13, borderRadius: 4, border: `1.6px solid ${ink}`, padding: 2, boxSizing: 'border-box', opacity: 0.9 }}>
          <span style={{ display: 'block', height: '100%', width: '82%', borderRadius: 1.5, background: ink }} />
        </span>
      </span>
    </div>
  );
};

/* ── tab bar ─────────────────────────────────────────────────────────────── */
const TABS: [string, LucideIcon][] = [
  ['Главная', Home],
  ['Журнал', BookOpen],
  ['Расписание', CalendarDays],
  ['Финансы', Wallet],
  ['Ещё', LayoutGrid],
];

export const TabBar: React.FC<{ active: number }> = ({ active }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: TAB_H, background: 'rgba(255,255,255,0.96)', borderTop: `1px solid ${C.line}`, display: 'flex', padding: '8px 10px 0', boxSizing: 'border-box' }}>
    {TABS.map(([label, Icon], i) => {
      const on = Math.round(active) === i;
      const near = Math.max(0, 1 - Math.abs(active - i));
      return (
        <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: BODY }}>
          <span style={{ width: 56, height: 32, borderRadius: 16, background: `rgba(79,70,229,${0.12 * near})`, display: 'grid', placeItems: 'center' }}>
            <Icon size={22} color={on ? C.indigo : C.inkMute} strokeWidth={on ? 2.4 : 2} />
          </span>
          <span style={{ fontSize: 11.5, fontWeight: on ? 700 : 500, color: on ? C.indigo : C.inkMute }}>{label}</span>
        </div>
      );
    })}
    <div style={{ position: 'absolute', left: SW / 2 - 62, bottom: 9, width: 124, height: 5, borderRadius: 3, background: C.ink, opacity: 0.85 }} />
  </div>
);

/* ── screen stack with transitions ──────────────────────────────────────── */
export type ScreenItem = {
  at: number;
  tab: number;
  kind?: 'push' | 'fade' | 'launch';
  dark?: boolean;
  screen: React.FC<{ at: number }>;
};

const TR = 26;

export const Screens: React.FC<{ items: ScreenItem[] }> = ({ items }) => {
  const frame = useCurrentFrame();
  const i = Math.max(0, items.filter((s) => s.at <= frame).length - 1);
  const cur = items[i];
  const prev = i > 0 ? items[i - 1] : undefined;
  const t = ease(frame, cur.at, TR, 'inOut');
  const kind = cur.kind ?? 'push';
  const Cur = cur.screen;
  const Prev = prev?.screen;
  // the active pill glides between neighbouring tabs; a jump across the bar just switches halfway
  const tab = prev && t < 1 ? (Math.abs(prev.tab - cur.tab) <= 1 ? interpolate(t, [0, 1], [prev.tab, cur.tab]) : t < 0.5 ? prev.tab : cur.tab) : cur.tab;
  const dark = prev && t < 0.5 ? !!prev.dark : !!cur.dark;
  const tabOpacity = cur.dark ? 0 : prev?.dark ? ease(frame, cur.at + 6, 16) : 1;

  let curStyle: React.CSSProperties = {};
  let prevStyle: React.CSSProperties = {};
  if (kind === 'push') {
    curStyle = { transform: `translateX(${(1 - t) * 100}%)`, boxShadow: t < 1 ? '-20px 0 40px rgba(22,20,31,0.18)' : undefined };
    prevStyle = { transform: `translateX(${-t * 30}%)` };
  } else if (kind === 'fade') {
    curStyle = { opacity: t, transform: `scale(${0.97 + 0.03 * t})` };
    prevStyle = { opacity: 1 - t };
  } else {
    curStyle = { opacity: Math.min(1, t * 1.6), transform: `scale(${0.55 + 0.45 * t})`, borderRadius: 52 * (1 - t) };
    prevStyle = { opacity: 1 - t, transform: `scale(${1 + 0.12 * t})` };
  }

  return (
    <>
      {Prev && t < 1 && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...prevStyle }}>
          <Prev at={prev!.at} />
          {kind === 'push' && <div style={{ position: 'absolute', inset: 0, background: `rgba(22,20,31,${0.25 * t})` }} />}
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: cur.dark ? C.night : C.paper, ...curStyle }}>
        <Cur at={cur.at} />
      </div>
      <StatusBar dark={dark} />
      {tabOpacity > 0 && (
        <div style={{ position: 'absolute', inset: 0, opacity: tabOpacity, pointerEvents: 'none' }}>
          <TabBar active={tab} />
        </div>
      )}
    </>
  );
};

/* ── in-app atoms ────────────────────────────────────────────────────────── */
export const Content: React.FC<{ children: React.ReactNode; pad?: number; style?: React.CSSProperties }> = ({ children, pad = 18, style }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: STATUS_H, bottom: TAB_H, padding: `0 ${pad}px`, boxSizing: 'border-box', overflow: 'hidden', fontFamily: BODY, ...style }}>{children}</div>
);

export const AppBar: React.FC<{ title: string; sub?: string; back?: boolean; right?: React.ReactNode; at?: number; big?: boolean }> = ({ title, sub, back, right, at = 0, big }) => {
  const frame = useCurrentFrame();
  const t = ease(frame, at + 2, 16);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0 14px', opacity: t, transform: `translateY(${(1 - t) * -8}px)` }}>
      {back && (
        <span style={{ width: 36, height: 36, borderRadius: 18, background: '#fff', border: `1px solid ${C.line}`, display: 'grid', placeItems: 'center', marginRight: 2 }}>
          <ChevronLeft size={20} color={C.ink} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: big ? DISPLAY : BODY, fontWeight: 700, fontSize: big ? 27 : 24, color: C.ink, letterSpacing: big ? -0.6 : -0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {sub && <div style={{ fontSize: 15.5, color: C.inkMute, marginTop: 3, whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
};

export const MCard: React.FC<{ at?: number; children: React.ReactNode; style?: React.CSSProperties; tone?: string; flat?: boolean }> = ({ at = 0, children, style, tone = '#fff', flat }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at, false);
  return (
    <div
      style={{
        background: tone,
        borderRadius: 22,
        border: `1px solid ${C.line}`,
        boxShadow: flat ? 'none' : '0 1px 0 rgba(22,20,31,0.03), 0 10px 24px -18px rgba(22,20,31,0.25)',
        padding: '16px 18px',
        boxSizing: 'border-box',
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${(1 - p) * 26}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Pill: React.FC<{ color: string; bg: string; children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ color, bg, children, size = 13.5, style }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: BODY, fontWeight: 700, fontSize: size, color, background: bg, borderRadius: 9, padding: `${size * 0.32}px ${size * 0.65}px`, whiteSpace: 'nowrap', ...style }}>
    {children}
  </span>
);

export const Seg: React.FC<{ items: string[]; active: number; at?: number }> = ({ items, active, at = 0 }) => {
  const frame = useCurrentFrame();
  const t = ease(frame, at + 4, 14);
  return (
    <div style={{ display: 'flex', background: C.paperDeep, borderRadius: 13, padding: 4, gap: 2, opacity: t, position: 'relative' }}>
      {items.map((s, i) => (
        <span key={s} style={{ flex: 1, textAlign: 'center', fontSize: 14.5, fontWeight: 700, color: i === active ? C.ink : C.inkMute, padding: '8px 0', borderRadius: 10, background: i === active ? '#fff' : 'transparent', boxShadow: i === active ? '0 1px 3px rgba(22,20,31,0.12)' : 'none', whiteSpace: 'nowrap' }}>
          {s}
        </span>
      ))}
    </div>
  );
};

export const PrimaryButton: React.FC<{ children: React.ReactNode; at?: number; pressAt?: number; color?: string; style?: React.CSSProperties }> = ({ children, at = 0, pressAt, color = C.indigo, style }) => {
  const frame = useCurrentFrame();
  const t = ease(frame, at, 14);
  const press = pressAt !== undefined ? ease(frame, pressAt, 5) * (1 - ease(frame, pressAt + 5, 8)) : 0;
  return (
    <div style={{ background: color, color: '#fff', borderRadius: 16, padding: '15px 0', textAlign: 'center', fontFamily: BODY, fontWeight: 700, fontSize: 17, opacity: t, transform: `scale(${1 - 0.04 * press})`, boxShadow: `0 10px 24px -12px ${color}`, ...style }}>
      {children}
    </div>
  );
};

export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode; at?: number; style?: React.CSSProperties }> = ({ children, right, at = 0, style }) => {
  const t = ease(useCurrentFrame(), at, 14);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 2px 10px', opacity: t, ...style }}>
      <span style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>{children}</span>
      {right && <span style={{ fontSize: 14, fontWeight: 600, color: C.indigo }}>{right}</span>}
    </div>
  );
};

/** In-app toast that rises from the bottom of the content area. */
export const Toast: React.FC<{ at: number; icon?: React.ReactNode; title: string; text?: string; until?: number; tone?: string }> = ({ at, icon, title, text, until, tone = C.ink }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const p = pop(frame, at);
  const out = until ? ease(frame, until, 12, 'in') : 0;
  return (
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: TAB_H + 14, display: 'flex', gap: 12, alignItems: 'center', padding: '13px 16px', borderRadius: 18, background: tone, color: '#fff', fontFamily: BODY, boxShadow: '0 20px 40px -18px rgba(22,20,31,0.6)', opacity: Math.min(1, p * 1.5) * (1 - out), transform: `translateY(${(1 - p) * 40 + out * 20}px)`, zIndex: 5 }}>
      {icon}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{title}</div>
        {text && <div style={{ fontSize: 13.5, opacity: 0.8, marginTop: 2 }}>{text}</div>}
      </div>
    </div>
  );
};

/** Push-notification banner sliding down from under the island. */
export const Banner: React.FC<{ at: number; title: string; text: string; until?: number }> = ({ at, title, text, until }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const p = pop(frame, at);
  const out = until ? ease(frame, until, 14, 'in') : 0;
  return (
    <div style={{ position: 'absolute', left: 12, right: 12, top: STATUS_H + 6, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', border: `1px solid ${C.line}`, boxShadow: '0 16px 36px -16px rgba(22,20,31,0.45)', fontFamily: BODY, opacity: Math.min(1, p * 1.5) * (1 - out), transform: `translateY(${(1 - p) * -60 - out * 40}px)`, zIndex: 6 }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${C.indigo}, ${C.violet})`, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.inkMute }}>
          <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>SABAKHUB</span>
          <span>сейчас</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, marginTop: 1 }}>{title}</div>
        <div style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.3 }}>{text}</div>
      </div>
    </div>
  );
};

export const Row: React.FC<{ at?: number; children: React.ReactNode; style?: React.CSSProperties; last?: boolean }> = ({ at = 0, children, style, last }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at, false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: last ? 'none' : `1px solid ${C.line}`, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 18}px)`, ...style }}>{children}</div>
  );
};
