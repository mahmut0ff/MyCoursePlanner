import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { AlertTriangle, BookOpenCheck, TrendingUp } from 'lucide-react';
import { BODY, C, DISPLAY, beat, ease, exitStyle, fmt, pop } from '../theme';
import { Kicker, RiseText } from '../components/ui';

// Bars 28–31. AdminDashboard in motion: KPI cards on the beat, revenue
// curve drawing across the bar, per-branch bars, the leads funnel, and the
// risk alerts («Светофор рисков») dropping in at the end.

const KPI = [
  { l: 'Выручка за месяц', v: 1248400, suf: ' с.', d: '+12%', dec: 0 },
  { l: 'Новые ученики', v: 38, suf: '', d: '+9', dec: 0 },
  { l: 'Посещаемость', v: 92, suf: '%', d: '+3%', dec: 0 },
  { l: 'Средний балл', v: 4.6, suf: ' из 5', d: '+0,2', dec: 1 },
];

const MONTHS = ['Май', 'Июнь', 'Июль', 'Авг', 'Сен', 'Окт'];
const REV = [820, 910, 640, 700, 1050, 1248];

const BR = [
  ['Главный офис', 520],
  ['Южный филиал', 413],
  ['Филиал «Восток»', 176],
  ['Филиал «Аламедин»', 92],
  ['Филиал Ош', 48],
] as const;

// chart geometry (inside its card)
const CW = 1040;
const CH = 450;
const PLX = 60;
const PLY = 120;
const PW = CW - PLX - 50;
const PH = CH - PLY - 70;
const ptX = (i: number) => PLX + (i / (REV.length - 1)) * PW;
const ptY = (v: number) => PLY + PH - ((v - 400) / (1300 - 400)) * PH;

