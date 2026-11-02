import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { CheckCircle2, ChevronDown, DoorOpen } from 'lucide-react';
import { BODY, C } from '../../theme';
import { cueAt, ease, pop } from '../kit';
import { AppBar, Content, Pill, PrimaryButton, Toast } from '../phone';

// Day schedule for branch «Центр». Bar 8–9: the lessons; bar 10: the admin
// moves «Английский B1» to 16:30 / room 305 — the teacher gets a push.

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const LESSONS: { t: string; end: string; name: string; room: string; who: string; color: string }[] = [
  { t: '09:00', end: '10:30', name: 'Математика', room: '101', who: 'Бакыт О.', color: C.amber },
  { t: '10:00', end: '11:30', name: 'Английский A2', room: '204', who: 'Айгерим С.', color: C.indigo },
  { t: '11:30', end: '13:00', name: 'Подготовка к школе', room: '102', who: 'Елена С.', color: C.teal },
  { t: '14:00', end: '15:30', name: 'Английский B1', room: '204', who: 'Айгерим С.', color: C.indigo },
  { t: '15:30', end: '17:00', name: 'Программирование', room: '301', who: 'Алексей И.', color: C.plum },
];

export const MOVED = { t: '16:30', end: '18:00', room: '305' };
const ROW_H = 86;

export const Schedule: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const tap = cueAt('lessonTap');
  const save = cueAt('lessonSave');
  const pushAt = cueAt('teacherPush');
  const lessonAt = (i: number) => (i < 3 ? cueAt(`les${i + 1}`) : cueAt('les3') + (i - 2) * 15);

  const press = ease(frame, tap, 5) * (1 - ease(frame, tap + 5, 8));
  const sheet = pop(frame, tap + 8, false);
  const sheetOut = ease(frame, save + 6, 14, 'in');
  const move = ease(frame, save + 10, 36, 'inOut');
  const glow = ease(frame, save + 10, 10) * (1 - ease(frame, save + 60, 30));

  return (
    <Content>
      <AppBar
        at={at + 4}
        title="Расписание"
        sub="Среда, 14 октября"
        right={
          <Pill color={C.indigoDeep} bg={C.indigoSoft} size={14}>
            Центр <ChevronDown size={14} />
          </Pill>
        }
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px', opacity: ease(frame, at + 10, 14) }}>
        {DAYS.map((d, i) => {
          const on = i === 2;
          return (
            <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, fontFamily: BODY }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: on ? C.indigo : C.inkMute }}>{d}</span>
              <span style={{ width: 40, height: 40, borderRadius: 20, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 16, background: on ? C.indigo : 'transparent', color: on ? '#fff' : C.ink }}>{12 + i}</span>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'relative', marginTop: 18, height: ROW_H * 5 + 20 }}>
        <div style={{ position: 'absolute', left: 58, top: 8, bottom: 8, width: 2, background: C.line, borderRadius: 1 }} />
        {LESSONS.map((l, i) => {
          const p = pop(frame, lessonAt(i), false);
          const moving = i === 3;
          const y = moving ? interpolate(move, [0, 1], [i * ROW_H, 4 * ROW_H]) : i === 4 ? interpolate(move, [0, 1], [4 * ROW_H, 3 * ROW_H]) : i * ROW_H;
          const t = moving && move > 0.5 ? MOVED.t : l.t;
          const end = moving && move > 0.5 ? MOVED.end : l.end;
          const room = moving && move > 0.5 ? MOVED.room : l.room;
          const lift = moving ? Math.sin(move * Math.PI) : 0;
          const now = i === 1;
          return (
            <div key={l.name} style={{ position: 'absolute', left: 0, right: 0, top: y, height: ROW_H, display: 'flex', alignItems: 'center', gap: 10, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 20}px)`, zIndex: moving ? 2 : 1 }}>
              <span style={{ width: 48, textAlign: 'right', fontFamily: BODY, fontWeight: 700, fontSize: 14.5, color: moving && move > 0.5 ? C.indigo : C.ink, lineHeight: 1.25 }}>
                {t}
                <div style={{ fontSize: 12, fontWeight: 500, color: C.inkMute }}>{end}</div>
              </span>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: l.color, marginLeft: -3, boxShadow: `0 0 0 3px ${C.paper}` }} />
              <div
                style={{
                  flex: 1,
                  background: '#fff',
                  border: `1px solid ${moving && glow > 0 ? C.indigo : C.line}`,
                  borderRadius: 16,
                  padding: '10px 12px',
                  boxSizing: 'border-box',
                  boxShadow: moving ? `0 ${10 + 24 * lift}px ${30 + 20 * lift}px -16px rgba(22,20,31,${0.3 + 0.3 * lift}), 0 0 0 ${4 * glow}px rgba(79,70,229,0.18)` : '0 8px 20px -16px rgba(22,20,31,0.25)',
                  transform: `scale(${1 - 0.03 * press * (moving ? 1 : 0) + 0.04 * lift})`,
                  fontFamily: BODY,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 15.5, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                  {now && <Pill color={C.tealDeep} bg={C.tealSoft} size={11}>идёт</Pill>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 13.5, color: C.inkMute }}>
                  <DoorOpen size={14} color={C.inkMute} />
                  <span style={{ fontWeight: 600, color: C.inkSoft }}>каб. {room}</span>
                  <span>·</span>
                  <span>{l.who}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* free rooms right now */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '12px 14px', borderRadius: 16, background: '#fff', border: `1px solid ${C.line}`, fontFamily: BODY, opacity: ease(frame, at + 70, 16), transform: `translateY(${(1 - ease(frame, at + 70, 16)) * 12}px)` }}>
        <DoorOpen size={16} color={C.tealDeep} />
        <span style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>Свободно сейчас</span>
        <span style={{ flex: 1 }} />
        <Pill color={C.tealDeep} bg={C.tealSoft} size={11.5}>каб. 305 · до 18:00</Pill>
        <Pill color={C.tealDeep} bg={C.tealSoft} size={11.5}>каб. 103</Pill>
      </div>

      {/* edit sheet */}
      {frame >= tap + 8 && sheetOut < 1 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: '28px 28px 0 0', background: '#fff', boxShadow: '0 -20px 50px -20px rgba(22,20,31,0.4)', padding: '14px 20px 18px', boxSizing: 'border-box', fontFamily: BODY, opacity: Math.min(1, sheet * 1.5) * (1 - sheetOut), transform: `translateY(${(1 - sheet) * 160 + sheetOut * 120}px)` }}>
          <div style={{ width: 44, height: 5, borderRadius: 3, background: C.line, margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>Перенести занятие</div>
          <div style={{ fontSize: 13.5, color: C.inkMute, marginTop: 2 }}>Английский B1 · Айгерим С.</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {[
              ['Время', '16:30 – 18:00'],
              ['Кабинет', '305 · свободен'],
            ].map(([k, v], i) => (
              <div key={k} style={{ flex: 1, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: '10px 12px', opacity: ease(frame, tap + 16 + i * 6, 12) }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.inkMute }}>{k}</div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: i ? C.tealDeep : C.ink, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          <PrimaryButton at={tap + 28} pressAt={save} style={{ marginTop: 14 }}>Сохранить</PrimaryButton>
        </div>
      )}

      <Toast at={pushAt} icon={<CheckCircle2 size={24} color={C.teal} />} title="Сохранено" text="Айгерим С. получила уведомление" until={pushAt + 110} />
    </Content>
  );
};
