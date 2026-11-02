import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Check, Mail, Send } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { b, ease, Mark, pop, Slam, Wordmark } from '../kit';
import { ITEMS } from '../scenes/Outro';
import { CW, X } from './layout';

// Bars 26–30, vertical: the five ticks, then a stacked lockup + CTA kept
// inside the profile-grid crop (y 240–1680) so it also works as a cover.
export const ROutro: React.FC = () => {
  const frame = useCurrentFrame();
  const listOut = ease(frame, b(7.6), 16, 'in');
  const lock = ease(frame, b(8), 30, 'inOut');
  const fadeAll = ease(frame, b(19), b(1), 'inOut');
  const cta = pop(frame, b(10));
  const ring = ease(frame, 0, 40);

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, opacity: 1 - fadeAll }}>
      <div style={{ position: 'absolute', left: 540 - 520, top: 860 - 520, width: 1040, height: 1040, borderRadius: 520, border: `3px solid ${C.indigo}`, opacity: (1 - ring) * 0.3, transform: `scale(${0.2 + ring * 1.3})` }} />

      <div style={{ position: 'absolute', left: X, top: 370, width: CW, display: 'flex', flexDirection: 'column', gap: 30, opacity: 1 - listOut, transform: `translateX(${-listOut * 120}px)` }}>
        {ITEMS.map((it, i) => {
          const at = b(0.5 + i * 0.5);
          const p = pop(frame, at);
          return (
            <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 28, minHeight: 150, opacity: ease(frame, at, 8) }}>
              <span style={{ width: 92, height: 92, borderRadius: 46, background: C.teal, display: 'grid', placeItems: 'center', transform: `scale(${p})`, flexShrink: 0 }}>
                <Check size={54} color="#fff" strokeWidth={3} />
              </span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 52, lineHeight: 1.12, color: C.ink, letterSpacing: -1.2, transform: `translateX(${(1 - p) * 40}px)` }}>{it}</span>
            </div>
          );
        })}
      </div>

      {frame >= b(8) && (
        <AbsoluteFill style={{ opacity: lock }}>
          <div style={{ position: 'absolute', top: 400, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <Mark size={220} start={b(8)} />
          </div>
          <div style={{ position: 'absolute', top: 660, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <Wordmark at={b(8) + 14} size={140} />
          </div>
          <div style={{ position: 'absolute', top: 870, left: X, width: CW, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Slam text="Управляйте центром," at={b(9)} size={62} stagger={4} align="center" />
            <Slam text="а не таблицами" at={b(9) + 10} size={62} stagger={4} align="center" color={C.indigo} />
          </div>
          <div style={{ position: 'absolute', top: 1090, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, fontFamily: BODY, opacity: Math.min(1, cta * 1.5), transform: `translateY(${(1 - cta) * 30}px)` }}>
            <span style={{ padding: '28px 54px', borderRadius: 26, background: C.indigo, color: '#fff', fontWeight: 700, fontSize: 40 }}>Покажем за 15 минут</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 36, fontWeight: 600, color: C.ink }}>
              <Send size={36} color={C.tealDeep} /> @sabakhub_bot
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 34, fontWeight: 600, color: C.inkSoft, marginTop: -10 }}>
              <Mail size={34} color={C.tealDeep} /> hello@sabakhub.kg
            </span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
