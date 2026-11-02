import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { CalendarClock, CheckCircle2, ChevronDown, Percent, Plus, ShieldCheck, Wallet, X } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar, Cursor } from '../../components/ui';
import { b, camera, Card, Chip, cueAt, ease, fmt, Label, Num, pop, Slam, Toast } from '../kit';

// Bars 7–12. Labels are PayrollPage's own: RateModal «Ставка преподавателя» /
// «Как платим», the live «На деньгах этого месяца» line, the sheet's
// Рассчитано → Утверждено → Выплачено, «Выплатить и записать в расходы».
// Sheet total 336 900 с. = «Зарплата» in the finance scene.

export const S = 'payroll';
export const T_TYPE = cueAt('rateType', S);
export const T_PCT = cueAt('ratePercent', S);
export const T_NAMED = cueAt('rateNamed', S);
export const T_TOK = [cueAt('tok1', S), cueAt('tok2', S), cueAt('tok3', S), cueAt('tok4', S)];
export const T_TOTAL = cueAt('rateTotal', S);
export const T_APPROVE = cueAt('approve', S);
export const T_STAMP = cueAt('approved', S);
export const T_PAY = cueAt('pay', S);
export const T_PAID = cueAt('paid', S);

export const MODAL_AT = b(4);
export const SHEET_AT = b(12);
export const WRAP_AT = b(20);

export type T = { n: string; load: string; rate: string; got: number; due: number; c: string };
export const TEACHERS: T[] = [
  { n: 'Елена Смирнова', load: '2 гр. · 28 студ.', rate: '45 000 с. в месяц', got: 92000, due: 45000, c: C.indigo },
  { n: 'Айгерим Садыкова', load: '3 гр. · 41 студ.', rate: '20% с оплат студентов + своя сумма у 1 ученика', got: 286000, due: 58700, c: C.teal },
  { n: 'Бакыт Осмонов', load: '4 гр. · 96 студ.', rate: '250 с. с каждого заплатившего ученика', got: 138000, due: 24000, c: C.amber },
  { n: 'Нургуль Абдыева', load: '3 гр. · 52 студ.', rate: '25% с оплат студентов', got: 212000, due: 53000, c: C.coral },
  { n: 'Мээрим Касымова', load: '2 гр. · 24 студ.', rate: '38 000 с. в месяц', got: 78400, due: 38000, c: C.plum },
  { n: 'Динара Токтогулова', load: '4 гр. · 61 студ.', rate: '30% с оплат студентов', got: 262000, due: 78600, c: C.tealDeep },
  { n: 'Алексей Иванов', load: '2 гр. · 34 студ.', rate: '22% с оплат студентов', got: 180000, due: 39600, c: C.indigoDeep },
];
export const TOTAL = TEACHERS.reduce((s, t) => s + t.due, 0); // 336 900

