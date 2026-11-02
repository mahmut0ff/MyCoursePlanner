import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CheckCircle2, TrendingUp } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { b, camera, Card, Chip, ease, fmt, Label, Num, pop, Toast } from '../kit';
import { CAPTIONS, CATS, COURSES, INCOME, MONTHS, SPEND, TILES } from '../scenes/Finance';
import { CAP_Y, CW, CX, CY, X } from './layout';

// Bars 3–6, vertical: the «Обзор» page as a tall phone-width column; the
// camera scrolls down it one block per bar, the way you'd thumb through it.

const TW = (CW - 20) / 2;
const MOVE_Y = 970;
const CAT_Y = 1600;
const PROF_Y = 2230;

export const LowerThird: React.FC<{ n: number; text: string; frame: number; local: number; len: number }> = ({ n, text, frame, local, len }) => {
  const p = pop(local, 8);
  const out = ease(local, len - 12, 10, 'in');
  return (
    <div
      style={{
        position: 'absolute',
        left: X,
        top: CAP_Y,
        maxWidth: CW,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 26px',
        borderRadius: 20,
        background: C.ink,
        color: C.paper,
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: 34,
        lineHeight: 1.2,
        opacity: frame >= 0 ? Math.min(1, p * 1.5) * (1 - out) : 0,
        transform: `translateX(${(1 - p) * -40}px)`,
      }}
    >
      <Label color={C.teal} style={{ fontSize: 22 }}>{`0${n}`}</Label>
      {text}
    </div>
  );
};

