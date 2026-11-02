import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { DoorOpen, MonitorSmartphone } from 'lucide-react';
import { BODY, C, DISPLAY, beat, ease, exitStyle, pop } from '../theme';
import { Avatar, Cursor, FadeUp, Kicker, RiseText, Window } from '../components/ui';

// Bars 12–15. A day-board of every room: who teaches where and when, the free
// windows between lessons, then one room opened as a card — mirrors
// ClassroomsPage («Аудитории всех филиалов, их занятость и свободные окна»).

const WX = 110;
const WY = 380;
const WW = 1700;
const WH = 600;
const LABEL_W = 262;
const T0 = 9;
const T1 = 20;
const PX_H = (WW - LABEL_W - 40) / (T1 - T0);
const HEAD = 46;
const ROW = 94;

const ROOMS = [
  { name: 'Аудитория 1', meta: '16 мест · 1 этаж' },
  { name: 'Аудитория 2', meta: '12 мест · 1 этаж' },
  { name: 'Аудитория 3', meta: '18 мест · 2 этаж' },
  { name: 'Каб. 305', meta: '10 мест · 3 этаж' },
  { name: 'Онлайн', meta: 'виртуальный', online: true },
];

type B = { r: number; s: number; e: number; t: string; who: string; c: string };
const BOOK: B[] = [
  { r: 0, s: 10, e: 11.5, t: 'Frontend', who: 'Е. Смирнова', c: C.indigo },
  { r: 2, s: 9.5, e: 11, t: 'Подготовка', who: 'М. Касымова', c: C.amber },
  { r: 1, s: 10, e: 11.5, t: 'Математика', who: 'Н. Абдыева', c: C.coral },
  { r: 3, s: 11, e: 12.5, t: 'Математика', who: 'Н. Абдыева', c: C.coral },
  { r: 0, s: 14, e: 15.5, t: 'UX/UI дизайн', who: 'А. Иванов', c: C.plum },
  { r: 2, s: 14, e: 15.5, t: 'Английский B1', who: 'А. Садыкова', c: C.teal },
  { r: 1, s: 15, e: 17, t: 'Робототехника', who: 'Б. Осмонов', c: C.amber },
  { r: 2, s: 16, e: 17.5, t: 'Английский A2', who: 'А. Садыкова', c: C.teal },
  { r: 3, s: 17, e: 18.5, t: 'English Kids', who: 'М. Касымова', c: C.teal },
  { r: 0, s: 18, e: 19.5, t: 'Frontend', who: 'Е. Смирнова', c: C.indigo },
  { r: 4, s: 18, e: 19.5, t: 'English C1', who: 'А. Садыкова', c: C.teal },
];

const FREE = [
  { r: 2, s: 11, e: 14 },
  { r: 1, s: 11.5, e: 15 },
  { r: 2, s: 17.5, e: 20 },
];

const hx = (h: number) => LABEL_W + (h - T0) * PX_H;
const rowY = (r: number) => HEAD + r * ROW;
const fmtH = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

const CARD_AT = beat(10);