/* ── a) teachers and their rates ─────────────────────────────────────────── */
const Rates: React.FC<{ frame: number }> = ({ frame }) => {
  const out = ease(frame, MODAL_AT - 6, 14);
  return (
    <AbsoluteFill style={{ opacity: 1 - out * 0.75, transform: `scale(${1 - out * 0.04})` }}>
      <div style={{ position: 'absolute', left: 110, top: 250, width: 760 }}>
        <Slam text="Зарплата считается сама" at={2} size={98} stagger={5} highlight={['сама']} />
        <div style={{ marginTop: 30, fontFamily: BODY, fontSize: 29, lineHeight: 1.45, color: C.inkSoft, opacity: ease(frame, 30, 14) }}>
          По ставке, которую вы задали один раз, — и по деньгам, которые студенты реально заплатили.
        </div>
      </div>
      <Card x={930} y={150} w={880} h={800} at={8}>
        <div style={{ padding: '26px 30px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 26, color: C.ink }}>Ставки преподавателей</span>
          <Chip color={C.inkSoft} bg={C.paperDeep} size={17}>7</Chip>
        </div>
        {TEACHERS.map((t, i) => {
          const p = pop(frame, 18 + i * 7);
          const hot = i === 1 && frame >= b(2.6);
          return (
            <div
              key={t.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                margin: '0 16px',
                padding: '14px 14px',
                borderRadius: 16,
                borderTop: i && !hot ? `1px solid ${C.line}` : '1px solid transparent',
                background: hot ? C.indigoSoft : 'transparent',
                boxShadow: hot ? `0 0 0 2px ${C.indigo}` : 'none',
                opacity: Math.min(1, p * 1.5),
                transform: `translateX(${(1 - p) * 40}px)`,
              }}
            >
              <Avatar name={t.n} color={t.c} size={50} />
              <div style={{ width: 290 }}>
                <div style={{ fontWeight: 700, fontSize: 23, color: C.ink }}>{t.n}</div>
                <div style={{ fontSize: 18, color: C.inkMute, marginTop: 2 }}>{t.load}</div>
              </div>
              <div style={{ flex: 1, textAlign: 'right', fontSize: 20, fontWeight: 600, color: i === 1 ? C.indigoDeep : C.inkSoft, lineHeight: 1.3 }}>{t.rate}</div>
            </div>
          );
        })}
      </Card>
    </AbsoluteFill>
  );
};

/* ── b) the rate modal with its live formula ─────────────────────────────── */
const MX = 330;
const MY = 96;
const MW = 1260;
const MH = 890;
export const OPTIONS = ['Процент с оплат студентов', 'Сумма за ученика', 'Фиксированная сумма'];

const Token: React.FC<{ at: number; frame: number; children: React.ReactNode; sub?: string; strong?: boolean }> = ({ at, frame, children, sub, strong }) => {
  const p = pop(frame, at);
  if (frame < at) return <span style={{ width: 0 }} />;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${(1 - p) * 30}px) scale(${0.7 + 0.3 * p})`, opacity: Math.min(1, p * 1.6) }}>
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: 50,
          letterSpacing: -1,
          color: strong ? '#fff' : C.ink,
          background: strong ? C.indigo : 'transparent',
          padding: strong ? '6px 22px' : '6px 4px',
          borderRadius: 18,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
      {sub && <span style={{ fontFamily: BODY, fontSize: 18, color: C.inkMute, marginTop: 4, whiteSpace: 'nowrap' }}>{sub}</span>}
    </span>
  );
};

const RateModal: React.FC<{ frame: number }> = ({ frame }) => {
  const p = pop(frame, MODAL_AT, false);
  const picked = frame >= T_TYPE;
  const typed = frame >= T_PCT + 6 ? '20' : frame >= T_PCT ? '2' : '';
  const named = pop(frame, T_NAMED + 4);
  const sel = ease(frame, T_TYPE, 10);
  const segW = (MW - 80) / 3;
  return (
    <>
      <div style={{ position: 'absolute', inset: -600, background: 'rgba(22,20,31,0.32)', opacity: ease(frame, MODAL_AT - 4, 10) }} />
      <div
        style={{
          position: 'absolute',
          left: MX,
          top: MY,
          width: MW,
          height: MH,
          borderRadius: 30,
          background: C.card,
          boxShadow: '0 50px 120px -30px rgba(22,20,31,0.55)',
          fontFamily: BODY,
          opacity: Math.min(1, p * 1.4),
          transform: `translateY(${(1 - p) * 60}px) scale(${0.94 + 0.06 * p})`,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '30px 40px 0', display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 36, color: C.ink, letterSpacing: -0.6 }}>Ставка преподавателя</div>
            <div style={{ fontSize: 22, color: C.inkMute, marginTop: 6 }}>Айгерим Садыкова · 3 гр. · 41 студ.</div>
          </div>
          <X size={30} color={C.inkMute} />
        </div>

        <div style={{ padding: '0 40px' }}>
          <Label style={{ marginTop: 28 }}>Как платим</Label>
          <div style={{ position: 'relative', display: 'flex', marginTop: 12, background: C.paper, borderRadius: 18, padding: 6 }}>
            <div
              style={{
                position: 'absolute',
                top: 6,
                bottom: 6,
                left: 6 + interpolate(sel, [0, 1], [2 * segW, 0]),
                width: segW - 4,
                borderRadius: 14,
                background: picked ? C.indigo : C.ink,
              }}
            />
            {OPTIONS.map((o, i) => {
              const on = i === (sel > 0.5 ? 0 : 2);
              return (
                <div key={o} style={{ position: 'relative', width: segW, textAlign: 'center', padding: '16px 0', fontWeight: 700, fontSize: 21, color: on ? '#fff' : C.inkSoft }}>
                  {o}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 24, marginTop: 24, alignItems: 'flex-end' }}>
            <div style={{ width: 300 }}>
              <Label>{picked ? 'Процент' : 'Сумма за месяц'}</Label>
              <div
                style={{
                  marginTop: 10,
                  height: 66,
                  borderRadius: 16,
                  border: `2px solid ${frame >= T_PCT - 4 && frame < T_NAMED ? C.indigo : C.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 20px',
                  fontFamily: DISPLAY,
                  fontWeight: 600,
                  fontSize: 32,
                  color: C.ink,
                }}
              >
                <span style={{ flex: 1 }}>
                  {picked ? typed : '30 000'}
                  {picked && frame >= T_PCT - 4 && frame < T_NAMED && Math.floor(frame / 15) % 2 === 0 && <span style={{ color: C.indigo }}>|</span>}
                </span>
                <span style={{ color: C.inkMute, fontSize: 26 }}>{picked ? '%' : 'с.'}</span>
              </div>
            </div>
            <div style={{ flex: 1, fontSize: 20, lineHeight: 1.4, color: C.inkMute, paddingBottom: 8, opacity: picked ? ease(frame, T_TYPE + 4, 10) : 0 }}>
              Считается от денег, которые студенты его групп реально заплатили
            </div>
          </div>

          <Label style={{ marginTop: 28 }}>Индивидуальные ученики</Label>
          <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'center', height: 64 }}>
            {frame >= T_NAMED + 4 ? (
              <div style={{ display: 'flex', gap: 14, opacity: Math.min(1, named * 1.5), transform: `translateY(${(1 - named) * 16}px)` }}>
                <span style={{ width: 380, height: 60, borderRadius: 14, border: `2px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', fontSize: 22, fontWeight: 600, color: C.ink }}>
                  <Avatar name="Тимур Ким" color={C.coral} size={34} /> <span style={{ flex: 1 }}>Тимур Ким</span> <ChevronDown size={22} color={C.inkMute} />
                </span>
                <span style={{ width: 210, height: 60, borderRadius: 14, border: `2px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 18px', fontFamily: DISPLAY, fontWeight: 600, fontSize: 26, color: C.ink }}>
                  <span style={{ flex: 1 }}>1 500</span>
                  <span style={{ fontFamily: BODY, color: C.inkMute, fontSize: 22 }}>с.</span>
                </span>
              </div>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderRadius: 14, border: `2px dashed ${C.indigo}66`, color: C.indigo, fontWeight: 700, fontSize: 21, transform: `scale(${frame >= T_NAMED && frame < T_NAMED + 5 ? 0.95 : 1})` }}>
                <Plus size={22} /> Добавить ученика
              </span>
            )}
          </div>

          {/* live formula */}
          <div style={{ marginTop: 26, background: C.paper, borderRadius: 24, padding: '24px 30px 22px', minHeight: 250 }}>
            <Label>Как считается · октябрь</Label>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 18, height: 100 }}>
              <Token at={T_TOK[0]} frame={frame} sub="ставка">20%</Token>
              <Token at={T_TOK[0] + 4} frame={frame}>×</Token>
              <Token at={T_TOK[1]} frame={frame} sub="заплатили студенты групп">286 000 с.</Token>
              <Token at={T_TOK[2]} frame={frame} sub="Тимур Ким, индивидуально">+ 1 500 с.</Token>
              <Token at={T_TOK[3]} frame={frame}>=</Token>
              <span style={{ transform: `scale(${1 + 0.06 * Math.max(0, 1 - Math.abs(frame - T_TOTAL - 8) / 8)})` }}>
                <Token at={T_TOTAL} frame={frame} strong sub="итого за этот месяц">
                  58 700 с.
                </Token>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 30, marginTop: 18, fontSize: 20, color: C.inkSoft, opacity: ease(frame, T_TOTAL + 10, 12) }}>
              <span>На деньгах этого месяца: 20% от 286 000 с. = 57 200 с.</span>
              <span style={{ color: C.inkMute }}>Если оплатят все счета месяца: 64 300 с.</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/* ── c) the monthly sheet: approve, pay ──────────────────────────────────── */