export const RFinance: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = camera(
    frame,
    [
      { f: 0, x: CX, y: CY, s: 1 },
      { f: b(4), x: CX, y: MOVE_Y + 300, s: 1.04 },
      { f: b(8), x: CX, y: CAT_Y + 300, s: 1.04 },
      { f: b(12), x: CX, y: PROF_Y + 410, s: 1 },
    ],
    30,
    CX,
    CY,
  );
  const cap = Math.min(3, Math.floor(frame / b(4)));

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, overflow: 'hidden' }}>
      <AbsoluteFill style={cam}>
        <div style={{ position: 'absolute', left: X, top: 345, display: 'flex', gap: 6, fontFamily: BODY, opacity: ease(frame, 0, 10) }}>
          {['Обзор', 'Оплаты за месяц', 'Платежи', 'Расходы'].map((t, i) => (
            <span key={t} style={{ padding: '12px 20px', borderRadius: 14, fontWeight: 600, fontSize: 25, background: i === 0 ? C.ink : 'transparent', color: i === 0 ? C.paper : C.inkSoft, whiteSpace: 'nowrap' }}>
              {t}
            </span>
          ))}
        </div>

        {TILES.map((t, i) => (
          <Card key={t.l} x={X + (i % 2) * (TW + 20)} y={430 + Math.floor(i / 2) * 270} w={TW} h={250} at={b(i * 0.5)} from="scale">
            <div style={{ padding: '26px 28px' }}>
              <div style={{ fontSize: 25, fontWeight: 600, color: C.inkMute, lineHeight: 1.2, height: 60 }}>{t.l}</div>
              <div style={{ marginTop: 4 }}>
                <Num value={t.v} at={b(i * 0.5)} dur={54} size={i === 0 ? 50 : 52} suffix="с." />
              </div>
              <div style={{ marginTop: 14, opacity: ease(frame, b(i * 0.5) + 30, 10) }}>
                <Chip color={t.good ? C.tealDeep : i === 3 ? C.coral : C.inkSoft} bg={t.good ? C.tealSoft : i === 3 ? C.coralSoft : C.paperDeep} size={19}>
                  {t.good && <TrendingUp size={18} />} {i === 3 ? 'Просрочено счетов: 7' : t.chip}
                </Chip>
              </div>
            </div>
          </Card>
        ))}

        {/* Движение средств */}
        <Card x={X} y={MOVE_Y} w={CW} h={600} at={b(1.5)}>
          <div style={{ position: 'absolute', left: 32, top: 30, fontWeight: 700, fontSize: 34, color: C.ink }}>Движение средств</div>
          <div style={{ position: 'absolute', left: 32, top: 84, display: 'flex', gap: 24, fontSize: 24, color: C.inkSoft, fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: C.indigo }} /> Доход</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: C.amber }} /> Расход</span>
          </div>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ position: 'absolute', left: 32, right: 32, top: 170 + k * 110, height: 1, background: C.line }} />
          ))}
          {MONTHS.map((m, i) => {
            const g = ease(frame, b(4 + i * 0.5), 22);
            const gx = 44 + i * 138;
            const h1 = (INCOME[i] / 1300) * 330 * g;
            const h2 = (SPEND[i] / 1300) * 330 * ease(frame, b(4 + i * 0.5) + 6, 22);
            return (
              <React.Fragment key={m}>
                <div style={{ position: 'absolute', left: gx, top: 500 - h1, width: 52, height: h1, borderRadius: '10px 10px 3px 3px', background: i === 5 ? C.indigo : C.indigo + 'B0' }} />
                <div style={{ position: 'absolute', left: gx + 58, top: 500 - h2, width: 52, height: h2, borderRadius: '10px 10px 3px 3px', background: i === 5 ? C.amber : C.amber + 'B0' }} />
                <div style={{ position: 'absolute', left: gx - 10, width: 130, top: 516, textAlign: 'center', fontSize: 24, color: i === 5 ? C.ink : C.inkMute, fontWeight: i === 5 ? 700 : 500 }}>{m}</div>
              </React.Fragment>
            );
          })}
          {(() => {
            const p = pop(frame, b(7));
            return (
              <div style={{ position: 'absolute', right: 32, top: 26, padding: '12px 18px', borderRadius: 14, background: C.ink, color: C.paper, fontWeight: 700, fontSize: 24, opacity: Math.min(1, p * 1.5), transform: `scale(${0.85 + 0.15 * p})`, transformOrigin: 'right center', whiteSpace: 'nowrap' }}>
                Октябрь: +1 248 400
              </div>
            );
          })()}
        </Card>

        {/* Расходы по категориям */}
        <Card x={X} y={CAT_Y} w={CW} h={600} at={b(2)}>
          <div style={{ padding: '30px 32px' }}>
            <div style={{ fontWeight: 700, fontSize: 34, color: C.ink }}>Расходы по категориям</div>
            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {CATS.map((c, i) => {
                const g = ease(frame, b(8 + i * 0.4) + 6, 26);
                return (
                  <div key={c.n}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, marginBottom: 9 }}>
                      <span style={{ fontWeight: 600, color: C.ink }}>{c.n}</span>
                      <span style={{ color: C.inkSoft, fontWeight: 700 }}>{fmt(c.v * g)} с.</span>
                    </div>
                    <div style={{ height: 18, borderRadius: 9, background: C.paperDeep }}>
                      <div style={{ height: 18, borderRadius: 9, width: `${(c.v / 336900) * 100 * g}%`, background: c.c }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Прибыльность курсов */}
        <Card x={X} y={PROF_Y} w={CW} h={820} at={b(2.5)}>
          <div style={{ padding: '30px 32px' }}>
            <div style={{ fontWeight: 700, fontSize: 34, color: C.ink }}>Прибыльность курсов</div>
            {COURSES.map(([n, rev, exp, st], i) => {
              const t = ease(frame, b(12 + i * 0.4) + 8, 18);
              return (
                <div key={n} style={{ marginTop: 18, padding: '20px 24px', borderRadius: 20, background: C.paper, opacity: t, transform: `translateX(${(1 - t) * 60}px)` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, fontSize: 30, color: C.ink }}>{n}</span>
                    <span style={{ fontSize: 22, color: C.inkMute }}>{st} студ.</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                    <span style={{ fontSize: 22, color: C.inkSoft }}>
                      Выручка {fmt(rev)} · Расходы {fmt(exp)}
                    </span>
                    <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 34, color: C.tealDeep }}>{fmt(rev - exp)} с.</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </AbsoluteFill>

      <Toast at={b(2.2)} until={b(3.7)} x={X} y={1230} w={640} icon={<CheckCircle2 size={34} color={C.teal} />} title="Оплата принята" text="Айгерим К. · 6 800 с. · Карта" />

      <LowerThird n={cap + 1} text={CAPTIONS[cap]} frame={frame} local={frame - cap * b(4)} len={b(4)} />
    </AbsoluteFill>
  );
};
