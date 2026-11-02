import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { AlertTriangle, CheckCircle2, DoorOpen } from 'lucide-react';
import { BODY, C, beat, ease, exitStyle, pop } from '../theme';
import { Caption, Cursor, Tab, Window } from '../components/ui';

// Bars 8–11 (drop A). Lessons fall into the week on eighth notes, then a
// drag shows SabakHub's real conflict check (teacher / group / room) and the
// lesson settling into a free slot.

const WX = 720;
const WY = 140;
const WW = 1090;
const WH = 800;
const GUTTER = 76;
const COL = 165;
const HOUR = 65;
const DAY_H = 56;
// absolute screen origin of the time grid (for the cursor)
const GX = WX + GUTTER + 12;
const GY = WY + 74 + DAY_H;

const DAYS = ['Пн 12', 'Вт 13', 'Ср 14', 'Чт 15', 'Пт 16', 'Сб 17'];

type L = { d: number; s: number; len: number; t: string; who: string; room: string; c: string };
const LESSONS: L[] = [
  { d: 0, s: 9, len: 1.5, t: 'Frontend', who: 'Е. Смирнова', room: 'Ауд. 1', c: C.indigo },
  { d: 1, s: 10, len: 1.5, t: 'Математика', who: 'Н. Абдыева', room: 'Ауд. 2', c: C.coral },
  { d: 0, s: 13, len: 1.5, t: 'Английский B1', who: 'А. Садыкова', room: 'Ауд. 3', c: C.teal },
  { d: 2, s: 9.5, len: 1.5, t: 'Подготовка к школе', who: 'М. Касымова', room: 'Ауд. 3', c: C.amber },
  { d: 1, s: 14, len: 1.5, t: 'UX/UI дизайн', who: 'А. Иванов', room: 'Ауд. 1', c: C.plum },
  { d: 3, s: 11, len: 1.5, t: 'Frontend', who: 'Е. Смирнова', room: 'Ауд. 1', c: C.indigo },
  { d: 0, s: 16, len: 2, t: 'Робототехника', who: 'Б. Осмонов', room: 'Ауд. 2', c: C.amber },
  { d: 4, s: 10, len: 2, t: 'Робототехника', who: 'Б. Осмонов', room: 'Ауд. 2', c: C.amber },
  { d: 3, s: 15.5, len: 1.5, t: 'Английский A2', who: 'А. Садыкова', room: 'Ауд. 3', c: C.teal },
  { d: 2, s: 16, len: 1.5, t: 'Английский B1', who: 'А. Садыкова', room: 'Ауд. 3', c: C.teal },
  { d: 4, s: 14, len: 1.5, t: 'Математика', who: 'Н. Абдыева', room: 'Ауд. 2', c: C.coral },
  { d: 5, s: 10, len: 1.5, t: 'Английский B1', who: 'А. Садыкова', room: 'Ауд. 3', c: C.teal },
  { d: 4, s: 17, len: 1.5, t: 'Подготовка к школе', who: 'М. Касымова', room: 'Ауд. 3', c: C.amber },
  { d: 5, s: 12, len: 1.5, t: 'UX/UI дизайн', who: 'А. Иванов', room: 'Ауд. 1', c: C.plum },
];
const DRAGGED = 9; // Ср 16:00 English B1
const BLOCKER = 8; // Чт 15:30 — same teacher

const pos = (d: number, s: number) => ({ x: d * COL + 4, y: (s - 9) * HOUR + 2 });

// timeline (frames)
const GRAB = beat(9);
const AT_CONFLICT = beat(10);
const LEAVE = beat(12);
const DROP = beat(13);