const Sheet: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame - SHEET_AT;
  const approved = frame >= T_STAMP;
  const paid = frame >= T_PAID;
  const status = paid ? ['Выплачено', C.tealDeep, C.tealSoft] : approved ? ['Утверждено', C.indigoDeep, C.indigoSoft] : ['Рассчитано', C.amber, C.amberSoft];
  const stamp = pop(frame, T_STAMP);
  const shake = frame >= T_STAMP && frame < T_STAMP + 12 ? Math.sin((frame - T_STAMP) * 2.2) * (1 - (frame - T_STAMP) / 12) * 5 : 0;
  const leftOut = ease(frame, T_PAID, 22);
  const btn = (label: string, active: boolean, primary: boolean, pressAt: number) => (
    <span
      style={{
        padding: '15px 24px',
        borderRadius: 15,
        fontWeight: 700,
        fontSize: 21,
        background: primary ? (active ? C.indigo : C.paperDeep) : C.card,
        color: primary ? (active ? '#fff' : C.inkMute) : C.inkSoft,
        border: primary ? 'none' : `1.5px solid ${C.line}`,
        transform: `scale(${frame >= pressAt && frame < pressAt + 6 ? 0.94 : 1})`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
  return (
    <AbsoluteFill style={{ background: C.paper, transform: `translateX(${shake}px)`, opacity: ease(f, 0, 8) }}>
      <div style={{ position: 'absolute', left: 110, top: 128, right: 110, display: 'flex', alignItems: 'center', gap: 18, fontFamily: BODY }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 46, color: C.ink, letterSpacing: -1 }}>Зарплата</span>
        <Chip color={C.inkSoft} bg={C.paperDeep} size={19}>Расчёт с 01.10 по 31.10</Chip>
        <Chip color={status[1]} bg={status[2]} size={19}>{status[0]}</Chip>
        <span style={{ flex: 1 }} />
        {btn('Пересчитать', false, false, -99)}
        {btn('Утвердить', !approved, true, T_APPROVE)}
        {btn('Выплатить всем', approved && !paid, true, T_PAY)}
      </div>
      <div style={{ position: 'absolute', left: 110, top: 202, fontFamily: BODY, fontSize: 20, color: C.inkMute }}>
        Рассчитать — зафиксировать суммы за месяц. Утвердить — запретить изменения. Выплатить — записать расходы в кассу.
      </div>

      <Card x={110} y={252} w={560} h={130} at={SHEET_AT + 2} from="scale">
        <div style={{ padding: '20px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.inkMute }}>{paid ? 'Выплачено' : 'Итого к выплате'}</div>
          <div style={{ marginTop: 6 }}>
            <Num value={TOTAL} at={SHEET_AT + 4} dur={48} size={46} suffix="с." />
          </div>
        </div>
      </Card>
      <Card x={694} y={252} w={420} h={130} at={SHEET_AT + 8} from="scale">
        <div style={{ padding: '20px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.inkMute }}>Оплатили студенты</div>
          <div style={{ marginTop: 6 }}>
            <Num value={1248400} at={SHEET_AT + 8} dur={48} size={46} suffix="с." />
          </div>
        </div>
      </Card>
      <Card x={1138} y={252} w={672} h={130} at={SHEET_AT + 14} from="scale">
        <div style={{ padding: '26px 28px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ width: 62, height: 62, borderRadius: 18, background: C.tealSoft, display: 'grid', placeItems: 'center' }}>
            <CheckCircle2 size={32} color={C.tealDeep} />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 24, color: C.ink }}>Пропущенных записей нет</div>
            <div style={{ fontSize: 19, color: C.inkMute, marginTop: 2 }}>Все преподаватели со ставкой, все оплаты привязаны</div>
          </div>
        </div>
      </Card>

      <Card x={110} y={406} w={1700} h={590} at={SHEET_AT + 6}>
        <div style={{ display: 'flex', padding: '20px 30px 14px', borderBottom: `1px solid ${C.line}`, fontSize: 17, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.inkMute }}>
          <span style={{ flex: 1.5 }}>Преподаватель</span>
          <span style={{ flex: 1.7 }}>Ставка</span>
          <span style={{ flex: 1, textAlign: 'right' }}>Оплатили студенты</span>
          <span style={{ flex: 0.9, textAlign: 'right' }}>Начислено</span>
          <span style={{ flex: 0.9, textAlign: 'right' }}>Осталось выдать</span>
        </div>
        {TEACHERS.map((t, i) => {
          const r = ease(frame, SHEET_AT + 8 + i * 4, 14);
          const at = SHEET_AT + 10 + i * 4;
          return (
            <div key={t.n} style={{ display: 'flex', alignItems: 'center', padding: '0 30px', height: 76, borderBottom: i < 6 ? `1px solid ${C.line}` : 'none', opacity: r, transform: `translateY(${(1 - r) * 20}px)` }}>
              <span style={{ flex: 1.5, display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar name={t.n} color={t.c} size={42} />
                <span>
                  <div style={{ fontWeight: 700, fontSize: 21, color: C.ink }}>{t.n}</div>
                  <div style={{ fontSize: 16, color: C.inkMute }}>{t.load}</div>
                </span>
              </span>
              <span style={{ flex: 1.7, fontSize: 18.5, color: C.inkSoft, paddingRight: 20, lineHeight: 1.3 }}>{t.rate}</span>
              <span style={{ flex: 1, textAlign: 'right' }}>
                <Num value={t.got} at={at} dur={40} size={22} family={BODY} weight={500} color={C.inkSoft} suffix="с." />
              </span>
              <span style={{ flex: 0.9, textAlign: 'right' }}>
                <Num value={t.due} at={at} dur={40} size={23} family={BODY} weight={700} suffix="с." />
              </span>
              <span style={{ flex: 0.9, textAlign: 'right', fontFamily: BODY, fontWeight: 700, fontSize: 23, color: paid ? C.tealDeep : C.ink }}>
                {fmt(t.due * (1 - leftOut))} <span style={{ fontSize: 13, color: C.inkSoft }}>с.</span>
              </span>
            </div>
          );
        })}
      </Card>

      {/* stamp */}
      {frame >= T_STAMP && (
        <div
          style={{
            position: 'absolute',
            left: 960 - 300,
            top: 620,
            width: 600,
            textAlign: 'center',
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 74,
            letterSpacing: 6,
            color: C.indigo,
            border: `6px solid ${C.indigo}`,
            borderRadius: 22,
            padding: '10px 0',
            background: 'rgba(247,245,240,0.9)',
            transform: `rotate(-9deg) scale(${1 + (1 - stamp) * 0.8})`,
            opacity: Math.min(1, stamp * 2) * (1 - ease(frame, T_PAY - 4, 10) * 0.85),
          }}
        >
          УТВЕРЖДЕНО
        </div>
      )}

      <Toast
        at={SHEET_AT + 26}
        until={T_APPROVE - 14}
        x={1250}
        y={860}
        w={560}
        icon={<span style={{ fontSize: 30 }}>🤖</span>}
        title="Зарплата за месяц посчитана — проверьте"
        text="SabakHub · 1 ноября, 13:00"
      />
      <Toast
        at={T_PAID + 2}
        x={1150}
        y={860}
        w={660}
        dark={false}
        icon={<Wallet size={30} color={C.tealDeep} />}
        title="Выплачено 336 900 с."
        text="Записано в расходы, категория «Зарплата»"
      />
    </AbsoluteFill>
  );
};

/* ── d) wrap-up ──────────────────────────────────────────────────────────── */
const Wrap: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame - WRAP_AT;
  const items = [
    { icon: Percent, t: 'Любая ставка', s: 'процент с оплат, сумма за ученика, фиксированная, индивидуальные', c: C.indigo },
    { icon: CalendarClock, t: 'Сама 1-го числа', s: 'считается по реальным оплатам студентов — вы только проверяете', c: C.teal },
    { icon: ShieldCheck, t: 'Правки с причиной', s: 'премии, штрафы и ручные суммы видны в истории', c: C.amber },
  ];
  return (
    <AbsoluteFill style={{ background: C.paper, transform: `translateY(${(1 - ease(f, 0, 14)) * 40}px)` }}>
      <div style={{ position: 'absolute', left: 110, top: 230 }}>
        <Slam text="Вы только утверждаете." at={WRAP_AT} size={88} stagger={5} highlight={['утверждаете.']} />
      </div>
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <Card key={it.t} x={110 + i * 578} y={460} w={554} h={420} at={WRAP_AT + 12 + i * 12} from="up">
            <div style={{ padding: 36 }}>
              <span style={{ width: 84, height: 84, borderRadius: 24, background: it.c + '1E', display: 'grid', placeItems: 'center' }}>
                <Icon size={42} color={it.c} />
              </span>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, color: C.ink, marginTop: 30, letterSpacing: -0.8 }}>{it.t}</div>
              <div style={{ fontSize: 24, color: C.inkSoft, marginTop: 14, lineHeight: 1.4 }}>{it.s}</div>
            </div>
          </Card>
        );
      })}
    </AbsoluteFill>
  );
};

