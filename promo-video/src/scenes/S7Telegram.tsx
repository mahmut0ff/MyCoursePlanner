import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Mic, Paperclip } from 'lucide-react';
import { BODY, C, beat, ease, exitStyle, pop } from '../theme';
import { Caption, LogoMark } from '../components/ui';

// Bars 20–23 — the musical breakdown, so the scene goes dark and quiet.
// Left phone: a student hands in homework, the AI checks it (api-homework
// autograde). Right phone: the director's morning AI brief and a reminder
// draft for debtors (director-copilot + debt reminders).

const PHONE_W = 440;
const PHONE_H = 880;

type Msg = {
  at: number;
  side: 'bot' | 'me';
  text?: string;
  photo?: boolean;
  buttons?: string[];
  grid?: boolean;
  tapped?: { i: number; at: number };
  typing?: [number, number];
};

const STUDENT: Msg[] = [
  { at: 8, side: 'bot', text: 'Какое домашнее задание сдаёте?', buttons: ['Математика · Дроби', 'English · Unit 5'], tapped: { i: 0, at: 30 } },
  { at: 38, side: 'me', photo: true, text: 'Готово, вот решение' },
  { at: 52, side: 'bot', typing: [52, 88] },
  {
    at: 90,
    side: 'bot',
    text:
      '✅ Работа принята! Оценка ИИ: 4 из 5\n\nЗадача 3: дроби складывают через общий знаменатель — 1/2 + 1/3 = 5/6, а не 2/5.\n\n💡 Повторите тему «Сложение дробей»',
  },
];

const DIRECTOR: Msg[] = [
  {
    at: beat(8),
    side: 'bot',
    text: '☀️ AI-сводка · 13 октября\n\n• Вчера 46 уроков, посещаемость 92%\n• 3 новые заявки ждут звонка\n• 5 должников на 38 400 с.\n• 2 ученика в зоне риска',
    buttons: ['🧾 Должники', '📨 Напомнить', '📞 Заявки', '⚠️ Зона риска'],
    grid: true,
    tapped: { i: 1, at: beat(10.5) },
  },
  {
    at: beat(11.5),
    side: 'bot',
    text: '✍️ Черновик напоминания:\n«Здравствуйте! Напоминаем об оплате за октябрь — 7 600 с. Оплатить можно наличными, картой или переводом.»',
    buttons: ['📨 Отправить должникам', '🔄 Другой вариант'],
  },
];

