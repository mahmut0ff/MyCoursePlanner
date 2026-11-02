import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Award, Banknote, Coins, GraduationCap, KeyRound, NotebookPen, Trophy, Users } from 'lucide-react';
import { BEAT, BODY, C, DISPLAY, ease, pop } from '../theme';

// Bars 32–33: eight more modules, one hard cut per beat over the riser.
const CARDS = [
  { w: 'Финансы', s: 'Счета, касса и онлайн-оплата', icon: Coins, bg: C.paper, fg: C.ink, ac: C.indigo },
  { w: 'Зарплаты', s: 'Считаются сами — утверждает директор', icon: Banknote, bg: C.indigoSoft, fg: C.ink, ac: C.indigo },
  { w: 'Журнал', s: 'Перекличка в один клик', icon: NotebookPen, bg: C.tealSoft, fg: C.ink, ac: C.tealDeep },
  { w: 'Оценки', s: '5-балльная шкала и средний балл', icon: GraduationCap, bg: C.amberSoft, fg: C.ink, ac: C.amber },
  { w: 'Экзамены', s: 'Живые викторины и тесты от ИИ', icon: Award, bg: C.night, fg: C.paper, ac: C.teal },
  { w: 'Рейтинг', s: 'Лучшие ученики месяца', icon: Trophy, bg: C.plumSoft, fg: C.ink, ac: C.plum },
  { w: 'Родители', s: 'Оценки, посещаемость и оплата', icon: Users, bg: C.coralSoft, fg: C.ink, ac: C.coral },
  { w: 'Роли и доступ', s: 'Каждый видит только своё', icon: KeyRound, bg: C.paperDeep, fg: C.ink, ac: C.indigo },
];

export const S10Montage: React.FC = () => {
  const frame = useCurrentFrame();
  const i = Math.min(CARDS.length - 1, Math.floor(frame / BEAT));
  const local = frame - i * BEAT;
  const c = CARDS[i];
  const t = ease(local, 0, 9);
  const p = pop(local, 0);
  const Icon = c.icon;
  return (
    <AbsoluteFill style={{ backgroundColor: c.bg }}>
      <div style={{ position: 'absolute', left: 160, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 26, letterSpacing: 3, color: c.ac, opacity: t }}>
          {String(i + 1).padStart(2, '0')} / 08
        </div>
        <div
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 124,
            letterSpacing: -4,
            color: c.fg,
            marginTop: 10,
            transform: `translateX(${(1 - t) * 70}px)`,
            opacity: 0.3 + 0.7 * t,
          }}
        >
          {c.w}
        </div>
        <div style={{ fontFamily: BODY, fontSize: 42, fontWeight: 500, color: c.fg, opacity: 0.75 * ease(local, 2, 8), marginTop: 6 }}>{c.s}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 200,
          top: 540 - 170,
          width: 340,
          height: 340,
          borderRadius: 170,
          background: c.ac + '22',
          display: 'grid',
          placeItems: 'center',
          transform: `scale(${0.6 + 0.4 * p}) rotate(${(1 - p) * -20}deg)`,
        }}
      >
        <Icon size={150} color={c.ac} strokeWidth={1.6} />
      </div>
      {/* beat ticks */}
      <div style={{ position: 'absolute', left: 160, bottom: 110, display: 'flex', gap: 10 }}>
        {CARDS.map((_, k) => (
          <span key={k} style={{ width: k === i ? 46 : 14, height: 6, borderRadius: 3, background: c.fg, opacity: k <= i ? 0.8 : 0.2 }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