const smoothPath = () => {
  const pts = REV.map((v, i) => [ptX(i), ptY(v)]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
};
const LINE = smoothPath();
const AREA = `${LINE} L ${ptX(REV.length - 1)} ${PLY + PH} L ${ptX(0)} ${PLY + PH} Z`;

const Card: React.FC<{ x: number; y: number; w: number; h: number; at: number; children: React.ReactNode }> = ({ x, y, w, h, at, children }) => {
  const p = pop(useCurrentFrame(), at);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 26,
        background: C.card,
        border: `1px solid ${C.line}`,
        boxShadow: '0 24px 60px -34px rgba(22,20,31,0.35)',
        fontFamily: BODY,
        boxSizing: 'border-box',
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${(1 - p) * 36}px)`,
      }}
    >
      {children}
    </div>
  );
};

export const S9Analytics: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const draw = ease(frame, beat(3), beat(3.5), 'inOut');
  const kpiCount = ease(frame, beat(1), beat(3));
  const cardW = (1700 - 3 * 24) / 4;

  return (
    <AbsoluteFill style={exitStyle(frame, duration)}>
      <div style={{ position: 'absolute', left: 110, top: 118 }}>
        <Kicker n="06" label="Аналитика" at={0} />
        <RiseText lines={['Вся картина центра —', 'на одном экране']} at={3} size={50} />
      </div>

      {/* risk alerts */}
      {[
        { at: beat(9), icon: AlertTriangle, c: C.coral, bg: C.coralSoft, t: '2 ученика в зоне риска', s: 'Посещаемость упала ниже 60%' },
        { at: beat(9.5), icon: BookOpenCheck, c: C.amber, bg: C.amberSoft, t: '7 домашних заданий', s: 'ждут проверки учителем' },
      ].map((a, i) => {
        const p = pop(frame, a.at);
        const Icon = a.icon;
        return (
          <div
            key={a.t}
            style={{
              position: 'absolute',
              left: 1090 + i * 370,
              top: 150,
              width: 350,
              borderRadius: 20,
              background: C.card,
              border: `1.5px solid ${a.c}44`,
              boxShadow: '0 20px 40px -24px rgba(22,20,31,0.35)',
              padding: '16px 18px',
              fontFamily: BODY,
              display: 'flex',
              gap: 14,
              opacity: Math.min(1, p * 1.5),
              transform: `translateY(${(1 - p) * -24}px)`,
            }}
          >
            <span style={{ width: 44, height: 44, borderRadius: 14, background: a.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon size={23} color={a.c} />
            </span>
            <span>
              <div style={{ fontWeight: 700, fontSize: 19, color: C.ink }}>{a.t}</div>
              <div style={{ fontSize: 16, color: C.inkMute, marginTop: 2 }}>{a.s}</div>
            </span>
          </div>
        );
      })}

      {KPI.map((k, i) => {
        const v = k.v * kpiCount;
        return (
          <Card key={k.l} x={110 + i * (cardW + 24)} y={330} w={cardW} h={168} at={beat(1 + i * 0.5)}>
            <div style={{ padding: '24px 28px' }}>
              <div style={{ fontSize: 19, fontWeight: 600, color: C.inkMute }}>{k.l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 12 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 44, color: C.ink, letterSpacing: -1.2 }}>
                  {k.dec ? v.toFixed(1).replace('.', ',') : fmt(v)}
                  <span style={{ fontSize: 24, color: C.inkSoft, letterSpacing: 0 }}>{k.suf}</span>
                </span>
              </div>
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, color: C.tealDeep, background: C.tealSoft, borderRadius: 8, padding: '3px 9px', opacity: ease(frame, beat(3.5), 8) }}>
                <TrendingUp size={15} /> {k.d}
              </div>
            </div>
          </Card>
        );
      })}

      {/* revenue chart */}
      <Card x={110} y={524} w={CW} h={CH} at={beat(2.5)}>
        <div style={{ position: 'absolute', left: 30, top: 26, fontWeight: 700, fontSize: 23, color: C.ink }}>Выручка</div>
        <div style={{ position: 'absolute', right: 26, top: 20, display: 'flex', gap: 6, background: C.paper, borderRadius: 14, padding: 5 }}>
          {['Месяц', 'Прошлый', 'Квартал', 'Год'].map((t, i) => (
            <span key={t} style={{ padding: '7px 14px', borderRadius: 10, fontSize: 16, fontWeight: 600, background: i === 3 ? C.card : 'transparent', color: i === 3 ? C.ink : C.inkMute }}>
              {t}
            </span>
          ))}
        </div>
        <svg width={CW} height={CH} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.indigo} stopOpacity={0.22} />
              <stop offset="1" stopColor={C.indigo} stopOpacity={0} />
            </linearGradient>
            <clipPath id="reveal">
              <rect x={0} y={0} width={PLX + PW * draw + 2} height={CH} />
            </clipPath>
          </defs>
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={PLX} x2={PLX + PW} y1={PLY + (PH / 3) * i} y2={PLY + (PH / 3) * i} stroke={C.line} strokeDasharray="4 6" />
          ))}
          <path d={AREA} fill="url(#rev)" clipPath="url(#reveal)" />
          <path d={LINE} fill="none" stroke={C.indigo} strokeWidth={4.5} strokeLinecap="round" clipPath="url(#reveal)" />
          {REV.map((v, i) => {
            const p = pop(frame, beat(3) + (i / (REV.length - 1)) * beat(3.5));
            return <circle key={i} cx={ptX(i)} cy={ptY(v)} r={7 * p} fill={C.card} stroke={C.indigo} strokeWidth={3.5} />;
          })}
          {MONTHS.map((m, i) => (
            <text key={m} x={ptX(i)} y={PLY + PH + 40} textAnchor="middle" fontFamily={BODY} fontSize={17} fill={C.inkMute}>
              {m}
            </text>
          ))}
        </svg>
        {(() => {
          const p = pop(frame, beat(7));
          return (
            <div
              style={{
                position: 'absolute',
                left: ptX(5) - 196,
                top: ptY(1248) - 26,
                padding: '10px 16px',
                borderRadius: 14,
                background: C.ink,
                color: C.paper,
                fontWeight: 700,
                fontSize: 19,
                opacity: Math.min(1, p * 1.5),
                transform: `scale(${0.85 + 0.15 * p})`,
                transformOrigin: 'right center',
              }}
            >
              Октябрь · 1,25 млн с.
            </div>
          );
        })()}
      </Card>

      {/* branches + funnel */}
      <Card x={110 + CW + 24} y={524} w={1700 - CW - 24} h={CH} at={beat(3)}>
        <div style={{ padding: '26px 30px' }}>
          <div style={{ fontWeight: 700, fontSize: 23, color: C.ink }}>Аналитика по филиалам</div>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {BR.map(([n, v], i) => {
              const g = ease(frame, beat(4 + i * 0.5), 16);
              return (
                <div key={n}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, color: C.inkSoft, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, color: C.ink }}>{n}</span>
                    <span>{fmt(v * 1000 * g)} с.</span>
                  </div>
                  <div style={{ height: 12, borderRadius: 6, background: C.paperDeep }}>
                    <div style={{ height: 12, borderRadius: 6, width: `${(v / 520) * 100 * g}%`, background: i === 0 ? C.indigo : i === 1 ? C.teal : C.indigo + '66' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 22, display: 'flex', gap: 8, alignItems: 'center', opacity: ease(frame, beat(7), 10) }}>
            {[
              ['Новые', 64],
              ['В работе', 31],
              ['Записаны', 18],
            ].map(([l, v], i) => (
              <React.Fragment key={l}>
                {i > 0 && <span style={{ color: C.inkMute, fontSize: 20 }}>→</span>}
                <span style={{ flex: 1, background: [C.indigoSoft, C.amberSoft, C.tealSoft][i], borderRadius: 12, padding: '8px 12px' }}>
                  <div style={{ fontSize: 15, color: C.inkSoft }}>{l}</div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, color: C.ink }}>
                    {Math.round(interpolate(ease(frame, beat(7), 20), [0, 1], [0, v as number]))}
                  </div>
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </Card>
    </AbsoluteFill>
  );
};