export const Payroll: React.FC = () => {
  const frame = useCurrentFrame();
  const modalCam = camera(frame, [
    { f: 0, x: 960, y: 540, s: 1 },
    { f: T_TOK[0] - 10, x: 960, y: 700, s: 1.1 },
  ], 24);
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      {frame < SHEET_AT && (
        <AbsoluteFill style={modalCam}>
          <Rates frame={frame} />
          {frame >= MODAL_AT - 4 && <RateModal frame={frame} />}
        </AbsoluteFill>
      )}
      {frame >= SHEET_AT && frame < WRAP_AT && <Sheet frame={frame} />}
      {frame >= WRAP_AT && <Wrap frame={frame} />}

      <Cursor
        show={[b(2.2), WRAP_AT - 12]}
        keys={[
          { f: b(2.2), x: 1500, y: 980 },
          { f: b(3.4), x: 1560, y: 375, click: true },
          { f: MODAL_AT + 10, x: 1200, y: 560 },
          { f: T_TYPE, x: MX + 240, y: MY + 206, click: true },
          { f: T_PCT - 10, x: MX + 190, y: MY + 330 },
          { f: T_NAMED, x: MX + 176, y: MY + 456, click: true },
          { f: T_NAMED + 30, x: MX + 700, y: MY + 520 },
          { f: SHEET_AT, x: MX + 700, y: MY + 520 },
          { f: T_APPROVE - 26, x: 1400, y: 560 },
          { f: T_APPROVE, x: 1515, y: 154, click: true },
          { f: T_PAY, x: 1712, y: 154, click: true },
          { f: T_PAY + 30, x: 1640, y: 420 },
        ]}
      />
    </AbsoluteFill>
  );
};
