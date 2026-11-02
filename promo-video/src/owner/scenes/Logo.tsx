import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BODY, C } from '../../theme';
import { FadeUp } from '../../components/ui';
import { b, ease, Mark, Slam, Wordmark } from '../kit';

// Bar 2: impact. Paper irises open out of the dark hook, the mark builds,
// the promise lands; the riser pulls everything forward into the drop.
export const Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const iris = ease(frame, 0, 20, 'out');
  const reveal = ease(frame, 16, 30, 'inOut');
  const push = ease(frame, b(3.2), b(0.8), 'in');
  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      <AbsoluteFill style={{ background: C.paper, clipPath: `circle(${iris * 1250}px at 960px 540px)` }}>
        <AbsoluteFill style={{ opacity: 1 - push, transform: `scale(${1 + push * 0.12})` }}>
          <div style={{ position: 'absolute', top: 250, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <FadeUp at={30}>
              <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 26, letterSpacing: 3, color: C.inkMute, textTransform: 'uppercase' }}>
                Для владельца учебного центра
              </div>
            </FadeUp>
          </div>
          <div style={{ position: 'absolute', top: 330, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Mark size={170} start={0} />
            <div style={{ overflow: 'hidden', maxWidth: reveal * 900, marginLeft: reveal * 40 }}>
              <Wordmark at={18} size={124} />
            </div>
          </div>
          <div style={{ position: 'absolute', top: 590, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <Slam text="Все ответы — на одном экране" at={b(1.6)} size={64} stagger={4} align="center" highlight={['одном', 'экране']} />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
