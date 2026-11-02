import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BODY, C, DISPLAY } from '../../theme';
import { BAR, Mark, SECTIONS, Sweep, b, cueAt, ease } from '../kit';
import { RHook, RLogo } from './RHookLogo';
import { RFinance } from './RFinance';
import { RPayroll } from './RPayroll';
import { RReminders } from './RReminders';
import { RControl } from './RControl';
import { RMigration } from './RMigration';
import { ROutro } from './ROutro';
import { CW, Guides, X } from './layout';

// «SabakHub для владельца» for Instagram Reels — 1080×1920 @ 60 fps.
// Same soundtrack, same cues.json, same section bars as the 16:9 film;
// only the layouts are rebuilt for a phone held upright.

const seq = (k: string) => ({ from: SECTIONS[k][0] * BAR, durationInFrames: SECTIONS[k][1] * BAR });

const NAV: [string, string][] = [
  ['finance', 'Финансы'],
  ['payroll', 'Зарплата'],
  ['reminders', 'Оплаты'],
  ['control', 'Контроль'],
  ['migration', 'Переезд'],
];

const Chrome: React.FC = () => {
  const frame = useCurrentFrame();
  const start = SECTIONS.finance[0] * BAR;
  const end = SECTIONS.outro[0] * BAR;
  const vis = ease(frame, start + 8, 16) * (1 - ease(frame, end - 14, 12));
  if (vis <= 0) return null;
  const active = NAV.findIndex(([k]) => {
    const [s, len] = SECTIONS[k];
    return frame >= s * BAR && frame < (s + len) * BAR;
  });
  const dark = NAV[active]?.[0] === 'reminders';
  const ink = dark ? C.paper : C.ink;
  const payroll = SECTIONS.payroll[0] * BAR;
  const hide = ease(frame, payroll + cueAt('tok1', 'payroll') - 14, 10) * (1 - ease(frame, payroll + b(12) - 2, 8));
  const o = vis * (1 - hide);
  const bg = dark ? '22,20,31' : '247,245,240';
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 345, background: `linear-gradient(to bottom, rgba(${bg},1) 0%, rgba(${bg},0.97) 80%, rgba(${bg},0) 100%)`, opacity: o }} />
      <div style={{ position: 'absolute', left: X, top: 236, width: CW, display: 'flex', alignItems: 'center', gap: 14, opacity: o }}>
        <Mark size={50} />
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 30, color: ink, letterSpacing: -0.4 }}>SabakHub</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 26, color: dark ? C.night : C.paper, background: dark ? C.teal : C.ink, borderRadius: 14, padding: '8px 18px' }}>
          {NAV[active]?.[1]} <span style={{ opacity: 0.6 }}>· {active + 1}/5</span>
        </span>
      </div>
      <div style={{ position: 'absolute', left: X, top: 306, width: CW, display: 'flex', gap: 10, opacity: o }}>
        {NAV.map(([k], i) => (
          <span key={k} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= active ? (dark ? C.teal : C.indigo) : dark ? C.nightLine : C.line }} />
        ))}
      </div>
    </>
  );
};

export const ReelsPromo: React.FC<{ guides?: boolean }> = ({ guides }) => (
  <AbsoluteFill style={{ backgroundColor: C.paper }}>
    <Audio src={staticFile('music-owner.wav')} />
    <Sequence {...seq('hook')}>
      <RHook />
    </Sequence>
    <Sequence {...seq('logo')}>
      <RLogo />
    </Sequence>
    <Sequence {...seq('finance')}>
      <RFinance />
    </Sequence>
    <Sequence {...seq('payroll')}>
      <RPayroll />
    </Sequence>
    <Sequence {...seq('reminders')}>
      <RReminders />
    </Sequence>
    <Sequence {...seq('control')}>
      <RControl />
    </Sequence>
    <Sequence {...seq('migration')}>
      <RMigration />
    </Sequence>
    <Sequence {...seq('outro')}>
      <ROutro />
    </Sequence>
    <Chrome />
    <Sweep at={SECTIONS.payroll[0] * BAR} color={C.indigo} />
    <Sweep at={SECTIONS.control[0] * BAR} color={C.teal} dir={-1} />
    <Sweep at={SECTIONS.migration[0] * BAR} color={C.indigo} />
    {guides && <Guides />}
  </AbsoluteFill>
);

/** 1080×1920 cover for the Reel; the text sits inside the 3:4 grid crop. */
export const ReelsCover: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.night }}>
    <AbsoluteFill style={{ background: 'radial-gradient(900px 900px at 50% 45%, rgba(79,70,229,0.22), transparent 70%)' }} />
    <div style={{ position: 'absolute', top: 400, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <Mark size={170} />
    </div>
    <div style={{ position: 'absolute', top: 630, left: 0, right: 0, textAlign: 'center', fontFamily: BODY, fontWeight: 700, fontSize: 32, letterSpacing: 4, color: C.teal }}>
      SABAKHUB ДЛЯ ВЛАДЕЛЬЦА
    </div>
    <div style={{ position: 'absolute', top: 720, left: X, width: CW, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 104, lineHeight: 1.06, letterSpacing: -3, color: C.paper }}>
      Зарплата, долги и прибыль — <span style={{ color: C.teal }}>на одном экране</span>
    </div>
    <div style={{ position: 'absolute', top: 1420, left: 0, right: 0, textAlign: 'center', fontFamily: BODY, fontWeight: 600, fontSize: 34, color: '#B9B4C7' }}>
      Учебный центр под контролем
    </div>
  </AbsoluteFill>
);
