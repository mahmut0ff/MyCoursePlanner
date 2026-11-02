import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CheckCircle2, TrendingUp } from 'lucide-react';
import { BODY, C } from '../../theme';
import { b, camera, Card, Chip, ease, fmt, Label, Num, pop, Toast } from '../kit';

// Bars 3–6 (drop A). The real «Финансы → Обзор» blocks, filmed like a
// product shot: four tiles land on the drop, then the camera visits
// «Движение средств», «Расходы по категориям» and «Прибыльность курсов».
// All figures reconcile: 1 248 400 − 812 300 = 436 100.

const TILE_W = (1980 - 3 * 24) / 4;
export const TILES = [
  { l: 'Выручка', v: 1248400, chip: '+10% к прошлому периоду', good: true },
  { l: 'Расходы', v: 812300, chip: '+4% к прошлому периоду', good: false },
  { l: 'Чистая прибыль', v: 436100, chip: 'маржа 35%', good: true },
  { l: 'Дебиторская задолженность', v: 94000, chip: 'Просрочено счетов: 7 · Должников: 12', good: false },
];

export const MONTHS = ['Май', 'Июнь', 'Июль', 'Авг', 'Сен', 'Окт'];
export const INCOME = [980, 1020, 760, 840, 1130, 1248];
export const SPEND = [690, 700, 610, 650, 780, 812];

// Зарплата = the payroll sheet total in the next scene (336 900).
export const CATS = [
  { n: 'Зарплата', v: 336900, c: C.indigo },
  { n: 'Аренда', v: 260000, c: C.teal },
  { n: 'Реклама', v: 96000, c: C.amber },
  { n: 'Прочее', v: 71400, c: C.coral },
  { n: 'Коммунальные', v: 48000, c: C.plum },
];

export const COURSES = [
  ['Английский язык', 486000, 248000, 142],
  ['Подготовка к школе', 312000, 171000, 96],
  ['Робототехника', 228000, 139000, 54],
  ['Frontend-разработчик', 222400, 126300, 34],
] as const;

export const CAPTIONS = ['Выручка, расходы, прибыль — за секунду', 'Движение денег по месяцам', 'Куда уходят деньги', 'Какой курс реально приносит прибыль'];

