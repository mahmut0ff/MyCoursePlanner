import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Check, FileImage, FileSpreadsheet } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { b, Chip, ease, Mark, Num, pop, Slam } from '../kit';
import { FILES, FLY, ROWS, SAY_AT, TABS, TABS_AT } from '../scenes/Migration';
import { CW, X } from './layout';

// Bars 21–25, vertical: spreadsheet on top, SabakHub below; each row drops
// down into the list on its blip (newest on top, the rest slide down), then
// the four counters tick, then the promise.

const XL_Y = 640;
const XL_ROW = 46;
const XL_FIRST = XL_Y + 64 + 50;
const SH_Y = 1150;
const SH_ROW = 62;
const SH_FIRST = SH_Y + 76;
const LAND = 22;
const landAt = (i: number) => FLY + i * 15 + LAND;

export const RMigration: React.FC = () => {
  const frame = useCurrentFrame();
  const open = ease(frame, b(2.6), 22, 'inOut');
  const xlOut = ease(frame, TABS_AT - 8, 14);
  const fade = ease(frame, SAY_AT - 6, 14);

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: X, top: 345, width: CW, opacity: 1 - fade }}>
        <Slam text="Переезд в SabakHub —" at={4} size={74} stagger={4} />
        <Slam text="берём на себя" at={18} size={74} stagger={4} color={C.indigo} />
      </div>

      <AbsoluteFill style={{ opacity: 1 - fade * 0.97 }}>
        {/* files fan out, then the first one opens */}
        {FILES.map((f, i) => {
          const p = pop(frame, 16 + i * 12);
          const gone = ease(frame, b(2.4) + i * 2, 14, 'in');
          const Icon = f.img ? FileImage : FileSpreadsheet;
          return (
            <div
              key={f.n}
              style={{
                position: 'absolute',
                left: X + 20 + i * 22,
                top: 660 + i * 112,
                width: 780,
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                padding: '22px 26px',
                borderRadius: 24,
                background: C.card,
                border: `1px solid ${C.line}`,
                boxShadow: '0 22px 40px -26px rgba(22,20,31,0.4)',
                fontFamily: BODY,
                opacity: Math.min(1, p * 1.5) * (1 - gone),
                transform: `translateY(${(1 - p) * 50 - gone * 50}px) rotate(${(i - 2) * 1.4}deg)`,
              }}
            >
              <span style={{ width: 66, height: 66, borderRadius: 18, background: f.img ? C.plumSoft : '#DDEFE3', display: 'grid', placeItems: 'center' }}>
                <Icon size={34} color={f.img ? C.plum : '#2F7A4F'} />
              </span>
              <span>
                <div style={{ fontWeight: 700, fontSize: 29, color: C.ink }}>{f.n}</div>
                <div style={{ fontSize: 23, color: C.inkMute }}>{f.s}</div>
              </span>
            </div>
          );
        })}

        {/* spreadsheet */}
        {frame >= b(2.6) && (
          <div
            style={{
              position: 'absolute',
              left: X,
              top: XL_Y,
              width: CW,
              height: 64 + 50 + 8 * XL_ROW + 6,
              borderRadius: 24,
              background: C.card,
              border: `1px solid ${C.line}`,
              boxShadow: '0 30px 70px -30px rgba(22,20,31,0.35)',
              overflow: 'hidden',
              fontFamily: BODY,
              opacity: open * (1 - xlOut),
              transform: `scale(${0.88 + 0.12 * open}) translateY(${-xlOut * 40}px)`,
              transformOrigin: '50% 0%',
            }}
          >
            <div style={{ height: 64, background: '#2F7A4F', display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', color: '#fff', fontWeight: 700, fontSize: 26 }}>
              <FileSpreadsheet size={28} /> Ученики_2025.xlsx
            </div>
            <div style={{ display: 'flex', height: 50, borderBottom: `1px solid ${C.line}`, fontSize: 22, fontWeight: 700, color: C.ink, alignItems: 'center', background: '#F6F7F4' }}>
              <span style={{ width: 360, paddingLeft: 24 }}>ФИО</span>
              <span style={{ width: 260 }}>Телефон</span>
              <span style={{ flex: 1 }}>Группа</span>
            </div>
            {ROWS.map(([n, ph, g], i) => {
              const sent = frame >= FLY + i * 15;
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', height: XL_ROW, borderBottom: `1px solid ${C.line}`, fontSize: 21, color: sent ? C.inkMute : C.ink, background: sent ? '#EEF7F0' : 'transparent' }}>
                  <span style={{ width: 360, paddingLeft: 24, whiteSpace: 'nowrap' }}>{n}</span>
                  <span style={{ width: 260, whiteSpace: 'nowrap' }}>{ph}</span>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', display: 'flex', justifyContent: 'space-between', paddingRight: 18 }}>
                    {g}
                    {sent && <Check size={22} color="#2F7A4F" />}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* counters replace the spreadsheet (bar 23, one per tick) */}
        {TABS.map((t, i) => {
          const at = TABS_AT + i * b(1);
          const p = pop(frame, at);
          const value = Number(t.v.replace(/\s/g, ''));
          return (
            <div
              key={t.n}
              style={{
                position: 'absolute',
                left: X + (i % 2) * 460,
                top: 660 + Math.floor(i / 2) * 220,
                width: 440,
                height: 200,
                borderRadius: 26,
                background: C.card,
                border: `1px solid ${C.line}`,
                boxShadow: '0 22px 50px -30px rgba(22,20,31,0.35)',
                padding: '26px 28px',
                boxSizing: 'border-box',
                fontFamily: BODY,
                opacity: frame >= at ? Math.min(1, p * 1.5) : 0,
                transform: `scale(${0.85 + 0.15 * p})`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 27, fontWeight: 600, color: C.inkMute }}>{t.n}</span>
                <span style={{ width: 44, height: 44, borderRadius: 22, background: C.teal, display: 'grid', placeItems: 'center' }}>
                  <Check size={26} color="#fff" strokeWidth={3} />
                </span>
              </div>
              <div style={{ marginTop: 20 }}>
                <Num value={value} at={at} dur={26} size={64} />
              </div>
            </div>
          );
        })}

        {/* SabakHub list */}
        {(() => {
          const p = pop(frame, b(3), false);
          return (
            <div
              style={{
                position: 'absolute',
                left: X,
                top: SH_Y,
                width: CW,
                height: 76 + 5 * SH_ROW + 10,
                borderRadius: 24,
                background: C.card,
                border: `1px solid ${C.line}`,
                boxShadow: '0 30px 70px -30px rgba(22,20,31,0.35)',
                overflow: 'hidden',
                fontFamily: BODY,
                opacity: p,
                transform: `translateY(${(1 - p) * 80}px)`,
              }}
            >
              <div style={{ height: 76, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', borderBottom: `1px solid ${C.line}` }}>
                <Mark size={42} />
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 28, color: C.ink }}>SabakHub</span>
                <span style={{ fontSize: 24, color: C.inkMute, marginLeft: 6 }}>· Ученики</span>
              </div>
              {ROWS.map(([n, , g, c], i) => {
                if (frame < landAt(i)) return null;
                // every row that lands later pushes this one down a slot
                const slot = ROWS.reduce((acc, _, j) => (j > i ? acc + ease(frame, landAt(j), 10) : acc), 0);
                const lp = pop(frame, landAt(i));
                return (
                  <div
                    key={n}
                    style={{
                      position: 'absolute',
                      left: 20,
                      right: 20,
                      top: 76 + 6 + slot * SH_ROW,
                      height: SH_ROW - 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      transform: `scale(${0.96 + 0.04 * lp})`,
                    }}
                  >
                    <Avatar name={n} color={c} size={44} />
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 26, color: C.ink, whiteSpace: 'nowrap' }}>{n}</span>
                    <Chip color={C.inkSoft} bg={C.paperDeep} size={19}>{g}</Chip>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* rows in flight: down from the sheet into the top of the list */}
        {ROWS.map(([n, , g, c], i) => {
          const t0 = FLY + i * 15;
          const t = ease(frame, t0, LAND, 'inOut');
          if (frame < t0 || t >= 1) return null;
          const x = X + 20 + Math.sin(t * Math.PI) * 90;
          const y = interpolate(t, [0, 1], [XL_FIRST + i * XL_ROW, SH_FIRST]);
          return (
            <div
              key={n}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: CW - 40,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '0 16px',
                borderRadius: 16,
                background: C.card,
                boxShadow: '0 20px 40px -16px rgba(22,20,31,0.45)',
                border: `2px solid ${C.indigo}55`,
                fontFamily: BODY,
                transform: `rotate(${Math.sin(t * Math.PI) * 2.5}deg) scale(${1 + Math.sin(t * Math.PI) * 0.04})`,
                zIndex: 5,
              }}
            >
              <Avatar name={n} color={c} size={40} />
              <span style={{ flex: 1, fontWeight: 700, fontSize: 25, color: C.ink, whiteSpace: 'nowrap' }}>{n}</span>
              <Chip color={C.inkSoft} bg={C.paperDeep} size={18}>{g}</Chip>
            </div>
          );
        })}
      </AbsoluteFill>

      {frame >= SAY_AT - 4 && (
        <div style={{ position: 'absolute', left: X, top: 380, width: CW }}>
          <Slam text="Excel, Google Таблицы, CSV, фото журнала — перенесём всё за вас" at={SAY_AT} size={84} stagger={3} highlight={['перенесём', 'всё', 'за', 'вас']} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, marginTop: 40, opacity: ease(frame, SAY_AT + b(1.5), 12) }}>
            <Chip color={C.tealDeep} bg={C.tealSoft} size={27}>
              <Check size={26} /> Вставка списка из Excel — в системе
            </Chip>
            <Chip color={C.indigoDeep} bg={C.indigoSoft} size={27}>
              <Check size={26} /> Импорт со скриншота списка — с ИИ
            </Chip>
          </div>
          <div style={{ marginTop: 36, fontFamily: BODY, fontSize: 34, lineHeight: 1.4, color: C.inkSoft, opacity: ease(frame, SAY_AT + b(3), 12) }}>
            В первый же день — со всеми вашими учениками, группами и оценками.
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
