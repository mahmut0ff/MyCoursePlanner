import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CheckCheck, CheckCircle2 } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { b, Chip, ease, Mark, Num, pop, Slam } from '../kit';
import { STEPS, T_PAID, T_TG, T_WA } from '../scenes/Reminders';
import { CW, X } from './layout';

// Bars 13–16 (breakdown), vertical. Instead of two small phones side by
// side, the chats are shown as phone-width panels stacked like a feed:
// schedule → WhatsApp → parent's Telegram + the invoice flipping to paid.

const Panel: React.FC<{ y: number; at: number; frame: number; head: React.ReactNode; headBg: string; bg: string; children: React.ReactNode; shift?: number; out?: number }> = ({
  y,
  at,
  frame,
  head,
  headBg,
  bg,
  children,
  shift = 0,
  out = 0,
}) => {
  const p = pop(frame, at, false);
  if (frame < at) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: X,
        top: y + shift,
        width: CW,
        borderRadius: 30,
        overflow: 'hidden',
        background: bg,
        boxShadow: '0 40px 80px -30px rgba(0,0,0,0.7)',
        opacity: Math.min(1, p * 1.4) * (1 - out),
        transform: `translateY(${(1 - p) * 120 - out * 60}px)`,
      }}
    >
      <div style={{ height: 96, background: headBg, display: 'flex', alignItems: 'center', gap: 16, padding: '0 26px' }}>{head}</div>
      <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
};

const Bubble: React.FC<{ at: number; frame: number; time: string; tg?: boolean; children: React.ReactNode }> = ({ at, frame, time, tg, children }) => {
  const p = pop(frame, at);
  if (frame < at) return null;
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '94%',
        marginTop: 10,
        background: '#fff',
        borderRadius: 22,
        borderTopLeftRadius: 6,
        padding: '18px 22px 12px',
        boxShadow: '0 1px 2px rgba(22,20,31,0.14)',
        fontFamily: BODY,
        fontSize: 30,
        lineHeight: 1.38,
        color: C.ink,
        whiteSpace: 'pre-wrap',
        opacity: Math.min(1, p * 1.6),
        transform: `translateY(${(1 - p) * 30}px) scale(${0.92 + 0.08 * p})`,
        transformOrigin: 'top left',
      }}
    >
      {children}
      <div style={{ textAlign: 'right', fontSize: 20, color: C.inkMute, marginTop: 4, display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
        {time} {!tg && <CheckCheck size={20} color="#53BDEB" />}
      </div>
    </div>
  );
};

