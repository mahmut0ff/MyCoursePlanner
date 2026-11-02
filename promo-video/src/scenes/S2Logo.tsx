import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BODY, C, DISPLAY, ease, exitStyle } from '../theme';
import { FadeUp, LogoMark } from '../components/ui';

// Bars 4–5: impact on frame 0, half-time kicks at 0 · 37 · 60 · 97.
// The mark builds on the impact, the wordmark lands on the 2nd kick,
// the tagline on the next downbeat.
const WORD = 'SabakHub';

export const S2Logo: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const shift = ease(frame, 34, 20, 'inOut');
  const ring = ease(frame, 0, 34);

  return (
    <AbsoluteFill style={exitStyle(frame, duration, 12)}>
      {/* soft shock ring on the impact */}
      <div
        style={{
          position: 'absolute',
          left: 960 - 300,
          top: 470 - 300,
          width: 600,
          height: 600,
          borderRadius: 300,
          border: `2px solid ${C.indigo}`,
          opacity: (1 - ring) * 0.35,
          transform: `scale(${0.3 + ring * 1.1})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 470,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          transform: 'translateY(-50%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <LogoMark size={200} start={0} />
          <div
            style={{
              overflow: 'hidden',
              maxWidth: shift * 900,
              marginLeft: shift * 44,
              display: 'flex',
              whiteSpace: 'nowrap',
            }}
          >
            {WORD.split('').map((ch, i) => {
              const t = ease(frame, 38 + i * 1.6, 16);
              return (
                <span
                  key={i}
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 600,
                    fontSize: 120,
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
      </div>

      <FadeUp at={60} style={{ position: 'absolute', top: 640, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: BODY, fontSize: 40, color: C.inkSoft, fontWeight: 500 }}>
          AI-платформа для управления учебным центром
        </div>
      </FadeUp>
      <FadeUp at={97} style={{ position: 'absolute', top: 720, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 18 }}>
        {['Веб', 'Мобильный', 'Telegram', 'AI'].map((t) => (
          <span
            key={t}
            style={{
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: 24,
              color: C.ink,
              padding: '10px 22px',
              borderRadius: 999,
              border: `1.5px solid ${C.line}`,
              background: C.card,
            }}
          >
            {t}
          </span>
        ))}
      </FadeUp>
    </AbsoluteFill>
  );
};