export const S5Classrooms: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const card = pop(frame, CARD_AT + 3, false);
  const nowX = hx(12 + 40 / 60);

  return (
    <AbsoluteFill style={exitStyle(frame, duration)}>
      <div style={{ position: 'absolute', left: 110, top: 128 }}>
        <Kicker n="02" label="Кабинеты" at={0} />
        <RiseText lines={['Кто, где и когда —', 'видно по каждому кабинету']} at={3} size={54} />
      </div>
      <FadeUp at={14} style={{ position: 'absolute', left: 1240, top: 214, width: 570, opacity: 1 - card }}>
        <div style={{ fontFamily: BODY, fontSize: 27, lineHeight: 1.45, color: C.inkSoft }}>
          Занятость аудиторий всех филиалов и свободные окна — сразу понятно, куда поставить новый урок.
        </div>
      </FadeUp>

      <Window
        x={WX}
        y={WY}
        w={WW}
        h={WH}
        at={2}
        title={
          <>
            <DoorOpen size={24} color={C.indigo} />
            <span style={{ fontWeight: 700, fontSize: 22, color: C.ink }}>Кабинеты</span>
            <span style={{ fontSize: 19, color: C.inkMute }}>Вторник, 13 октября</span>
          </>
        }
        right={
          <div style={{ display: 'flex', gap: 18, fontFamily: BODY, fontSize: 18, color: C.inkSoft, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: C.indigo + '33' }} /> Занято
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, border: `2px dashed ${C.teal}` }} /> Свободно
            </span>
          </div>
        }
      >
        {/* hour ruler */}
        {Array.from({ length: T1 - T0 + 1 }, (_, i) => (
          <React.Fragment key={i}>
            <span
              style={{
                position: 'absolute',
                left: hx(T0 + i) - 22,
                top: 12,
                fontFamily: BODY,
                fontSize: 15,
                color: C.inkMute,
                width: 44,
                textAlign: 'center',
              }}
            >
              {String(T0 + i).padStart(2, '0')}:00
            </span>
            <div style={{ position: 'absolute', left: hx(T0 + i), top: HEAD, bottom: 14, width: 1, background: C.line, opacity: 0.6 }} />
          </React.Fragment>
        ))}

        {ROOMS.map((room, i) => {
          const t = ease(frame, beat(0.5 + i * 0.5), 14);
          const isOpen = i === 2 && frame >= CARD_AT;
          return (
            <div
              key={room.name}
              style={{
                position: 'absolute',
                left: 0,
                width: WW,
                top: rowY(i),
                height: ROW,
                borderTop: `1px solid ${C.line}`,
                background: isOpen ? C.indigoSoft + '80' : 'transparent',
                opacity: t,
              }}
            >
              <div style={{ position: 'absolute', left: 28, top: 22, display: 'flex', gap: 14, alignItems: 'center', transform: `translateX(${(1 - t) * -20}px)` }}>
                <span
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    background: room.online ? C.plumSoft : C.paperDeep,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {room.online ? <MonitorSmartphone size={22} color={C.plum} /> : <DoorOpen size={22} color={C.inkSoft} />}
                </span>
                <div style={{ fontFamily: BODY }}>
                  <div style={{ fontWeight: 700, fontSize: 21, color: C.ink }}>{room.name}</div>
                  <div style={{ fontSize: 16, color: C.inkMute, marginTop: 2 }}>{room.meta}</div>
                </div>
              </div>
            </div>
          );
        })}

        {FREE.map((f, i) => {
          const p = pop(frame, beat(8 + i * 0.5));
          const breathe = 0.75 + 0.25 * Math.sin((frame - beat(8)) / 7.5);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: hx(f.s) + 4,
                top: rowY(f.r) + 12,
                width: (f.e - f.s) * PX_H - 8,
                height: ROW - 24,
                borderRadius: 14,
                border: `2.5px dashed ${C.teal}`,
                background: C.tealSoft + '99',
                display: 'grid',
                placeItems: 'center',
                fontFamily: BODY,
                fontWeight: 700,
                fontSize: 18,
                color: C.tealDeep,
                opacity: Math.min(1, p * 1.5) * (frame > beat(9) ? breathe : 1),
                transform: `scale(${0.9 + 0.1 * p})`,
              }}
            >
              Свободно {fmtH(f.s)}–{fmtH(f.e)}
            </div>
          );
        })}

        {BOOK.map((b, i) => {
          const g = ease(frame, beat(2 + i * 0.5), 12);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: hx(b.s) + 4,
                top: rowY(b.r) + 12,
                width: ((b.e - b.s) * PX_H - 8) * g,
                height: ROW - 24,
                borderRadius: 14,
                background: b.c + '1E',
                border: `1.5px solid ${b.c}45`,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 8px',
                boxSizing: 'border-box',
                opacity: g > 0 ? 1 : 0,
              }}
            >
              <Avatar name={b.who.replace('.', '')} color={b.c} size={32} />
              <div style={{ fontFamily: BODY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, opacity: ease(frame, beat(2 + i * 0.5) + 6, 8) }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{b.t}</div>
                <div style={{ fontSize: 14.5, color: C.inkSoft }}>{b.who}</div>
              </div>
            </div>
          );
        })}

        {/* now line */}
        <div style={{ position: 'absolute', left: nowX, top: HEAD - 6, bottom: 14, width: 2, background: C.coral, opacity: ease(frame, beat(7), 10) }}>
          <span
            style={{
              position: 'absolute',
              top: -30,
              left: -34,
              fontFamily: BODY,
              fontWeight: 700,
              fontSize: 14,
              color: '#fff',
              background: C.coral,
              borderRadius: 8,
              padding: '3px 8px',
            }}
          >
            12:40
          </span>
        </div>
      </Window>

      {/* room card */}
      <div
        style={{
          position: 'absolute',
          left: 1210,
          top: 120,
          width: 600,
          height: 860,
          borderRadius: 28,
          background: C.card,
          border: `1px solid ${C.line}`,
          boxShadow: '0 40px 90px -30px rgba(22,20,31,0.45)',
          padding: 40,
          boxSizing: 'border-box',
          fontFamily: BODY,
          opacity: card,
          transform: `translateX(${(1 - card) * 120}px)`,
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, color: C.ink, letterSpacing: -0.8 }}>Аудитория 3</div>
        <div style={{ fontSize: 21, color: C.inkMute, marginTop: 8 }}>Главный офис · 2 этаж</div>

        <div style={{ display: 'flex', gap: 14, marginTop: 28 }}>
          {[
            ['18', 'мест'],
            ['24', 'зан./нед.'],
            ['86%', 'загрузка'],
          ].map(([v, l], i) => (
            <div key={l} style={{ flex: 1, background: C.paper, borderRadius: 18, padding: '16px 18px', opacity: ease(frame, CARD_AT + 8 + i * 3, 10) }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 32, color: C.ink }}>{v}</div>
              <div style={{ fontSize: 17, color: C.inkMute, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: C.inkMute, marginTop: 32 }}>
          Ведут здесь
        </div>
        {[
          ['А. Садыкова', 'Английский · 12 уроков', C.teal],
          ['М. Касымова', 'Подготовка к школе · 8 уроков', C.amber],
          ['Е. Смирнова', 'Frontend · 4 урока', C.indigo],
        ].map(([n, d, c], i) => {
          const p = pop(frame, CARD_AT + beat(1) + i * 5);
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 20}px)` }}>
              <Avatar name={n.replace('.', '')} color={c} size={44} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 21, color: C.ink }}>{n}</div>
                <div style={{ fontSize: 17, color: C.inkMute }}>{d}</div>
              </div>
            </div>
          );
        })}

        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: C.inkMute, marginTop: 30 }}>
          Занятость по неделе
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 96, marginTop: 14 }}>
          {[0.8, 0.95, 0.7, 0.9, 1, 0.5].map((v, i) => {
            const g = ease(frame, CARD_AT + beat(2) + i * 3, 14);
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: '100%', height: 70 * v * g, borderRadius: 8, background: i === 1 ? C.indigo : C.indigo + '40' }} />
                <span style={{ fontSize: 15, color: C.inkMute }}>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][i]}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 26, alignItems: 'center', opacity: ease(frame, CARD_AT + beat(3), 10) }}>
          <span style={{ fontSize: 19, fontWeight: 600, color: C.ink }}>Свободно сегодня:</span>
          {['11:00–14:00', '17:30–20:00'].map((s) => (
            <span key={s} style={{ fontSize: 18, fontWeight: 700, color: C.tealDeep, background: C.tealSoft, borderRadius: 10, padding: '6px 12px' }}>
              {s}
            </span>
          ))}
        </div>
      </div>

      <Cursor
        show={[CARD_AT - 18, CARD_AT + 14]}
        keys={[
          { f: CARD_AT - 18, x: 520, y: WY + 74 + rowY(2) + 160 },
          { f: CARD_AT, x: 200, y: WY + 74 + rowY(2) + 45, click: true },
        ]}
      />
    </AbsoluteFill>
  );
};
