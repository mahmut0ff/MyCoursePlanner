import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Check, FileImage, FileSpreadsheet, Users } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { b, Chip, ease, pop, Slam } from '../kit';

// Bars 21–25. The owner's files fan out, the spreadsheet opens and its rows
// fly into SabakHub one per eighth note (a rising blip each), then every
// section fills up. The migration itself is a service the team runs; the
// in-app paths shown at the end are real: paste-from-Excel and AI import
// from a screenshot of a list.

export const FILES = [
  { n: 'Ученики_2025.xlsx', s: '312 строк', img: false },
  { n: 'Преподаватели.xlsx', s: '18 строк', img: false },
  { n: 'Оценки_1_четверть.xlsx', s: '4 830 оценок', img: false },
  { n: 'Оплаты_сентябрь.csv', s: '286 платежей', img: false },
  { n: 'Фото_журнала.jpg', s: 'список группы', img: true },
];

export const ROWS = [
  ['Айпери Жумабаева', '+996 555 000 101', 'Английский A2', C.teal],
  ['Тимур Ким', '+996 555 000 102', 'Робототехника', C.amber],
  ['Алина Сыдыкова', '+996 555 000 103', 'Подготовка к школе', C.plum],
  ['Бекзат Токтогулов', '+996 555 000 104', 'Frontend', C.indigo],
  ['Мээрим Асанова', '+996 555 000 105', 'Английский B1', C.teal],
  ['Нурсултан Абдыраев', '+996 555 000 106', 'Математика', C.coral],
  ['Сезим Орозова', '+996 555 000 107', 'Английский A2', C.teal],
  ['Данияр Маратов', '+996 555 000 108', 'Робототехника', C.amber],
] as const;

const XL = { x: 110, y: 330, w: 800, h: 640 };
const SH = { x: 1010, y: 330, w: 800, h: 640 };
const ROW_H = 58;
const xlRowY = (i: number) => XL.y + 150 + i * ROW_H;
const shRowY = (i: number) => SH.y + 150 + i * 56;

export const FLY = b(4);
export const TABS_AT = b(8);
export const SAY_AT = b(12);

export const TABS = [
  { n: 'Ученики', v: '312' },
  { n: 'Преподаватели', v: '18' },
  { n: 'Группы', v: '46' },
  { n: 'Оценки', v: '4 830' },
];

