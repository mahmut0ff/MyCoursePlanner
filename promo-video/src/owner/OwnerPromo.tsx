import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BODY, C, DISPLAY } from '../theme';
import { BAR, Mark, SECTIONS, Sweep, b, cueAt, ease } from './kit';
import { Hook } from './scenes/Hook';
import { Logo } from './scenes/Logo';
import { Finance } from './scenes/Finance';
import { Payroll } from './scenes/Payroll';
import { Reminders } from './scenes/Reminders';
import { Control } from './scenes/Control';
import { Migration } from './scenes/Migration';
import { Outro } from './scenes/Outro';

// «SabakHub для владельца» — 62 s, 1920×1080 @ 60 fps. Every section starts
// on a downbeat of music/make_owner_track.py; both read src/owner/cues.json.
export const OWNER_TOTAL = 31 * BAR;

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
  // step aside while the payroll modal is zoomed in on its formula
  const payroll = SECTIONS.payroll[0] * BAR;
  const hide = ease(frame, payroll + cueAt('tok1', 'payroll') - 14, 10) * (1 - ease(frame, payroll + b(12) - 2, 8));
  const o = vis * (1 - hide);
  const bg = dark ? '22,20,31' : '247,245,240';
  return (
    <>
      {/* header band so zoomed product shots slide *under* the chrome */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 130,
          background: `linear-gradient(to bottom, rgba(${bg},1) 0%, rgba(${bg},0.96) 62%, rgba(${bg},0) 100%)`,
          opacity: o,
        }}
      />
      <div style={{ position: 'absolute', left: 110, top: 46, display: 'flex', alignItems: 'center', gap: 14, opacity: o }}>
        <Mark size={42} />
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 25, color: ink, letterSpacing: -0.4 }}>SabakHub</span>
      </div>
      <div style={{ position: 'absolute', right: 110, top: 52, display: 'flex', gap: 30, opacity: o, fontFamily: BODY }}>
        {NAV.map(([k, label], i) => {
          const on = i === active;
          return (
            <div key={k} style={{ position: 'relative', fontWeight: 600, fontSize: 21, color: on ? ink : dark ? '#8E89A0' : C.inkMute }}>
              {label}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: -10,
                  height: 3,
                  borderRadius: 2,
                  background: dark ? C.teal : C.indigo,
                  transform: `scaleX(${on ? 1 : 0})`,
                  transformOrigin: 'left',
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
};

export const OwnerPromo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.paper }}>
    <Audio src={staticFile('music-owner.wav')} />
    <Sequence {...seq('hook')}>
      <Hook />
    </Sequence>
    <Sequence {...seq('logo')}>
      <Logo />
    </Sequence>
    <Sequence {...seq('finance')}>
      <Finance />
    </Sequence>
    <Sequence {...seq('payroll')}>
      <Payroll />
    </Sequence>
    <Sequence {...seq('reminders')}>
      <Reminders />
    </Sequence>
    <Sequence {...seq('control')}>
      <Control />
    </Sequence>
    <Sequence {...seq('migration')}>
      <Migration />
    </Sequence>
    <Sequence {...seq('outro')}>
      <Outro />
    </Sequence>
    <Chrome />
    {/* brand-colour sweeps hide the hard cuts between sections (on the whooshes) */}
    <Sweep at={SECTIONS.payroll[0] * BAR} color={C.indigo} />
    <Sweep at={SECTIONS.control[0] * BAR} color={C.teal} dir={-1} />
    <Sweep at={SECTIONS.migration[0] * BAR} color={C.indigo} />
  </AbsoluteFill>
);
