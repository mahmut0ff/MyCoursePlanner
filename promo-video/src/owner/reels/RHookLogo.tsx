import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BODY, C } from '../../theme';
import { b, ease, Mark, Slam, Wordmark } from '../kit';
import { LEN, QS, Visual } from '../scenes/Hook';
import { CW, X } from './layout';

// Bars 0–2, vertical. Same four questions and cuts as the 16:9 film; the
// question owns the top half, its little visual (the landscape component,
// scaled ×1.6 — it is vector, so it stays sharp) the bottom half.

export const RHook: React.FC = () => {
  const frame = useCurrentFrame();
  const i = Math.min(QS.length - 1, Math.floor(frame / LEN));
  const f = frame - i * LEN;
  const out = ease(frame, b(7.5), b(0.5), 'in');
  const k = 1.6;
  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${1 - out * 0.06})` }}>
        <div style={{ position: 'absolute', left: X, top: 300, display: 'flex', gap: 12 }}>
          {QS.map((_, n) => (
            <span key={n} style={{ width: 216, height: 6, borderRadius: 3, background: C.nightLine, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', background: C.teal, width: `${n < i ? 100 : n === i ? 100 * ease(f, 0, LEN, 'inOut') : 0}%` }} />
            </span>
          ))}
        </div>
        <div style={{ position: 'absolute', left: X, top: 360, fontFamily: BODY, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: C.teal }}>
          ВОПРОС {String(i + 1).padStart(2, '0')} / 04
        </div>
        <div style={{ position: 'absolute', left: X, top: 430, width: CW }}>
          <Slam text={QS[i].q} at={i * LEN} size={104} color={C.paper} stagger={3} highlight={QS[i].hi} hiColor={C.teal} />
        </div>
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${X - 1250 * k}px, ${960 - 330 * k}px) scale(${k})`, transformOrigin: '0 0' }}>
          <Visual i={i} f={f} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const RLogo: React.FC = () => {
  const frame = useCurrentFrame();
  const iris = ease(frame, 0, 20, 'out');
  const push = ease(frame, b(3.2), b(0.8), 'in');
  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      <AbsoluteFill style={{ background: C.paper, clipPath: `circle(${iris * 1150}px at 540px 860px)` }}>
        <AbsoluteFill style={{ opacity: 1 - push, transform: `scale(${1 + push * 0.12})` }}>
          <div style={{ position: 'absolute', top: 470, left: 0, right: 0, textAlign: 'center', fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: 3, color: C.inkMute, opacity: ease(frame, 30, 14) }}>
            ДЛЯ ВЛАДЕЛЬЦА УЧЕБНОГО ЦЕНТРА
          </div>
          <div style={{ position: 'absolute', top: 560, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <Mark size={210} start={0} />
          </div>
          <div style={{ position: 'absolute', top: 810, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <Wordmark at={18} size={136} />
          </div>
          <div style={{ position: 'absolute', top: 1060, left: X, width: CW, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Slam text="Все ответы —" at={b(1.6)} size={80} stagger={4} align="center" />
            <Slam text="на одном экране" at={b(1.6) + 8} size={80} stagger={4} align="center" color={C.indigo} />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
