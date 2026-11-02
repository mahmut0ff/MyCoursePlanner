import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CalendarClock, CheckCircle2, ChevronDown, Percent, Plus, ShieldCheck, Wallet, X as Close } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar, Cursor } from '../../components/ui';
import { b, camera, Card, Chip, ease, fmt, Label, Num, pop, Slam, Toast } from '../kit';
import { MODAL_AT, OPTIONS, SHEET_AT, T_APPROVE, T_NAMED, T_PAID, T_PAY, T_PCT, T_STAMP, T_TOK, T_TOTAL, T_TYPE, TEACHERS, TOTAL, WRAP_AT } from '../scenes/Payroll';
import { CW, CX, CY, X } from './layout';

// Bars 7–12, vertical. Same beats as the 16:9 cut: rates → the rate modal
// (as a phone bottom sheet, options stacked) with the formula building on
// the ticks → the monthly sheet, approve (stamp) and pay → «Вы только
// утверждаете».

/* a) rates */
const Rates: React.FC<{ frame: number }> = ({ frame }) => {
  const out = ease(frame, MODAL_AT - 6, 14);
  return (
    <AbsoluteFill style={{ opacity: 1 - out * 0.75 }}>
      <div style={{ position: 'absolute', left: X, top: 350, width: CW }}>
        <Slam text="Зарплата считается сама" at={2} size={104} stagger={5} highlight={['сама']} />
        <div style={{ marginTop: 26, fontFamily: BODY, fontSize: 32, lineHeight: 1.4, color: C.inkSoft, opacity: ease(frame, 30, 14) }}>
          По ставке, которую вы задали один раз, — и по реальным оплатам студентов.
        </div>
      </div>
      <Card x={X} y={890} w={CW} h={500} at={8}>
        <div style={{ padding: '24px 30px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 30, color: C.ink }}>Ставки преподавателей</span>
          <Chip color={C.inkSoft} bg={C.paperDeep} size={20}>7</Chip>
        </div>
        {TEACHERS.slice(0, 4).map((t, i) => {
          const p = pop(frame, 18 + i * 7);
          const hot = i === 1 && frame >= b(2.6);
          return (
            <div
              key={t.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                margin: '0 14px',
                padding: '14px 16px',
                borderRadius: 18,
                borderTop: i && !hot ? `1px solid ${C.line}` : '1px solid transparent',
                background: hot ? C.indigoSoft : 'transparent',
                boxShadow: hot ? `0 0 0 3px ${C.indigo}` : 'none',
                opacity: Math.min(1, p * 1.5),
                transform: `translateX(${(1 - p) * 40}px)`,
              }}
            >
              <Avatar name={t.n} color={t.c} size={58} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 28, color: C.ink }}>{t.n}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: i === 1 ? C.indigoDeep : C.inkSoft, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.rate}</div>
              </div>
            </div>
          );
        })}
      </Card>
    </AbsoluteFill>
  );
};

/* b) rate modal as a bottom sheet */
const MX = 30;
const MY = 290;
const MW = 1020;

