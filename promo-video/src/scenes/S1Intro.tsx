import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import {
  BookOpenCheck,
  Building2,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  MessageCircle,
  PhoneIncoming,
  Receipt,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { BODY, C, beat, ease, pop } from '../theme';
import { RiseText } from '../components/ui';

// Bars 0–3 (intro, no drums). Each chip lands on a beat, then everything is
// pulled into the hub's centre on the last two beats — handing off to the logo.
const CHIPS = [
  { label: 'Расписание', icon: CalendarDays, color: C.indigo, x: 300, y: 250 },
  { label: 'Оплаты', icon: Wallet, color: C.amber, x: 1560, y: 230 },
  { label: 'Кабинеты', icon: DoorOpen, color: C.teal, x: 360, y: 790 },
  { label: 'Домашние задания', icon: BookOpenCheck, color: C.plum, x: 1500, y: 820 },
  { label: 'Филиалы', icon: Building2, color: C.coral, x: 960, y: 150 },
  { label: 'Посещаемость', icon: UserCheck, color: C.tealDeep, x: 190, y: 520 },
  { label: 'Заявки', icon: PhoneIncoming, color: C.indigo, x: 1730, y: 520 },
  { label: 'Родители', icon: MessageCircle, color: C.amber, x: 760, y: 905 },
  { label: 'Зарплаты', icon: Receipt, color: C.plum, x: 1210, y: 930 },
  { label: 'Оценки', icon: GraduationCap, color: C.coral, x: 640, y: 165 },
];

const CX = 960;
const CY = 540;
const PULL_AT = 204;

export const S1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const pull = ease(frame, PULL_AT, 36, 'in');
  const headOut = ease(frame, 196, 14, 'in');
  const hub = pop(frame, 228);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 395,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: 1 - headOut,
          transform: `scale(${1 - 0.1 * headOut})`,
        }}
      >
        <RiseText lines={['Учебный центр —']} at={4} size={92} />
        <RiseText lines={['это сотни мелочей.']} at={beat(2)} size={92} color={C.indigo} />
      </div>

      {CHIPS.map((c, i) => {
        const at = beat(4 + i);
        const p = pop(frame, at);
        const drift = Math.sin((frame + i * 40) / 38) * 6;
        const x = interpolate(pull, [0, 1], [c.x, CX]);
        const y = interpolate(pull, [0, 1], [c.y + drift, CY]);
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%, -50%) scale(${p * (1 - pull * 0.85)}) rotate(${(1 - p) * -6 + (i % 2 ? 1.5 : -1.5)}deg)`,
              opacity: Math.min(1, p * 1.4) * (1 - ease(frame, PULL_AT + 26, 8)),
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 26px 16px 18px',
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              boxShadow: '0 18px 40px -22px rgba(22,20,31,0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                background: c.color + '1F',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon size={25} color={c.color} strokeWidth={2.2} />
            </span>
            <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 30, color: C.ink }}>{c.label}</span>
          </div>
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: CX - 40,
          top: CY - 40,
          width: 80,
          height: 80,
          borderRadius: 40,
          background: C.indigo,
          transform: `scale(${hub})`,
        }}
      />
    </AbsoluteFill>
  );
};
