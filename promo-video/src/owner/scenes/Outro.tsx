import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Check, Mail, Send } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { b, ease, Mark, pop, Slam, Wordmark } from '../kit';

// Bars 26–30: impact, the five answers to the hook's questions tick off on
// the pops, then the lockup and the call to action over the ringing chord.
export const ITEMS = ['Финансы и прибыль — на одном экране', 'Зарплата считается автоматически', 'Напоминания в WhatsApp и Telegram', 'KPI учителей и ученики в зоне риска', 'Переезд данных — берём на себя'];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const listOut = ease(frame, b(7.6), 16, 'in');
  const lock = ease(frame, b(8), 30, 'inOut');
  const fadeAll = ease(frame, b(19), b(1), 'inOut');
  const cta = pop(frame, b(10));
  const ring = ease(frame, 0, 40);

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, opacity: 1 - fadeAll }}>
      <div
        style={{
          position: 'absolute',
          left: 960 - 420,
          top: 540 - 420,
          width: 840,
          height: 840,
          borderRadius: 420,
          border: `2px solid ${C.indigo}`,
          opacity: (1 - ring) * 0.3,
          transform: `scale(${0.2 + ring * 1.3})`,
        }}
      />

      {/* checklist */}
      <div style={{ position: 'absolute', left: 300, top: 190, opacity: 1 - listOut, transform: `translateX(${-listOut * 120}px)` }}>
        {ITEMS.map((it, i) => {
          const at = b(0.5 + i * 0.5); // the «pop» cues 104.5 … 106.5
          const p = pop(frame, at);
          const t = ease(frame, at, 8);
          return (
            <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 30, height: 140, opacity: t }}>
              <span style={{ width: 76, height: 76, borderRadius: 38, background: C.teal, display: 'grid', placeItems: 'center', transform: `scale(${p})`, flexShrink: 0 }}>
                <Check size={44} color="#fff" strokeWidth={3} />
              </span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 54, color: C.ink, letterSpacing: -1.2, transform: `translateX(${(1 - p) * 40}px)`, whiteSpace: 'nowrap' }}>{it}</span>
            </div>
          );
        })}
      </div>

      {/* lockup + CTA */}
      {frame >= b(8) && (
        <AbsoluteFill style={{ opacity: lock }}>
          <div style={{ position: 'absolute', top: 250, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 40 }}>
            <Mark size={170} start={b(8)} />
            <Wordmark at={b(8) + 14} size={132} />
          </div>
          <div style={{ position: 'absolute', top: 500, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <Slam text="Управляйте центром, а не таблицами" at={b(9)} size={62} stagger={4} align="center" highlight={['центром,']} />
          </div>
          <div
            style={{
              position: 'absolute',
              top: 660,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 40,
              fontFamily: BODY,
              opacity: Math.min(1, cta * 1.5),
              transform: `translateY(${(1 - cta) * 30}px)`,
            }}
          >
            <span style={{ padding: '22px 40px', borderRadius: 20, background: C.indigo, color: '#fff', fontWeight: 700, fontSize: 32 }}>Покажем за 15 минут</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 30, fontWeight: 600, color: C.ink }}>
              <Send size={30} color={C.tealDeep} /> @sabakhub_bot
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 30, fontWeight: 600, color: C.ink }}>
              <Mail size={30} color={C.tealDeep} /> hello@sabakhub.kg
            </span>
          </div>
          <div style={{ position: 'absolute', top: 820, left: 0, right: 0, textAlign: 'center', fontFamily: BODY, fontSize: 26, color: C.inkMute, opacity: ease(frame, b(11), 14) }}>
            Веб · Мобильный · Telegram — без установки
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
