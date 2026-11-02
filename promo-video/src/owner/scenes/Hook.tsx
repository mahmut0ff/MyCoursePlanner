import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Calculator, UserX } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { b, ease, pop, Slam } from '../kit';

// Bars 0–1: four questions every owner asks, a hard cut + chord stab on
// every second beat. Dark, fast, nothing answered yet.
export const QS = [
  { q: 'Сколько мы заработали в этом месяце?', hi: ['заработали'] },
  { q: 'Кто до сих пор не оплатил?', hi: ['не', 'оплатил?'] },
  { q: 'Сколько платить каждому учителю?', hi: ['учителю?'] },
  { q: 'Кто из учеников вот-вот уйдёт?', hi: ['уйдёт?'] },
];
export const LEN = b(2);

export const Visual: React.FC<{ i: number; f: number }> = ({ i, f }) => {
  const p = pop(f, 4);
  const box: React.CSSProperties = {
    position: 'absolute',
    left: 1250,
    top: 330,
    width: 540,
    opacity: Math.min(1, p * 1.4),
    transform: `translateX(${(1 - p) * 80}px)`,
    fontFamily: BODY,
  };
  const card: React.CSSProperties = { background: C.nightCard, border: `1px solid ${C.nightLine}`, borderRadius: 24, padding: 28 };
  const blink = Math.floor(f / 10) % 2 === 0;
  if (i === 0)
    return (
      <div style={box}>
        <div style={card}>
          <div style={{ color: '#9B96AC', fontWeight: 600, fontSize: 22 }}>Выручка за месяц</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 64, color: C.paper, marginTop: 10, letterSpacing: 4 }}>
            ? ??? ???<span style={{ opacity: blink ? 1 : 0, color: C.teal }}>|</span>
          </div>
          {[0, 1, 2].map((k) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, color: '#6E6981', fontSize: 22, opacity: ease(f, 10 + k * 5, 8) }}>
              <span style={{ width: 220 - k * 30, height: 14, borderRadius: 7, background: C.nightLine, marginTop: 6 }} />
              <span style={{ color: '#8E89A0' }}>? с.</span>
            </div>
          ))}
        </div>
      </div>
    );
  if (i === 1)
    return (
      <div style={box}>
        <div style={{ ...card, padding: '14px 24px' }}>
          {['Айпери Ж.', 'Тимур К.', 'Алина С.', 'Бекзат Т.'].map((n, k) => {
            const q = pop(f, 6 + k * 4);
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: k ? `1px solid ${C.nightLine}` : 'none', opacity: Math.min(1, q * 1.5) }}>
                <Avatar name={n.replace('.', '')} color={[C.teal, C.coral, C.plum, C.amber][k]} size={44} />
                <span style={{ flex: 1, color: C.paper, fontWeight: 600, fontSize: 25 }}>{n}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 26, color: C.amber, transform: `scale(${q})` }}>?</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  if (i === 2)
    return (
      <div style={box}>
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 22 }}>
          <span style={{ width: 84, height: 84, borderRadius: 22, background: 'rgba(217,150,43,0.16)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Calculator size={44} color={C.amber} />
          </span>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 44, color: C.paper, display: 'flex', gap: 14 }}>
            {['?', '×', '?', '+', '?'].map((t, k) => (
              <span key={k} style={{ opacity: ease(f, 6 + k * 3, 6), color: t === '?' ? C.amber : '#8E89A0' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {['оклад?', 'процент?', 'за ученика?'].map((t, k) => (
            <span key={t} style={{ padding: '10px 16px', borderRadius: 12, border: `1px dashed ${C.nightLine}`, color: '#9B96AC', fontSize: 21, opacity: ease(f, 14 + k * 4, 8) }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    );
  const gone = ease(f, 18, 18, 'inOut');
  return (
    <div style={box}>
      <div style={{ ...card, display: 'flex', gap: 14, justifyContent: 'center', padding: '34px 20px' }}>
        {['Айпери Ж.', 'Тимур К.', 'Алина С.', 'Бекзат Т.', 'Нурлан М.'].map((n, k) =>
          k === 2 ? (
            <span key={n} style={{ position: 'relative', width: 72, height: 72 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: 36, border: `2px dashed ${C.coral}`, opacity: gone }} />
              <span style={{ position: 'absolute', inset: 0, opacity: 1 - gone, transform: `translateY(${gone * 40}px)` }}>
                <Avatar name={n} color={C.coral} size={72} />
              </span>
              <UserX size={28} color={C.coral} style={{ position: 'absolute', left: 22, top: 22, opacity: gone }} />
            </span>
          ) : (
            <Avatar key={n} name={n} color={[C.teal, C.indigo, C.coral, C.plum, C.amber][k]} size={72} />
          ),
        )}
      </div>
    </div>
  );
};

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const i = Math.min(QS.length - 1, Math.floor(frame / LEN));
  const f = frame - i * LEN;
  const out = ease(frame, b(7.5), b(0.5), 'in');
  return (
    <AbsoluteFill style={{ backgroundColor: C.night }}>
      <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${1 - out * 0.06})` }}>
        <div style={{ position: 'absolute', left: 140, top: 270, fontFamily: BODY, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: C.teal }}>
          ВОПРОС {String(i + 1).padStart(2, '0')} / 04
        </div>
        <div key={i} style={{ position: 'absolute', left: 140, top: 330, width: 1040 }}>
          <Slam text={QS[i].q} at={i * LEN} size={88} color={C.paper} stagger={3} highlight={QS[i].hi} hiColor={C.teal} />
        </div>
        <Visual i={i} f={f} />
        <div style={{ position: 'absolute', left: 140, bottom: 120, display: 'flex', gap: 12 }}>
          {QS.map((_, k) => (
            <span key={k} style={{ width: 120, height: 5, borderRadius: 3, background: C.nightLine, overflow: 'hidden' }}>
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  background: C.teal,
                  width: `${k < i ? 100 : k === i ? 100 * ease(f, 0, LEN, 'inOut') : 0}%`,
                }}
              />
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
