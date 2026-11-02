import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CheckCheck, CheckCircle2, Phone, Video } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { b, Chip, cueAt, ease, Mark, Num, pop, Slam } from '../kit';

// Bars 13–16 — the musical breakdown (clock ticks on every eighth).
// debt-reminders.ts: 3 days before, 1 day before, on the day, then every
// 3 days while overdue. WhatsApp goes out only when there is no Telegram;
// the template carries {{1}} name, {{2}} amount, {{3}} deadline.

export const S = 'reminders';
export const T_WA = cueAt('whatsapp', S);
export const T_TG = cueAt('telegram', S);
export const T_PAID = cueAt('parentPaid', S);

export const STEPS = [
  { d: '07.10', t: 'за 3 дня' },
  { d: '09.10', t: 'за 1 день' },
  { d: '10.10', t: 'в день оплаты' },
  { d: '13.10', t: 'каждые 3 дня, пока не оплачено' },
];

const Bubble: React.FC<{ at: number; frame: number; children: React.ReactNode; time: string; bg?: string; tg?: boolean }> = ({ at, frame, children, time, bg = '#FFFFFF', tg }) => {
  const p = pop(frame, at);
  if (frame < at) return null;
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '88%',
        marginTop: 12,
        background: bg,
        borderRadius: 18,
        borderTopLeftRadius: 6,
        padding: '14px 16px 10px',
        boxShadow: '0 1px 1.5px rgba(22,20,31,0.14)',
        fontFamily: BODY,
        fontSize: 21,
        lineHeight: 1.4,
        color: C.ink,
        whiteSpace: 'pre-wrap',
        opacity: Math.min(1, p * 1.6),
        transform: `translateY(${(1 - p) * 30}px) scale(${0.9 + 0.1 * p})`,
        transformOrigin: 'top left',
      }}
    >
      {children}
      <div style={{ textAlign: 'right', fontSize: 15, color: C.inkMute, marginTop: 4, display: 'flex', justifyContent: 'flex-end', gap: 4, alignItems: 'center' }}>
        {time} {!tg && <CheckCheck size={16} color="#53BDEB" />}
      </div>
    </div>
  );
};

const PhoneFrame: React.FC<{ x: number; y: number; w: number; h: number; at: number; frame: number; head: React.ReactNode; headBg: string; chatBg: string; children: React.ReactNode; tilt?: number }> = ({
  x,
  y,
  w,
  h,
  at,
  frame,
  head,
  headBg,
  chatBg,
  children,
  tilt = 0,
}) => {
  const p = pop(frame, at, false);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, opacity: p, transform: `translateY(${(1 - p) * 90}px) rotate(${tilt}deg)` }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 60, background: '#0B0A10', padding: 12, boxSizing: 'border-box', boxShadow: '0 50px 100px -30px rgba(0,0,0,0.75), inset 0 0 0 2px #2C2838' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 48, overflow: 'hidden', background: chatBg, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 120, background: headBg, display: 'flex', alignItems: 'flex-end', gap: 14, padding: '0 22px 16px', boxSizing: 'border-box' }}>{head}</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 16px', overflow: 'hidden' }}>{children}</div>
        </div>
      </div>
    </div>
  );
};