export const S4Schedule: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const from = pos(2, 16);
  const mid = pos(3, 16);
  const to = pos(3, 17.5);
  const toConflict = ease(frame, GRAB, AT_CONFLICT - GRAB, 'inOut');
  const toFree = ease(frame, LEAVE, DROP - LEAVE, 'inOut');
  const dragX = interpolate(toFree, [0, 1], [interpolate(toConflict, [0, 1], [from.x, mid.x]), to.x]);
  const dragY = interpolate(toFree, [0, 1], [interpolate(toConflict, [0, 1], [from.y, mid.y]), to.y]);
  const lifted = frame >= GRAB && frame < DROP;
  const inConflict = frame >= AT_CONFLICT - 2 && frame < LEAVE;
  const settle = pop(frame, DROP);
  const tip = pop(frame, AT_CONFLICT + 2) * (1 - ease(frame, LEAVE - 2, 8));
  const freeHint = ease(frame, LEAVE - 8, 8) * (1 - ease(frame, DROP, 10));
  const toast = pop(frame, DROP + 4);

  // cursor grabs the block ~ at its upper-middle
  const grabDX = 80;
  const grabDY = 30;

  return (
    <AbsoluteFill style={exitStyle(frame, duration)}>
      <Caption
        n="01"
        label="Расписание"
        title={['Расписание', 'без накладок']}
        body="Ставьте уроки перетаскиванием — SabakHub сразу проверит преподавателя, группу и кабинет."
        bullets={[
          { text: 'Неделя и день, фильтр по кабинету', at: beat(4) },
          { text: 'Копирование уроков через Ctrl+V', at: beat(5) },
          { text: 'Конфликты видны до сохранения', at: beat(6) },
        ]}
      />

      <Window
        x={WX}
        y={WY}
        w={WW}
        h={WH}
        title={
          <>
            <Tab active>Расписание уроков</Tab>
            <Tab>События и экзамены</Tab>
          </>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: BODY, fontSize: 19, color: C.inkSoft }}>
            <span style={{ fontWeight: 600, color: C.ink }}>12 – 17 октября</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: `1px solid ${C.line}`, borderRadius: 12 }}>
              <DoorOpen size={18} color={C.inkSoft} /> Кабинет: все
            </span>
          </div>
        }
      >
        {/* day header */}
        <div style={{ position: 'absolute', left: GUTTER + 12, top: 0, height: DAY_H, display: 'flex' }}>
          {DAYS.map((d, i) => (
            <div
              key={d}
              style={{
                width: COL,
                display: 'grid',
                placeItems: 'center',
                fontFamily: BODY,
                fontWeight: 600,
                fontSize: 19,
                color: i === 1 ? C.indigo : C.inkSoft,
              }}
            >
              {d}
            </div>
          ))}
        </div>
        {/* hour lines */}
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: DAY_H + i * HOUR }}>
            <span style={{ position: 'absolute', left: 18, top: -10, fontFamily: BODY, fontSize: 15, color: C.inkMute }}>
              {String(9 + i).padStart(2, '0')}:00
            </span>
            <div style={{ position: 'absolute', left: GUTTER, right: 12, height: 1, background: C.line, opacity: 0.7 }} />
          </div>
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            style={{ position: 'absolute', top: DAY_H, bottom: 10, left: GUTTER + 12 + i * COL, width: 1, background: C.line, opacity: 0.5 }}
          />
        ))}

        <div style={{ position: 'absolute', left: GUTTER + 12, top: DAY_H }}>
          {/* free-slot hint */}
          <div
            style={{
              position: 'absolute',
              left: to.x - 2,
              top: to.y - 2,
              width: COL - 4,
              height: 1.5 * HOUR,
              borderRadius: 14,
              border: `2.5px dashed ${C.teal}`,
              background: C.tealSoft + 'AA',
              opacity: freeHint,
              display: 'grid',
              placeItems: 'center',
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: 17,
              color: C.tealDeep,
            }}
          >
            Свободно
          </div>

          {LESSONS.map((l, i) => {
            const p = pop(frame, beat(1 + i * 0.5));
            const isDragged = i === DRAGGED;
            const isBlocker = i === BLOCKER;
            const base = pos(l.d, l.s);
            const x = isDragged && frame >= GRAB ? dragX : base.x;
            const y = isDragged && frame >= GRAB ? dragY : base.y;
            const conflictRing = (isDragged || isBlocker) && inConflict;
            const pulse = isBlocker && inConflict ? 0.5 + 0.5 * Math.sin((frame - AT_CONFLICT) / 3) : 0;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: COL - 8,
                  height: l.len * HOUR - 4,
                  borderRadius: 12,
                  background: isDragged && lifted ? '#fff' : l.c + '1A',
                  border: `1.5px solid ${l.c}40`,
                  boxShadow: conflictRing
                    ? `0 0 0 ${2.5 + pulse * 2}px ${C.coral}`
                    : isDragged && lifted
                      ? '0 18px 36px -12px rgba(22,20,31,0.35)'
                      : 'none',
                  padding: '7px 10px',
                  boxSizing: 'border-box',
                  fontFamily: BODY,
                  opacity: Math.min(1, p * 1.6),
                  transform: `translateY(${(1 - p) * -26}px) scale(${isDragged && lifted ? 1.05 : isDragged ? 1 + (1 - settle) * 0.05 : 1})`,
                  zIndex: isDragged ? 5 : 1,
                  overflow: 'hidden',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16.5, color: C.ink, lineHeight: 1.2 }}>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: l.c, marginRight: 6, verticalAlign: 1 }} />
                  {l.t}
                </div>
                <div style={{ fontSize: 14.5, color: C.inkSoft, marginTop: 3 }}>{l.who}</div>
                <div style={{ fontSize: 14.5, color: C.inkMute }}>{l.room}</div>
              </div>
            );
          })}
        </div>

      </Window>

      {/* success toast */}
      <div
          style={{
            position: 'absolute',
            left: WX + WW / 2,
            top: WY + WH + 26,
            translate: '-50% 0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 20px',
            borderRadius: 16,
            background: C.ink,
            color: C.paper,
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 20,
            opacity: Math.min(1, toast * 1.5),
            transform: `translateY(${(1 - toast) * 30}px)`,
          }}
        >
          <CheckCircle2 size={24} color={C.teal} /> Урок перенесён · Чт 17:30, Ауд. 3
        </div>

      {/* conflict tooltip (outside the window clip) */}
      <div
        style={{
          position: 'absolute',
          left: GX + mid.x - 300,
          top: GY + mid.y + 1.5 * HOUR + 14,
          width: 470,
          padding: '20px 22px',
          borderRadius: 20,
          background: C.card,
          border: `1.5px solid ${C.coral}55`,
          boxShadow: '0 30px 60px -24px rgba(22,20,31,0.4)',
          fontFamily: BODY,
          opacity: Math.min(1, tip * 1.4),
          transform: `translateY(${(1 - tip) * 16}px) scale(${0.94 + 0.06 * tip})`,
          transformOrigin: '70% 0%',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.coral, fontWeight: 700, fontSize: 21 }}>
          <AlertTriangle size={24} /> Конфликт расписания
        </div>
        <div style={{ fontSize: 19, color: C.ink, marginTop: 10, lineHeight: 1.4 }}>
          <b>А. Садыкова</b> уже ведёт урок в это время — Чт 15:30, Ауд. 3
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <span style={{ padding: '9px 16px', borderRadius: 11, border: `1.5px solid ${C.line}`, fontWeight: 600, fontSize: 17, color: C.inkSoft }}>
            Поставить всё равно
          </span>
          <span style={{ padding: '9px 16px', borderRadius: 11, background: C.ink, color: '#fff', fontWeight: 600, fontSize: 17 }}>Отмена</span>
        </div>
      </div>

      <Cursor
        show={[GRAB - 16, DROP + 18]}
        keys={[
          { f: GRAB - 16, x: GX + from.x + grabDX + 120, y: GY + from.y + grabDY + 140 },
          { f: GRAB, x: GX + from.x + grabDX, y: GY + from.y + grabDY, click: true },
          { f: AT_CONFLICT, x: GX + mid.x + grabDX, y: GY + mid.y + grabDY },
          { f: LEAVE, x: GX + mid.x + grabDX, y: GY + mid.y + grabDY },
          { f: DROP, x: GX + to.x + grabDX, y: GY + to.y + grabDY, click: true },
          { f: DROP + 18, x: GX + to.x + grabDX + 40, y: GY + to.y + grabDY + 50 },
        ]}
      />
    </AbsoluteFill>
  );
};