export const RReminders: React.FC = () => {
  const frame = useCurrentFrame();
  const bg = ease(frame, 0, 10);
  const marker = ease(frame, b(1.6), b(1.4), 'inOut');
  const timelineOut = ease(frame, T_WA - 12, 14);
  const waOut = ease(frame, b(8), 16, 'in');
  const tgUp = ease(frame, b(8), 22, 'inOut');
  const paid = frame >= T_PAID;
  const flip = pop(frame, T_PAID);
  const end = ease(frame, b(12), b(1));

  return (
    <AbsoluteFill style={{ backgroundColor: C.night, opacity: 0.2 + 0.8 * bg }}>
      <AbsoluteFill style={{ background: 'radial-gradient(900px 900px at 50% 60%, rgba(20,184,166,0.10), transparent 70%)' }} />

      <AbsoluteFill style={{ opacity: 1 - end, transform: `translateY(${-end * 60}px)` }}>
        <div style={{ position: 'absolute', left: X, top: 350, width: CW }}>
          <Slam text="Напоминания об оплате уходят сами" at={4} size={86} color={C.paper} stagger={4} highlight={['сами']} hiColor={C.teal} />
        </div>
        <div style={{ position: 'absolute', left: X, top: 690, display: 'flex', gap: 12, flexWrap: 'wrap', width: CW, opacity: ease(frame, b(1.5), 12) }}>
          <Chip color={C.paper} bg="rgba(255,255,255,0.09)" size={23}>Telegram — родителю и ученику</Chip>
          <Chip color={C.paper} bg="rgba(37,211,102,0.18)" size={23}>WhatsApp — если нет Telegram</Chip>
        </div>

        {/* schedule (bar 13) */}
        <div style={{ position: 'absolute', left: X + 46, top: 800, width: CW - 46, opacity: 1 - timelineOut }}>
          <div style={{ position: 'absolute', left: -33, top: 30, bottom: 30, width: 4, background: C.nightLine, borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: -33, top: 30, height: `${10 + marker * 24}%`, width: 4, background: C.teal, borderRadius: 2 }} />
          {STEPS.map((s, i) => {
            const p = pop(frame, 20 + i * 12);
            const on = i === 1 && frame >= b(3);
            return (
              <div key={s.d} style={{ position: 'relative', height: 100, display: 'flex', alignItems: 'center', gap: 22, fontFamily: BODY, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * -24}px)` }}>
                <span style={{ position: 'absolute', left: -50, width: 38, height: 38, borderRadius: 19, background: on ? C.teal : C.night, border: `4px solid ${on ? C.teal : '#4A4558'}`, boxSizing: 'border-box', boxShadow: on ? '0 0 0 10px rgba(20,184,166,0.18)' : 'none' }} />
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 36, color: on ? C.paper : '#9B96AC', width: 140 }}>{s.d}</span>
                <span style={{ fontSize: 31, fontWeight: 600, color: on ? C.paper : '#9B96AC' }}>{s.t}</span>
              </div>
            );
          })}
        </div>

        {/* WhatsApp (bar 14) */}
        <Panel
          y={800}
          at={T_WA - 8}
          frame={frame}
          out={waOut}
          headBg="#0B6E5F"
          bg="#EDE6DA"
          head={
            <>
              <Mark size={58} />
              <div style={{ fontFamily: BODY, color: '#fff' }}>
                <div style={{ fontWeight: 700, fontSize: 30 }}>SabakHub</div>
                <div style={{ fontSize: 22, opacity: 0.85 }}>учебный центр · WhatsApp</div>
              </div>
            </>
          }
        >
          <Bubble at={T_WA} frame={frame} time="15:00">
            <b>Напоминание об оплате</b>
            {'\n'}Здравствуйте! Ученик: Бекзат Токтогулов.{'\n'}Сумма к оплате: <b>8 000 с.</b>
            {'\n'}Оплатить до: <b>10.10.2026</b>
          </Bubble>
        </Panel>

        {/* parent's Telegram (bar 14½ → moves up in bar 15) */}
        <Panel
          y={1190}
          shift={interpolate(tgUp, [0, 1], [0, -430])}
          at={T_TG - 10}
          frame={frame}
          headBg="#FFFFFF"
          bg="#E7EBF0"
          head={
            <>
              <Mark size={56} />
              <div style={{ fontFamily: BODY }}>
                <div style={{ fontWeight: 700, fontSize: 29, color: C.ink }}>SabakHub</div>
                <div style={{ fontSize: 22, color: '#3A8BD8' }}>бот · Telegram</div>
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
            ✅ <b>Оплата принята</b> · 7 600 с.
          </Bubble>
        </Panel>

        {/* the invoice (bar 15) */}
        <div
          style={{
            position: 'absolute',
            left: X,
            top: 1290,
            width: CW,
            borderRadius: 28,
            background: C.card,
            padding: '24px 30px',
            boxSizing: 'border-box',
            fontFamily: BODY,
            boxShadow: '0 30px 60px -24px rgba(0,0,0,0.6)',
            opacity: ease(frame, b(8) + 10, 12),
            transform: `translateY(${(1 - ease(frame, b(8) + 10, 18)) * 60}px)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 30, color: C.ink }}>Айпери Жумабаева</div>
              <div style={{ fontSize: 23, color: C.inkMute, marginTop: 2 }}>Английский A2 · до 10.10.2026</div>
            </div>
            <span style={{ transform: `scale(${paid ? 0.85 + 0.15 * flip : 1})` }}>
              {paid ? (
                <Chip color={C.tealDeep} bg={C.tealSoft} size={25}>
                  <CheckCircle2 size={24} /> Оплачено
                </Chip>
              ) : (
                <Chip color={C.amber} bg={C.amberSoft} size={25}>Ожидает</Chip>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 23, color: C.inkMute, fontWeight: 600 }}>Дебиторская задолженность</span>
            {paid ? <Num value={86400} from={94000} at={T_PAID} dur={30} size={36} suffix="с." /> : <Num value={94000} from={94000} at={0} size={36} suffix="с." />}
          </div>
        </div>
      </AbsoluteFill>

      {frame >= b(12) && (
        <div style={{ position: 'absolute', left: X, top: 560, width: CW }}>
          <Slam text="Без звонков и неловких разговоров о деньгах" at={b(12)} size={100} color={C.paper} stagger={4} highlight={['звонков', 'неловких']} hiColor={C.teal} />
        </div>
      )}
    </AbsoluteFill>
  );
};