export const Migration: React.FC = () => {
  const frame = useCurrentFrame();
  const open = ease(frame, b(2.6), 22, 'inOut');
  const fade = ease(frame, SAY_AT - 6, 14);
  const tab = frame < TABS_AT ? 0 : Math.min(3, Math.floor((frame - TABS_AT) / b(1)));

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 110, top: 124, opacity: 1 - fade }}>
        <Slam text="Переезд в SabakHub —" at={4} size={66} stagger={4} />
        <Slam text="берём на себя" at={18} size={66} stagger={4} color={C.indigo} />
      </div>

      <AbsoluteFill style={{ opacity: 1 - fade * 0.96, transform: `scale(${1 - fade * 0.05})` }}>
        {/* files fanning out, then the first one opens */}
        {FILES.map((f, i) => {
          const p = pop(frame, 16 + i * 12);
          const gone = ease(frame, b(2.4) + i * 2, 14, 'in');
          const Icon = f.img ? FileImage : FileSpreadsheet;
          return (
            <div
              key={f.n}
              style={{
                position: 'absolute',
                left: 150 + i * 46,
                top: 360 + i * 70,
                width: 520,
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                padding: '18px 22px',
                borderRadius: 20,
                background: C.card,
                border: `1px solid ${C.line}`,
                boxShadow: '0 22px 40px -26px rgba(22,20,31,0.4)',
                fontFamily: BODY,
                opacity: Math.min(1, p * 1.5) * (1 - gone),
                transform: `translateY(${(1 - p) * 40 - gone * 40}px) rotate(${(i - 2) * 1.6}deg)`,
              }}
            >
              <span style={{ width: 54, height: 54, borderRadius: 14, background: f.img ? C.plumSoft : '#DDEFE3', display: 'grid', placeItems: 'center' }}>
                <Icon size={28} color={f.img ? C.plum : '#2F7A4F'} />
              </span>
              <span>
                <div style={{ fontWeight: 700, fontSize: 23, color: C.ink }}>{f.n}</div>
                <div style={{ fontSize: 18, color: C.inkMute }}>{f.s}</div>
              </span>
            </div>
          );
        })}

        {/* spreadsheet */}
        {frame >= b(2.6) && (
          <div
            style={{
              position: 'absolute',
              left: XL.x,
              top: XL.y,
              width: XL.w,
              height: XL.h,
              borderRadius: 22,
              background: C.card,
              border: `1px solid ${C.line}`,
              boxShadow: '0 30px 70px -30px rgba(22,20,31,0.35)',
              overflow: 'hidden',
              fontFamily: BODY,
              opacity: open,
              transform: `scale(${0.85 + 0.15 * open})`,
              transformOrigin: '20% 20%',
            }}
          >
            <div style={{ height: 64, background: '#2F7A4F', display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', color: '#fff', fontWeight: 700, fontSize: 21 }}>
              <FileSpreadsheet size={24} /> Ученики_2025.xlsx
            </div>
            <div style={{ display: 'flex', height: 40, background: '#F1F3F0', borderBottom: `1px solid ${C.line}`, fontSize: 16, color: C.inkMute, alignItems: 'center' }}>
              <span style={{ width: 44 }} />
              {['A', 'B', 'C'].map((l, k) => (
                <span key={l} style={{ flex: k === 0 ? 1.3 : 1, textAlign: 'center' }}>{l}</span>
              ))}
            </div>
            <div style={{ display: 'flex', height: 46, borderBottom: `1px solid ${C.line}`, fontSize: 18, fontWeight: 700, color: C.ink, alignItems: 'center' }}>
              <span style={{ width: 44, textAlign: 'center', color: C.inkMute, fontWeight: 500 }}>1</span>
              <span style={{ flex: 1.3, paddingLeft: 12 }}>ФИО</span>
              <span style={{ flex: 1, paddingLeft: 12 }}>Телефон</span>
              <span style={{ flex: 1, paddingLeft: 12 }}>Группа</span>
            </div>
            {ROWS.map(([n, ph, g], i) => {
              const sent = frame >= FLY + i * 15;
              return (
                <div
                  key={n}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: xlRowY(i) - XL.y,
                    height: ROW_H,
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: `1px solid ${C.line}`,
                    fontSize: 18,
                    color: sent ? C.inkMute : C.ink,
                    background: sent ? '#EEF7F0' : 'transparent',
                  }}
                >
                  <span style={{ width: 44, textAlign: 'center', color: C.inkMute }}>{i + 2}</span>
                  <span style={{ flex: 1.3, paddingLeft: 12, whiteSpace: 'nowrap' }}>{n}</span>
                  <span style={{ flex: 1, paddingLeft: 12, whiteSpace: 'nowrap' }}>{ph}</span>
                  <span style={{ flex: 1, paddingLeft: 12, whiteSpace: 'nowrap', display: 'flex', justifyContent: 'space-between', paddingRight: 14 }}>
                    {g}
                    {sent && <Check size={20} color="#2F7A4F" />}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* SabakHub window */}
        {(() => {
          const p = pop(frame, b(3), false);
          return (
            <div
              style={{
                position: 'absolute',
                left: SH.x,
                top: SH.y,
                width: SH.w,
                height: SH.h,
                borderRadius: 22,
                background: C.card,
                border: `1px solid ${C.line}`,
                boxShadow: '0 30px 70px -30px rgba(22,20,31,0.35)',
                overflow: 'hidden',
                fontFamily: BODY,
                opacity: p,
                transform: `translateX(${(1 - p) * 80}px)`,
              }}
            >
              <div style={{ height: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${C.indigo}, ${C.violet})` }} />
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 22, color: C.ink }}>SabakHub</span>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${C.line}` }}>
                {TABS.map((t, i) => {
                  const done = frame >= TABS_AT + i * b(1);
                  const on = i === tab;
                  const tp = pop(frame, TABS_AT + i * b(1));
                  return (
                    <span
                      key={t.n}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 12,
                        fontWeight: 700,
                        fontSize: 18,
                        background: on ? C.indigoSoft : 'transparent',
                        color: on ? C.indigoDeep : C.inkSoft,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.n}
                      {done && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.tealDeep, transform: `scale(${tp})` }}>
                          {t.v} <Check size={16} />
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              {tab === 0 &&
                ROWS.map(([n, , g, c], i) => {
                  const landed = frame >= FLY + i * 15 + 22;
                  if (!landed) return null;
                  const lp = pop(frame, FLY + i * 15 + 22);
                  return (
                    <div key={n} style={{ position: 'absolute', left: 18, right: 18, top: shRowY(i) - SH.y, height: 50, display: 'flex', alignItems: 'center', gap: 12, transform: `scale(${0.96 + 0.04 * lp})` }}>
                      <Avatar name={n} color={c} size={36} />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 19, color: C.ink }}>{n}</span>
                      <Chip color={C.inkSoft} bg={C.paperDeep} size={15}>{g}</Chip>
                    </div>
                  );
                })}
              {tab === 1 &&
                [['Елена Смирнова', 'Frontend · 2 группы'], ['Айгерим Садыкова', 'Английский · 3 группы'], ['Бакыт Осмонов', 'Робототехника · 4 группы'], ['Нургуль Абдыева', 'Математика · 3 группы'], ['Мээрим Касымова', 'Подготовка к школе · 2 группы']].map(([n, d], i) => (
                  <div key={n} style={{ position: 'absolute', left: 18, right: 18, top: 150 + i * 64, display: 'flex', alignItems: 'center', gap: 12, opacity: ease(frame, TABS_AT + b(1) + i * 3, 8) }}>
                    <Avatar name={n} color={[C.indigo, C.teal, C.amber, C.coral, C.plum][i]} size={40} />
                    <span style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 19, color: C.ink }}>{n}</div>
                      <div style={{ fontSize: 16, color: C.inkMute }}>{d}</div>
                    </span>
                  </div>
                ))}
              {tab === 2 &&
                [['Английский A2 · утро', 'Пн/Ср/Пт 10:00', '12/14'], ['Робототехника 10+', 'Вт/Чт 16:00', '9/10'], ['Подготовка к школе', 'Пн–Пт 09:00', '15/16'], ['Frontend с нуля', 'Сб 12:00', '11/12'], ['Математика 7 кл.', 'Вт/Чт 14:00', '13/14']].map(([n, d, cap], i) => (
                  <div key={n} style={{ position: 'absolute', left: 18, right: 18, top: 150 + i * 64, display: 'flex', alignItems: 'center', gap: 12, opacity: ease(frame, TABS_AT + b(2) + i * 3, 8) }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, background: C.indigoSoft, display: 'grid', placeItems: 'center' }}>
                      <Users size={20} color={C.indigo} />
                    </span>
                    <span style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 19, color: C.ink }}>{n}</div>
                      <div style={{ fontSize: 16, color: C.inkMute }}>{d}</div>
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: C.inkSoft }}>{cap}</span>
                  </div>
                ))}
              {tab === 3 && (
                <div style={{ position: 'absolute', left: 18, right: 18, top: 150 }}>
                  {['Айпери Ж.', 'Тимур К.', 'Алина С.', 'Бекзат Т.', 'Мээрим А.'].map((n, r) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', height: 62, borderBottom: `1px solid ${C.line}` }}>
                      <span style={{ width: 170, fontWeight: 700, fontSize: 19, color: C.ink }}>{n}</span>
                      {[5, 4, 5, 3, 4, 5, 4, 5, 4].map((g, k) => {
                        const v = ((g + r + k) % 3) + 3;
                        return (
                          <span
                            key={k}
                            style={{
                              width: 52,
                              textAlign: 'center',
                              fontFamily: DISPLAY,
                              fontWeight: 600,
                              fontSize: 20,
                              color: v === 5 ? C.tealDeep : v === 4 ? C.indigo : C.amber,
                              opacity: ease(frame, TABS_AT + b(3) + r * 2 + k, 6),
                            }}
                          >
                            {v}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* rows in flight: spreadsheet → SabakHub, one per eighth note */}
        {ROWS.map(([n, , g, c], i) => {
          const t0 = FLY + i * 15;
          const t = ease(frame, t0, 22, 'inOut');
          if (frame < t0 || t >= 1) return null;
          const x = interpolate(t, [0, 1], [XL.x + 20, SH.x + 18]);
          const y = interpolate(t, [0, 1], [xlRowY(i), shRowY(i)]) - Math.sin(t * Math.PI) * 120;
          return (
            <div
              key={n}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 520,
                height: 50,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0 14px',
                borderRadius: 14,
                background: C.card,
                boxShadow: '0 20px 40px -16px rgba(22,20,31,0.45)',
                border: `1.5px solid ${C.indigo}55`,
                fontFamily: BODY,
                transform: `rotate(${Math.sin(t * Math.PI) * -3}deg) scale(${1 + Math.sin(t * Math.PI) * 0.05})`,
                zIndex: 5,
              }}
            >
              <Avatar name={n} color={c} size={32} />
              <span style={{ flex: 1, fontWeight: 700, fontSize: 18, color: C.ink }}>{n}</span>
              <Chip color={C.inkSoft} bg={C.paperDeep} size={14}>{g}</Chip>
            </div>
          );
        })}
      </AbsoluteFill>

      {/* bars 24–25: the promise */}
      {frame >= SAY_AT - 4 && (
        <div style={{ position: 'absolute', left: 110, top: 300, width: 1700 }}>
          <Slam text="Excel, Google Таблицы, CSV, фото журнала — перенесём всё за вас" at={SAY_AT} size={76} stagger={3} maxWidth={1500} highlight={['перенесём', 'всё', 'за', 'вас']} />
          <div style={{ display: 'flex', gap: 14, marginTop: 44, opacity: ease(frame, SAY_AT + b(1.5), 12) }}>
            <Chip color={C.tealDeep} bg={C.tealSoft} size={24}>
              <Check size={22} /> Вставка списка из Excel — прямо в системе
            </Chip>
            <Chip color={C.indigoDeep} bg={C.indigoSoft} size={24}>
              <Check size={22} /> Импорт со скриншота списка — с ИИ
            </Chip>
          </div>
          <div style={{ marginTop: 40, fontFamily: BODY, fontSize: 32, color: C.inkSoft, opacity: ease(frame, SAY_AT + b(3), 12) }}>
            В первый же день — со всеми вашими учениками, группами и оценками.
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