const Token: React.FC<{ at: number; frame: number; children: React.ReactNode; sub?: string; strong?: boolean }> = ({ at, frame, children, sub, strong }) => {
  const p = pop(frame, at);
  if (frame < at) return null;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${(1 - p) * 30}px) scale(${0.7 + 0.3 * p})`, opacity: Math.min(1, p * 1.6) }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 62, letterSpacing: -1.5, color: strong ? '#fff' : C.ink, background: strong ? C.indigo : 'transparent', padding: strong ? '6px 24px' : '6px 2px', borderRadius: 20, whiteSpace: 'nowrap' }}>
        {children}
      </span>
      {sub && <span style={{ fontFamily: BODY, fontSize: 21, color: C.inkMute, marginTop: 4, whiteSpace: 'nowrap' }}>{sub}</span>}
    </span>
  );
};

const RateSheet: React.FC<{ frame: number }> = ({ frame }) => {
  const p = pop(frame, MODAL_AT, false);
  const sel = ease(frame, T_TYPE, 10);
  const picked = sel > 0.5;
  const typed = frame >= T_PCT + 6 ? '20' : frame >= T_PCT ? '2' : '';
  const named = pop(frame, T_NAMED + 4);
  return (
    <>
      <div style={{ position: 'absolute', inset: -800, background: 'rgba(22,20,31,0.34)', opacity: ease(frame, MODAL_AT - 4, 10) }} />
      <div
        style={{
          position: 'absolute',
          left: MX,
          top: MY,
          width: MW,
          height: 1260,
          borderRadius: 40,
          background: C.card,
          boxShadow: '0 50px 120px -30px rgba(22,20,31,0.55)',
          fontFamily: BODY,
          opacity: Math.min(1, p * 1.4),
          transform: `translateY(${(1 - p) * 120}px)`,
          overflow: 'hidden',
          padding: '34px 40px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 44, color: C.ink, letterSpacing: -0.8 }}>Ставка преподавателя</div>
            <div style={{ fontSize: 27, color: C.inkMute, marginTop: 8 }}>Айгерим Садыкова · 3 гр. · 41 студ.</div>
          </div>
          <Close size={36} color={C.inkMute} />
        </div>

        <Label style={{ marginTop: 30, fontSize: 21 }}>Как платим</Label>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {OPTIONS.map((o, i) => {
            const on = i === (picked ? 0 : 2);
            const glow = i === 0 ? sel : i === 2 ? 1 - sel : 0;
            return (
              <div
                key={o}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  height: 76,
                  padding: '0 24px',
                  borderRadius: 18,
                  border: `2.5px solid ${glow > 0.5 ? (i === 0 ? C.indigo : C.ink) : C.line}`,
                  background: glow > 0.5 && i === 0 ? C.indigoSoft : C.card,
                  fontWeight: 700,
                  fontSize: 29,
                  color: on ? C.ink : C.inkSoft,
                  transform: `scale(${i === 0 && frame >= T_TYPE && frame < T_TYPE + 6 ? 0.97 : 1})`,
                }}
              >
                <span style={{ width: 32, height: 32, borderRadius: 16, border: `3px solid ${on ? (i === 0 ? C.indigo : C.ink) : C.inkMute}`, display: 'grid', placeItems: 'center' }}>
                  {on && <span style={{ width: 16, height: 16, borderRadius: 8, background: i === 0 ? C.indigo : C.ink }} />}
                </span>
                {o}
              </div>
            );
          })}
        </div>

        <Label style={{ marginTop: 26, fontSize: 21 }}>{picked ? 'Процент' : 'Сумма за месяц'}</Label>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 12 }}>
          <div style={{ width: 300, height: 84, borderRadius: 18, border: `2.5px solid ${frame >= T_PCT - 4 && frame < T_NAMED ? C.indigo : C.line}`, display: 'flex', alignItems: 'center', padding: '0 24px', boxSizing: 'border-box', fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, color: C.ink }}>
            <span style={{ flex: 1 }}>
              {picked ? typed : '30 000'}
              {picked && frame >= T_PCT - 4 && frame < T_NAMED && Math.floor(frame / 15) % 2 === 0 && <span style={{ color: C.indigo }}>|</span>}
            </span>
            <span style={{ color: C.inkMute, fontSize: 32 }}>{picked ? '%' : 'с.'}</span>
          </div>
          <div style={{ flex: 1, fontSize: 23, lineHeight: 1.35, color: C.inkMute, opacity: picked ? ease(frame, T_TYPE + 4, 10) : 0 }}>
            Считается от денег, которые студенты его групп реально заплатили
          </div>
        </div>

        <Label style={{ marginTop: 26, fontSize: 21 }}>Индивидуальные ученики</Label>
        <div style={{ marginTop: 12, height: 80 }}>
          {frame >= T_NAMED + 4 ? (
            <div style={{ display: 'flex', gap: 14, opacity: Math.min(1, named * 1.5), transform: `translateY(${(1 - named) * 16}px)` }}>
              <span style={{ flex: 1, height: 78, borderRadius: 18, border: `2.5px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', fontSize: 28, fontWeight: 600, color: C.ink }}>
                <Avatar name="Тимур Ким" color={C.coral} size={44} /> <span style={{ flex: 1 }}>Тимур Ким</span> <ChevronDown size={28} color={C.inkMute} />
              </span>
              <span style={{ width: 250, height: 78, borderRadius: 18, border: `2.5px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 22px', boxSizing: 'border-box', fontFamily: DISPLAY, fontWeight: 600, fontSize: 34, color: C.ink }}>
                <span style={{ flex: 1 }}>1 500</span>
                <span style={{ fontFamily: BODY, color: C.inkMute, fontSize: 28 }}>с.</span>
              </span>
            </div>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '18px 26px', borderRadius: 18, border: `2.5px dashed ${C.indigo}66`, color: C.indigo, fontWeight: 700, fontSize: 27, transform: `scale(${frame >= T_NAMED && frame < T_NAMED + 5 ? 0.95 : 1})` }}>
              <Plus size={28} /> Добавить ученика
            </span>
          )}
        </div>

        <div style={{ marginTop: 26, background: C.paper, borderRadius: 28, padding: '26px 30px', height: 330, boxSizing: 'border-box' }}>
          <Label style={{ fontSize: 21 }}>Как считается · октябрь</Label>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 16, height: 104 }}>
            <Token at={T_TOK[0]} frame={frame} sub="ставка">20%</Token>
            <Token at={T_TOK[0] + 4} frame={frame}>×</Token>
            <Token at={T_TOK[1]} frame={frame} sub="заплатили студенты групп">286 000 с.</Token>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 6, height: 104 }}>
            <Token at={T_TOK[2]} frame={frame} sub="Тимур Ким, индивидуально">+ 1 500 с.</Token>
            <Token at={T_TOK[3]} frame={frame}>=</Token>
            <span style={{ transform: `scale(${1 + 0.06 * Math.max(0, 1 - Math.abs(frame - T_TOTAL - 8) / 8)})` }}>
              <Token at={T_TOTAL} frame={frame} strong sub="итого за этот месяц">
                58 700 с.
              </Token>
            </span>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 23, lineHeight: 1.4, color: C.inkSoft, opacity: ease(frame, T_TOTAL + 10, 12) }}>
          На деньгах этого месяца: 20% от 286 000 с. = 57 200 с.
        </div>
      </div>
    </>
  );
};

/* c) the monthly sheet */
const Sheet: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame - SHEET_AT;
  const approved = frame >= T_STAMP;
  const paid = frame >= T_PAID;
  const status = paid ? ['Выплачено', C.tealDeep, C.tealSoft] : approved ? ['Утверждено', C.indigoDeep, C.indigoSoft] : ['Рассчитано', C.amber, C.amberSoft];
  const stamp = pop(frame, T_STAMP);
  const shake = frame >= T_STAMP && frame < T_STAMP + 12 ? Math.sin((frame - T_STAMP) * 2.2) * (1 - (frame - T_STAMP) / 12) * 6 : 0;
  const leftOut = ease(frame, T_PAID, 22);
  const btn = (label: string, active: boolean, pressAt: number) => (
    <span style={{ padding: '20px 30px', borderRadius: 18, fontWeight: 700, fontSize: 28, background: active ? C.indigo : C.paperDeep, color: active ? '#fff' : C.inkMute, transform: `scale(${frame >= pressAt && frame < pressAt + 6 ? 0.94 : 1})`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
  return (
    <AbsoluteFill style={{ background: C.paper, transform: `translateX(${shake}px)`, opacity: ease(f, 0, 8) }}>
      <div style={{ position: 'absolute', left: X, top: 345, width: CW, fontFamily: BODY }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 60, color: C.ink, letterSpacing: -1.4 }}>Зарплата</span>
          <Chip color={status[1]} bg={status[2]} size={24}>{status[0]}</Chip>
        </div>
        <div style={{ marginTop: 12 }}>
          <Chip color={C.inkSoft} bg={C.paperDeep} size={22}>Расчёт с 01.10 по 31.10</Chip>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 22 }}>
          {btn('Утвердить', !approved, T_APPROVE)}
          {btn('Выплатить всем', approved && !paid, T_PAY)}
        </div>
      </div>

      <Card x={X} y={640} w={CW} h={150} at={SHEET_AT + 2} from="scale">
        <div style={{ padding: '24px 30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 26, fontWeight: 600, color: C.inkMute }}>{paid ? 'Выплачено' : 'Итого к выплате'}</div>
          <Num value={TOTAL} at={SHEET_AT + 4} dur={48} size={58} suffix="с." />
        </div>
      </Card>

      <Card x={X} y={812} w={CW} h={600} at={SHEET_AT + 6}>
        {TEACHERS.map((t, i) => {
          const r = ease(frame, SHEET_AT + 8 + i * 4, 14);
          return (
            <div key={t.n} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 26px', height: 85, borderBottom: i < 6 ? `1px solid ${C.line}` : 'none', opacity: r, transform: `translateY(${(1 - r) * 20}px)` }}>
              <Avatar name={t.n} color={t.c} size={48} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 25, color: C.ink }}>{t.n}</div>
                <div style={{ fontSize: 19, color: C.inkMute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.rate}</div>
              </span>
              <span style={{ width: 230, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontFamily: BODY, fontWeight: 700, fontSize: 28, color: paid ? C.tealDeep : C.ink }}>
                {paid ? fmt(t.due) : <Num value={t.due} at={SHEET_AT + 10 + i * 4} dur={40} size={28} family={BODY} weight={700} />}
                <span style={{ fontSize: 17, color: C.inkSoft }}>с.</span>
                {paid && (
                  <span style={{ transform: `scale(${pop(frame, T_PAID + i * 3)})`, display: 'inline-flex' }}>
                    <CheckCircle2 size={26} color={C.teal} />
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </Card>

      {frame >= T_STAMP && (
        <div
          style={{
            position: 'absolute',
            left: 540 - 400,
            top: 990,
            width: 800,
            textAlign: 'center',
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 74,
            letterSpacing: 4,
            color: C.indigo,
            border: `7px solid ${C.indigo}`,
            borderRadius: 26,
            padding: '14px 0',
            background: 'rgba(247,245,240,0.9)',
            transform: `rotate(-9deg) scale(${1 + (1 - stamp) * 0.8})`,
            opacity: Math.min(1, stamp * 2) * (1 - ease(frame, T_PAY - 4, 10) * 0.85),
          }}
        >
          УТВЕРЖДЕНО
        </div>
      )}

      <Toast at={SHEET_AT + 26} until={T_APPROVE - 14} x={X} y={1180} w={CW} icon={<span style={{ fontSize: 36 }}>🤖</span>} title="Зарплата за месяц посчитана — проверьте" text="SabakHub · 1 ноября, 13:00" />
      <Toast at={T_PAID + 2} x={X} y={1180} w={CW} dark={false} icon={<Wallet size={36} color={C.tealDeep} />} title="Выплачено 336 900 с." text="Записано в расходы, категория «Зарплата»" />
    </AbsoluteFill>
  );
};

/* d) wrap-up */
const Wrap: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame - WRAP_AT;
  const items = [
    { icon: Percent, t: 'Любая ставка', s: 'процент с оплат, за ученика, фиксированная, индивидуальные', c: C.indigo },
    { icon: CalendarClock, t: 'Сама 1-го числа', s: 'по реальным оплатам — вы только проверяете', c: C.teal },
    { icon: ShieldCheck, t: 'Правки с причиной', s: 'премии, штрафы и ручные суммы — в истории', c: C.amber },
  ];
  return (
    <AbsoluteFill style={{ background: C.paper, transform: `translateY(${(1 - ease(f, 0, 14)) * 40}px)` }}>
      <div style={{ position: 'absolute', left: X, top: 360, width: CW }}>
        <Slam text="Вы только утверждаете." at={WRAP_AT} size={100} stagger={5} highlight={['утверждаете.']} />
      </div>
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <Card key={it.t} x={X} y={660 + i * 250} w={CW} h={226} at={WRAP_AT + 12 + i * 12} from="right">
            <div style={{ padding: '30px 34px', display: 'flex', gap: 26, alignItems: 'center', height: '100%', boxSizing: 'border-box' }}>
              <span style={{ width: 100, height: 100, borderRadius: 28, background: it.c + '1E', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon size={50} color={it.c} />
              </span>
              <div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 42, color: C.ink, letterSpacing: -0.8 }}>{it.t}</div>
                <div style={{ fontSize: 26, color: C.inkSoft, marginTop: 8, lineHeight: 1.35 }}>{it.s}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </AbsoluteFill>
  );
};

export const RPayroll: React.FC = () => {
  const frame = useCurrentFrame();
  const modalCam = camera(frame, [{ f: 0, x: CX, y: CY, s: 1 }, { f: T_TOK[0] - 10, x: CX, y: 1250, s: 1.06 }], 24, CX, CY);
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      {frame < SHEET_AT && (
        <AbsoluteFill style={modalCam}>
          <Rates frame={frame} />
          {frame >= MODAL_AT - 4 && <RateSheet frame={frame} />}
        </AbsoluteFill>
      )}
      {frame >= SHEET_AT && frame < WRAP_AT && <Sheet frame={frame} />}
      {frame >= WRAP_AT && <Wrap frame={frame} />}

      <Cursor
        show={[b(2.2), WRAP_AT - 12]}
        // targets follow the layout: option rows from MY+195, the % field, «Добавить ученика»,
        // and the sheet's button row at y≈524
        keys={[
          { f: b(2.2), x: 760, y: 1300 },
          { f: b(3.4), x: 700, y: 1091, click: true },
          { f: MODAL_AT + 10, x: 700, y: 900 },
          { f: T_TYPE, x: 380, y: 523, click: true },
          { f: T_PCT - 10, x: 230, y: 838 },
          { f: T_NAMED, x: 225, y: 979, click: true },
          { f: T_NAMED + 30, x: 700, y: 1300 },
          { f: SHEET_AT, x: 700, y: 1300 },
          { f: T_APPROVE - 26, x: 600, y: 760 },
          { f: T_APPROVE, x: 165, y: 524, click: true },
          { f: T_PAY, x: 430, y: 524, click: true },
          { f: T_PAY + 30, x: 600, y: 760 },
        ]}
      />
    </AbsoluteFill>
  );
};
