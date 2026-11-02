import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, Trophy } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { cueAt, ease, pop } from '../kit';
import { AppBar, Content, MCard, Pill, PrimaryButton } from '../phone';

// Jury scoring for the contest module (in development): four criteria scored
// on taps (sc1…sc4), the total counts up, the score is sent and stamped.

export const CRITERIA: [string, number][] = [
  ['Идея и новизна', 8],
  ['Реализация', 9],
  ['Презентация', 7],
  ['Командная работа', 8],
];

export const Contest: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const sc = (i: number) => cueAt(`sc${i + 1}`);
  const send = cueAt('scSend');
  const scored = cueAt('scored');
  const stamp = pop(frame, scored);
  const sum = CRITERIA.reduce((acc, [, v], i) => acc + (frame >= sc(i) ? v : 0), 0);
  return (
    <Content>
      <AppBar at={at + 4} back title="Келечек инженерлери — 2026" sub="Жюри · категория 12–14 лет" right={<Pill color={C.inkSoft} bg={C.paperDeep}>7 / 18</Pill>} />
      <MCard at={at + 12} style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, background: C.amberSoft, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, color: C.amber }}>07</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>«Умная теплица»</div>
            <div style={{ fontSize: 13.5, color: C.inkMute, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Айдан Б., Тимур К., Алина С.</div>
          </div>
          <Pill color={C.plum} bg={C.plumSoft} size={12}>Робототехника</Pill>
        </div>
      </MCard>

      <MCard at={at + 22} style={{ padding: '6px 16px', marginTop: 12 }}>
        {CRITERIA.map(([n, v], i) => {
          const on = frame >= sc(i);
          const p = pop(frame, sc(i));
          return (
            <div key={n} style={{ padding: '11px 0', borderBottom: i < CRITERIA.length - 1 ? `1px solid ${C.line}` : 'none', fontFamily: BODY }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: C.ink }}>{n}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, color: on ? C.indigoDeep : C.inkMute, transform: `scale(${on ? 0.8 + 0.2 * p : 1})` }}>{on ? v : '—'}</span>
                <span style={{ fontSize: 12.5, color: C.inkMute, marginLeft: 3 }}>/10</span>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                {Array.from({ length: 10 }, (_, k) => {
                  const lit = on && k < v;
                  const d = ease(frame, sc(i) + k * 1.5, 6);
                  return <span key={k} style={{ flex: 1, height: 10, borderRadius: 5, background: lit ? C.indigo : C.paperDeep, opacity: lit ? 0.5 + 0.5 * d : 1, transform: `scaleY(${lit ? 0.6 + 0.4 * d : 1})` }} />;
                })}
              </div>
            </div>
          );
        })}
      </MCard>

      <div style={{ display: 'flex', alignItems: 'center', margin: '14px 4px 0', fontFamily: BODY, opacity: ease(frame, sc(0), 12) }}>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: C.ink }}>Итого</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 26, color: C.indigoDeep }}>{sum}</span>
        <span style={{ fontSize: 14, color: C.inkMute, marginLeft: 4 }}>/ 40</span>
      </div>
      <PrimaryButton at={sc(3) + 16} pressAt={send} color={frame >= scored ? C.tealDeep : C.indigo} style={{ marginTop: 12 }}>
        {frame >= scored ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Check size={18} /> Оценка отправлена
          </span>
        ) : (
          'Отправить оценку'
        )}
      </PrimaryButton>

      {frame >= scored && (
        <div style={{ position: 'absolute', right: 26, top: 300, padding: '8px 18px', border: `4px solid ${C.tealDeep}`, borderRadius: 12, color: C.tealDeep, fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, letterSpacing: 2, textTransform: 'uppercase', background: 'rgba(255,255,255,0.75)', transform: `rotate(-9deg) scale(${0.6 + 0.4 * stamp})`, opacity: Math.min(1, stamp * 1.5) }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={22} /> Оценено
          </span>
        </div>
      )}
    </Content>
  );
};
