import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Mail, Send } from 'lucide-react';
import { BODY, C, DISPLAY, beat, ease, pop } from '../theme';
import { FadeUp, LogoMark, RiseText } from '../components/ui';

// Bars 34–38: impact, the final lockup, the call to action, then the music's
// reverb tail carries a slow fade.
const WORD = 'SabakHub';

export const S11Outro: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const ring = ease(frame, 0, 40);
  const out = ease(frame, duration - 40, 34, 'inOut');
  const cta = pop(frame, beat(4));

  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <div
        style={{
          position: 'absolute',
          left: 960 - 360,
          top: 330 - 360,
          width: 720,
          height: 720,
          borderRadius: 360,
          border: `2px solid ${C.indigo}`,
          opacity: (1 - ring) * 0.3,
          transform: `scale(${0.25 + ring * 1.2})`,
        }}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 330, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 40 }}>
        <LogoMark size={170} start={0} />
        <div style={{ display: 'flex', overflow: 'hidden' }}>
          {WORD.split('').map((ch, i) => {
            const t = ease(frame, 8 + i * 1.6, 16);
            return (
              <span
                key={i}
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 600,
                  fontSize: 132,
                  letterSpacing: -3,
                  color: i >= 5 ? C.indigo : C.ink,
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
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <RiseText lines={['Учебный центр под контролем —']} at={beat(2)} size={52} color={C.ink} />
        <RiseText lines={['от расписания до оплаты']} at={beat(2.5)} size={52} color={C.inkSoft} weight={500} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 740,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 34,
          fontFamily: BODY,
          opacity: Math.min(1, cta * 1.5),
          transform: `translateY(${(1 - cta) * 30}px)`,
        }}
      >
        <span style={{ padding: '20px 36px', borderRadius: 18, background: C.indigo, color: '#fff', fontWeight: 700, fontSize: 28 }}>
          Покажем за 15 минут
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 27, fontWeight: 600, color: C.ink }}>
          <Send size={28} color={C.tealDeep} /> @sabakhub_bot
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 27, fontWeight: 600, color: C.ink }}>
          <Mail size={28} color={C.tealDeep} /> hello@sabakhub.kg
        </span>
      </div>

      <FadeUp at={beat(6)} style={{ position: 'absolute', left: 0, right: 0, top: 880, textAlign: 'center' }}>
        <span style={{ fontFamily: BODY, fontSize: 24, color: C.inkMute, letterSpacing: 1 }}>Веб · Мобильный · Telegram — без установки</span>
      </FadeUp>
    </AbsoluteFill>
  );
};