export const Finance: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = camera(frame, [
    { f: 0, x: 1100, y: 560, s: 0.86 },
    { f: b(4), x: 700, y: 640, s: 1.42 },
    { f: b(8), x: 1702, y: 625, s: 1.55 },
    { f: b(12), x: 1100, y: 1030, s: 0.92 },
  ], 30);
  const cap = Math.min(3, Math.floor(frame / b(4)));
  const capLocal = frame - cap * b(4);
  const capIn = pop(capLocal, 8);
  const capOut = ease(capLocal, b(4) - 12, 10, 'in');

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, overflow: 'hidden' }}>
      <AbsoluteFill style={cam}>
        {/* tabs + scope */}
        <div style={{ position: 'absolute', left: 110, top: 70, display: 'flex', gap: 8, fontFamily: BODY, opacity: ease(frame, 0, 10) }}>
          {['Обзор', 'Оплаты за месяц', 'Платежи', 'Расходы'].map((t, i) => (
            <span key={t} style={{ padding: '12px 22px', borderRadius: 14, fontWeight: 600, fontSize: 22, background: i === 0 ? C.ink : 'transparent', color: i === 0 ? C.paper : C.inkSoft }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ position: 'absolute', left: 1490, width: 600, top: 70, display: 'flex', justifyContent: 'flex-end', gap: 10, opacity: ease(frame, 0, 10) }}>
          <Chip color={C.inkSoft} bg={C.paperDeep} size={20}>Все филиалы</Chip>
          <Chip color={C.inkSoft} bg={C.paperDeep} size={20}>Этот месяц</Chip>
        </div>

        {TILES.map((t, i) => (
          <Card key={t.l} x={110 + i * (TILE_W + 24)} y={160} w={TILE_W} h={200} at={b(i * 0.5)} from="scale">
            <div style={{ padding: '26px 30px' }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: C.inkMute }}>{t.l}</div>
              <div style={{ marginTop: 12 }}>
                <Num value={t.v} at={b(i * 0.5)} dur={54} size={50} suffix="с." />
              </div>
              <div style={{ marginTop: 14, opacity: ease(frame, b(i * 0.5) + 30, 10) }}>
                <Chip color={t.good ? C.tealDeep : i === 3 ? C.coral : C.inkSoft} bg={t.good ? C.tealSoft : i === 3 ? C.coralSoft : C.paperDeep} size={17}>
                  {t.good && <TrendingUp size={16} />} {t.chip}
                </Chip>
              </div>
            </div>
          </Card>
        ))}

        {/* Движение средств */}
        <Card x={110} y={390} w={1180} h={470} at={b(1.5)}>
          <div style={{ position: 'absolute', left: 30, top: 26, fontWeight: 700, fontSize: 26, color: C.ink }}>Движение средств</div>
          <div style={{ position: 'absolute', right: 30, top: 30, display: 'flex', gap: 20, fontSize: 19, color: C.inkSoft, fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: C.indigo }} /> Доход</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: C.amber }} /> Расход</span>
          </div>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ position: 'absolute', left: 90, right: 30, top: 110 + k * 100, height: 1, background: C.line }} />
          ))}
          {MONTHS.map((m, i) => {
            const g = ease(frame, b(4 + i * 0.5), 22);
            const gx = 120 + i * 172;
            const h1 = (INCOME[i] / 1300) * 300 * g;
            const h2 = (SPEND[i] / 1300) * 300 * ease(frame, b(4 + i * 0.5) + 6, 22);
            return (
              <React.Fragment key={m}>
                <div style={{ position: 'absolute', left: gx, top: 410 - h1, width: 58, height: h1, borderRadius: '10px 10px 3px 3px', background: i === 5 ? C.indigo : C.indigo + 'B0' }} />
                <div style={{ position: 'absolute', left: gx + 66, top: 410 - h2, width: 58, height: h2, borderRadius: '10px 10px 3px 3px', background: i === 5 ? C.amber : C.amber + 'B0' }} />
                <div style={{ position: 'absolute', left: gx - 10, width: 144, top: 422, textAlign: 'center', fontSize: 19, color: i === 5 ? C.ink : C.inkMute, fontWeight: i === 5 ? 700 : 500 }}>{m}</div>
              </React.Fragment>
            );
          })}
          {(() => {
            const p = pop(frame, b(7));
            return (
              <div style={{ position: 'absolute', left: 120 + 5 * 172 - 250, top: 70, padding: '10px 16px', borderRadius: 14, background: C.ink, color: C.paper, fontWeight: 700, fontSize: 20, opacity: Math.min(1, p * 1.5), transform: `scale(${0.85 + 0.15 * p})`, transformOrigin: 'right center', whiteSpace: 'nowrap' }}>
                Октябрь: +1 248 400 · −812 300
              </div>
            );
          })()}
        </Card>

        {/* Расходы по категориям */}
        <Card x={1314} y={390} w={776} h={470} at={b(2)}>
          <div style={{ padding: '26px 30px' }}>
            <div style={{ fontWeight: 700, fontSize: 26, color: C.ink }}>Расходы по категориям</div>
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {CATS.map((c, i) => {
                const g = ease(frame, b(8 + i * 0.4) + 6, 26);
                return (
                  <div key={c.n}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 21, marginBottom: 7 }}>
                      <span style={{ fontWeight: 600, color: C.ink }}>{c.n}</span>
                      <span style={{ color: C.inkSoft, fontWeight: 600 }}>{fmt(c.v * g)} с.</span>
                    </div>
                    <div style={{ height: 14, borderRadius: 7, background: C.paperDeep }}>
                      <div style={{ height: 14, borderRadius: 7, width: `${(c.v / 336900) * 100 * g}%`, background: c.c }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Прибыльность курсов */}
        <Card x={110} y={884} w={1980} h={380} at={b(2.5)}>
          <div style={{ padding: '26px 34px' }}>
            <div style={{ fontWeight: 700, fontSize: 26, color: C.ink }}>Прибыльность курсов</div>
            <div style={{ display: 'flex', marginTop: 20, paddingBottom: 12, borderBottom: `1px solid ${C.line}`, fontSize: 18, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.inkMute }}>
              <span style={{ flex: 1.6 }}>Курс</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Выручка</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Расходы</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Чистыми</span>
              <span style={{ flex: 0.8, textAlign: 'right' }}>Студентов</span>
            </div>
            {COURSES.map(([n, rev, exp, st], i) => {
              const t = ease(frame, b(12 + i * 0.4) + 8, 18);
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', height: 54, borderBottom: `1px solid ${C.line}`, fontSize: 22, opacity: t, transform: `translateX(${(1 - t) * 60}px)` }}>
                  <span style={{ flex: 1.6, fontWeight: 700, color: C.ink }}>{n}</span>
                  <span style={{ flex: 1, textAlign: 'right', color: C.ink }}>{fmt(rev)} с.</span>
                  <span style={{ flex: 1, textAlign: 'right', color: C.inkSoft }}>{fmt(exp)} с.</span>
                  <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, color: C.tealDeep }}>{fmt(rev - exp)} с.</span>
                  <span style={{ flex: 0.8, textAlign: 'right', color: C.inkSoft }}>{st}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </AbsoluteFill>

      <Toast at={b(2.2)} until={b(3.7)} x={1330} y={880} w={480} icon={<CheckCircle2 size={28} color={C.teal} />} title="Оплата принята" text="Айгерим К. · 6 800 с. · Карта" />

      {/* lower third */}
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 952,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 26px',
          borderRadius: 18,
          background: C.ink,
          color: C.paper,
          fontFamily: BODY,
          fontWeight: 700,
          fontSize: 30,
          opacity: Math.min(1, capIn * 1.5) * (1 - capOut),
          transform: `translateX(${(1 - capIn) * -40}px)`,
        }}
      >
        <Label color={C.teal} style={{ fontSize: 20 }}>{`0${cap + 1}`}</Label>
        {CAPTIONS[cap]}
      </div>
    </AbsoluteFill>
  );
};