export const Reminders: React.FC = () => {
  const frame = useCurrentFrame();
  const bg = ease(frame, 0, 10);
  const marker = ease(frame, b(1.6), b(1.4), 'inOut'); // travels to «за 1 день»
  const paid = frame >= T_PAID;
  const flip = pop(frame, T_PAID);
  const lineOut = ease(frame, b(12), b(1));

  return (
    <AbsoluteFill style={{ backgroundColor: C.night, opacity: 0.2 + 0.8 * bg }}>
      <AbsoluteFill style={{ background: 'radial-gradient(1000px 700px at 62% 50%, rgba(20,184,166,0.10), transparent 70%)' }} />

      {/* left: headline + schedule */}
      <div style={{ position: 'absolute', left: 110, top: 150, width: 640, opacity: 1 - lineOut * 0.9 }}>
        <Slam text="Напоминания об оплате уходят сами" at={4} size={64} color={C.paper} stagger={4} highlight={['сами']} hiColor={C.teal} />
        <div style={{ position: 'relative', marginTop: 46, paddingLeft: 46 }}>
          <div style={{ position: 'absolute', left: 13, top: 14, bottom: 14, width: 3, background: C.nightLine, borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: 13, top: 14, height: `${8 + marker * 22}%`, width: 3, background: C.teal, borderRadius: 2 }} />
          {STEPS.map((s, i) => {
            const p = pop(frame, 20 + i * 12);
            const on = i === 1 && frame >= b(3);
            return (
              <div key={s.d} style={{ position: 'relative', height: 78, display: 'flex', alignItems: 'center', gap: 18, fontFamily: BODY, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * -24}px)` }}>
                <span
                  style={{
                    position: 'absolute',
                    left: -46,
                    width: 29,
                    height: 29,
                    borderRadius: 15,
                    background: on ? C.teal : C.night,
                    border: `3px solid ${on ? C.teal : '#4A4558'}`,
                    boxShadow: on ? '0 0 0 8px rgba(20,184,166,0.18)' : 'none',
                  }}
                />
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 26, color: on ? C.paper : '#9B96AC', width: 110 }}>{s.d}</span>
                <span style={{ fontSize: 25, fontWeight: 600, color: on ? C.paper : '#9B96AC' }}>{s.t}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 30, opacity: ease(frame, b(4), 12) }}>
          <Chip color={C.paper} bg="rgba(255,255,255,0.08)" size={19}>Telegram — родителю и ученику</Chip>
          <Chip color={C.paper} bg="rgba(37,211,102,0.16)" size={19}>WhatsApp — если нет Telegram</Chip>
        </div>
      </div>

      <AbsoluteFill style={{ opacity: 1 - lineOut, transform: `translateX(${lineOut * 140}px)` }}>
      {/* WhatsApp phone */}
      <PhoneFrame
        x={800}
        y={110}
        w={470}
        h={880}
        at={b(0.5)}
        frame={frame}
        headBg="#0B6E5F"
        chatBg="#EDE6DA"
        head={
          <>
            <Mark size={52} />
            <div style={{ flex: 1, fontFamily: BODY, color: '#fff' }}>
              <div style={{ fontWeight: 700, fontSize: 22 }}>SabakHub</div>
              <div style={{ fontSize: 16, opacity: 0.8 }}>учебный центр · WhatsApp</div>
            </div>
            <Video size={24} color="#fff" />
            <Phone size={22} color="#fff" />
          </>
        }
      >
        <div style={{ alignSelf: 'center', marginTop: 8, padding: '6px 14px', borderRadius: 10, background: '#E1F2F7', fontFamily: BODY, fontSize: 16, color: C.inkSoft, opacity: ease(frame, b(1), 10) }}>
          9 октября
        </div>
        <Bubble at={T_WA} frame={frame} time="15:00">
          <b>Напоминание об оплате</b>
          {'\n'}Здравствуйте! Ученик: Бекзат Токтогулов.{'\n'}Сумма к оплате: <b>8 000 с.</b>
          {'\n'}Оплатить до: <b>10.10.2026</b>
        </Bubble>
      </PhoneFrame>

      {/* Telegram phone */}
      <PhoneFrame
        x={1340}
        y={170}
        w={440}
        h={820}
        at={T_TG - 16}
        frame={frame}
        tilt={2}
        headBg="#FFFFFF"
        chatBg="#E7EBF0"
        head={
          <>
            <Mark size={50} />
            <div style={{ fontFamily: BODY }}>
              <div style={{ fontWeight: 700, fontSize: 21, color: C.ink }}>SabakHub</div>
              <div style={{ fontSize: 16, color: '#3A8BD8' }}>бот · Telegram</div>
            </div>
          </>
        }
      >
        <Bubble at={T_TG} frame={frame} time="15:00" tg>
          👨‍👩‍👦 <b>Айпери Жумабаева</b>
          {'\n'}🔔 <b>Напоминание об оплате</b>
          {'\n'}Оплата завтра: 7 600 с. за «Английский A2».
        </Bubble>
        <Bubble at={T_PAID + 6} frame={frame} time="16:41" tg>
          ✅ <b>Оплата принята</b>
          {'\n'}7 600 с. · Английский A2
        </Bubble>
      </PhoneFrame>
      </AbsoluteFill>

      {/* finance row flips to paid */}
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 826,
          width: 640,
          borderRadius: 24,
          background: C.card,
          padding: '22px 26px',
          fontFamily: BODY,
          boxShadow: '0 30px 60px -24px rgba(0,0,0,0.6)',
          opacity: ease(frame, b(8), 12) * (1 - ease(frame, b(12), 10)),
          transform: `translateY(${(1 - ease(frame, b(8), 16)) * 40}px)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 23, color: C.ink }}>Айпери Жумабаева</div>
            <div style={{ fontSize: 18, color: C.inkMute, marginTop: 2 }}>Английский A2 · до 10.10.2026</div>
          </div>
          <span style={{ transform: `scale(${paid ? 0.85 + 0.15 * flip : 1})` }}>
            {paid ? (
              <Chip color={C.tealDeep} bg={C.tealSoft} size={20}>
                <CheckCircle2 size={18} /> Оплачено
              </Chip>
            ) : (
              <Chip color={C.amber} bg={C.amberSoft} size={20}>Ожидает · 7 600 с.</Chip>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
          <span style={{ fontSize: 19, color: C.inkMute, fontWeight: 600 }}>Дебиторская задолженность</span>
          {paid ? <Num value={86400} from={94000} at={T_PAID} dur={30} size={30} suffix="с." /> : <Num value={94000} from={94000} at={0} size={30} suffix="с." />}
        </div>
      </div>

      {/* bar 16: the benefit, over the riser */}
      <div style={{ position: 'absolute', left: 110, top: 380, width: 1700, opacity: ease(frame, b(12), 8) }}>
        {frame >= b(12) && <Slam text="Без звонков и неловких разговоров о деньгах" at={b(12)} size={86} color={C.paper} stagger={4} maxWidth={1000} highlight={['звонков', 'неловких']} hiColor={C.teal} />}
      </div>
    </AbsoluteFill>
  );
};