const Bubble: React.FC<{ m: Msg; frame: number }> = ({ m, frame }) => {
  const p = pop(frame, m.at);
  if (frame < m.at) return null;
  if (m.typing && frame > m.typing[1]) return null;
  const me = m.side === 'me';
  return (
    <div
      style={{
        alignSelf: me ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
        marginTop: 12,
        // grow the slot smoothly so older messages glide up instead of jumping
        maxHeight: 520 * ease(frame, m.at, 9),
        overflow: 'hidden',
        flexShrink: 0,
        opacity: Math.min(1, p * 1.6),
        transform: `translateY(${(1 - p) * 24}px) scale(${0.92 + 0.08 * p})`,
        transformOrigin: me ? 'bottom right' : 'bottom left',
      }}
    >
      <div
        style={{
          background: me ? '#DDF3D2' : '#FFFFFF',
          borderRadius: 20,
          borderBottomRightRadius: me ? 6 : 20,
          borderBottomLeftRadius: me ? 20 : 6,
          padding: m.photo ? 6 : '12px 16px',
          boxShadow: '0 1px 1.5px rgba(22,20,31,0.12)',
          fontFamily: BODY,
          fontSize: 19,
          lineHeight: 1.38,
          color: C.ink,
          whiteSpace: 'pre-wrap',
        }}
      >
        {m.typing ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.inkSoft, fontStyle: 'italic' }}>
            <span style={{ display: 'flex', gap: 5 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: C.indigo,
                    opacity: 0.35 + 0.65 * Math.max(0, Math.sin((frame - i * 4) / 4)),
                  }}
                />
              ))}
            </span>
            ИИ проверяет работу…
          </span>
        ) : (
          <>
            {m.photo && <Notebook />}
            {m.text && <div style={{ padding: m.photo ? '8px 10px 4px' : 0 }}>{m.text}</div>}
          </>
        )}
      </div>
      {m.buttons && (
        <div style={{ display: 'grid', gridTemplateColumns: m.grid ? '1fr 1fr' : '1fr', gap: 6, marginTop: 6 }}>
          {m.buttons.map((b, i) => {
            const hit = m.tapped && m.tapped.i === i && frame >= m.tapped.at;
            const flash = m.tapped && m.tapped.i === i ? 1 - ease(frame, m.tapped.at + 6, 12) : 0;
            return (
              <div
                key={b}
                style={{
                  background: hit && flash > 0 ? `rgba(79,70,229,${0.18 + 0.4 * flash})` : 'rgba(22,20,31,0.32)',
                  color: '#fff',
                  borderRadius: 12,
                  padding: '10px 8px',
                  textAlign: 'center',
                  fontFamily: BODY,
                  fontWeight: 600,
                  fontSize: 17,
                  transform: hit ? `scale(${1 - 0.05 * flash})` : undefined,
                }}
              >
                {b}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** A photographed exercise-book page, drawn rather than stock. */
const Notebook: React.FC = () => (
  <svg width={250} height={150} viewBox="0 0 250 150" style={{ display: 'block', borderRadius: 14 }}>
    <rect width="250" height="150" fill="#FBF8EE" />
    {Array.from({ length: 9 }, (_, i) => (
      <line key={i} x1="0" x2="250" y1={18 + i * 16} y2={18 + i * 16} stroke="#C9D6EA" strokeWidth="1" />
    ))}
    <line x1="34" x2="34" y1="0" y2="150" stroke="#E7A7A0" strokeWidth="1.2" />
    <g fill="none" stroke="#3B4A8C" strokeWidth="2" strokeLinecap="round">
      <path d="M46 29 q4 -8 8 0 M60 29 h10 M76 22 v10 M84 29 h8 M98 22 q6 -4 6 4 q0 5 -6 7 h8" />
      <path d="M46 61 q5 -9 9 0 q3 6 8 0 M70 61 h12 M90 56 q6 -6 9 2 q-3 8 -9 4 M108 61 h12 M128 54 v10" />
      <path d="M46 93 h18 M70 86 q5 -6 9 1 q-2 8 -9 7 h10 M90 93 h14 M112 87 q6 -5 8 2 q0 6 -8 6" />
      <path d="M46 125 q8 -10 14 0 q6 8 12 0 M84 125 h10 M100 118 v12 M108 125 h16" />
    </g>
    <circle cx="150" cy="90" r="11" fill="none" stroke="#D9674E" strokeWidth="2" />
  </svg>
);

const Phone: React.FC<{ x: number; y: number; title: string; sub: string; msgs: Msg[]; at: number; label: string }> = ({
  x,
  y,
  title,
  sub,
  msgs,
  at,
  label,
}) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at, false);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: p, transform: `translateY(${(1 - p) * 80}px)` }}>
      <div
        style={{
          position: 'absolute',
          top: -54,
          left: 0,
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 20,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: '#B9B4C7',
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: 62,
          background: '#0B0A10',
          padding: 12,
          boxSizing: 'border-box',
          boxShadow: '0 50px 100px -30px rgba(0,0,0,0.7), inset 0 0 0 2px #2C2838',
        }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: 50, overflow: 'hidden', background: '#EAE5DA', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 112, background: '#FFFFFF', display: 'flex', alignItems: 'flex-end', padding: '0 22px 14px', gap: 14, boxSizing: 'border-box' }}>
            <LogoMark size={48} />
            <div style={{ fontFamily: BODY }}>
              <div style={{ fontWeight: 700, fontSize: 21, color: C.ink }}>{title}</div>
              <div style={{ fontSize: 16, color: C.indigo }}>{sub}</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '6px 16px 14px', overflow: 'hidden' }}>
            {msgs.map((m, i) => (
              <Bubble key={i} m={m} frame={frame} />
            ))}
          </div>
          <div style={{ height: 76, background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', fontFamily: BODY, fontSize: 18, color: C.inkMute }}>
            <Paperclip size={22} />
            <span style={{ flex: 1 }}>Сообщение</span>
            <Mic size={22} color={C.indigo} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const S7Telegram: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const bg = ease(frame, 0, 10);
  return (
    <AbsoluteFill style={{ backgroundColor: `rgba(22,20,31,${bg})` }}>
      <AbsoluteFill
        style={{
          background: 'radial-gradient(900px 700px at 70% 55%, rgba(79,70,229,0.16), transparent 70%)',
          opacity: bg,
        }}
      />
      <AbsoluteFill style={exitStyle(frame, duration)}>
        <Caption
          dark
          n="04"
          label="Telegram-бот с ИИ"
          title={['ИИ прямо', 'в Telegram']}
          body="Ученики сдают домашку — ИИ проверяет и объясняет ошибки. Директор каждое утро получает сводку по центру."
          bullets={[
            { text: 'Текстом или голосом', at: beat(4) },
            { text: 'Напоминания об уроках и оплате', at: beat(5) },
            { text: 'Родители видят оценки и долги', at: beat(6) },
          ]}
          at={2}
          width={540}
        />
        <Phone x={760} y={130} title="SabakHub" sub="бот · ученик" msgs={STUDENT} at={0} label="Ученик" />
        <Phone x={1290} y={160} title="SabakHub" sub="меню директора" msgs={DIRECTOR} at={beat(7)} label="Директор" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
