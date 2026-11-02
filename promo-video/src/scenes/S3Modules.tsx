import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BarChart3, Bot, Building2, CalendarDays, DoorOpen, NotebookPen, Send, Wallet } from 'lucide-react';
import { BODY, C, DISPLAY, beat, ease, pop } from '../theme';
import { RiseText } from '../components/ui';

// Bars 6–7 (build-up): one module per eighth note, then the camera dives into the
// first tile on the riser and lands on the drop in the schedule scene.
const TILES = [
  { t: 'Расписание', s: 'Неделя, кабинеты, конфликты', icon: CalendarDays, c: C.indigo },
  { t: 'Кабинеты', s: 'Занятость и свободные окна', icon: DoorOpen, c: C.teal },
  { t: 'Филиалы', s: 'Все точки в одном окне', icon: Building2, c: C.coral },
  { t: 'Telegram-бот', s: 'ИИ для учеников и директора', icon: Send, c: C.tealDeep },
  { t: 'AI-ассистент', s: 'Работает по вашей команде', icon: Bot, c: C.plum },
  { t: 'Аналитика', s: 'Выручка, посещаемость, риски', icon: BarChart3, c: C.amber },
  { t: 'Финансы', s: 'Счета, касса, долги', icon: Wallet, c: C.indigo },
  { t: 'Журнал', s: 'Перекличка и оценки', icon: NotebookPen, c: C.coral },
];

const W = 395;
const H = 200;
const GAP = 26;
const X0 = (1920 - (W * 4 + GAP * 3)) / 2;
const Y0 = 400;

export const S3Modules: React.FC = () => {
  const frame = useCurrentFrame();
  // dive into tile 0 over the last 3 beats
  const dive = ease(frame, beat(5), beat(3), 'in');
  const scale = 1 + dive * dive * 14;
  const ox = X0 + W / 2;
  const oy = Y0 + H / 2;
  const fadeOthers = ease(frame, beat(5), beat(1.5));

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${ox}px ${oy}px` }}>
        <div style={{ position: 'absolute', left: X0, top: 175, opacity: 1 - fadeOthers }}>
          <RiseText lines={['Всё, что нужно центру —', 'в одной системе']} at={0} stagger={5} size={62} />
        </div>
        {TILES.map((tile, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const p = pop(frame, beat(1 + i * 0.5));
          const Icon = tile.icon;
          const isFirst = i === 0;
          return (
            <div
              key={tile.t}
              style={{
                position: 'absolute',
                left: X0 + col * (W + GAP),
                top: Y0 + row * (H + GAP),
                width: W,
                height: H,
                borderRadius: 28,
                background: C.card,
                border: `1px solid ${C.line}`,
                boxShadow: '0 22px 50px -30px rgba(22,20,31,0.35)',
                padding: 28,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                opacity: Math.min(1, p * 1.5) * (isFirst ? 1 : 1 - fadeOthers),
                transform: `translateY(${(1 - p) * 40}px) scale(${0.9 + 0.1 * p})`,
              }}
            >
              <span
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 18,
                  background: tile.c + '1C',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon size={30} color={tile.c} strokeWidth={2.1} />
              </span>
              <div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 31, color: C.ink, letterSpacing: -0.5 }}>{tile.t}</div>
                <div style={{ fontFamily: BODY, fontSize: 22, color: C.inkSoft, marginTop: 6 }}>{tile.s}</div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      {/* the tile's paper fills the screen right before the drop */}
      <AbsoluteFill style={{ background: C.paper, opacity: ease(frame, beat(7), beat(1)) }} />
    </AbsoluteFill>
  );
};
