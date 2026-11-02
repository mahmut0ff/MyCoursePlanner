import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Building2, Check, ChevronDown, Settings2 } from 'lucide-react';
import { BODY, C, DISPLAY, beat, ease, exitStyle, fmt, pop } from '../theme';
import { Caption, Cursor, LogoMark, Window } from '../components/ui';

// Bars 16–19. First half: the centre as a hub with branches on its spokes
// (the logo's own geometry). Second half: the real BranchSwitcher — pick a
// branch and every number on screen re-scopes to it.

const HUB = { x: 1290, y: 540 };
const R = 330;
const DIRS = [
  [0, -130],
  [124, -40],
  [76, 105],
  [-76, 105],
  [-124, -40],
].map(([x, y]) => {
  const l = Math.hypot(x, y);
  return [x / l, y / l];
});
const BRANCHES = [
  { n: 'Главный офис', s: 126 },
  { n: 'Южный филиал', s: 138 },
  { n: 'Филиал «Восток»', s: 64 },
  { n: 'Филиал «Аламедин»', s: 49 },
  { n: 'Филиал Ош', s: 35 },
];

const SWAP = beat(8);
const OPEN = beat(9);
const PICK = beat(11);

const GROUPS_ALL = [
  ['Английский B1 · вечер', 'Главный офис', '12/14'],
  ['Робототехника 10+', 'Филиал «Восток»', '9/10'],
  ['Подготовка к школе', 'Южный филиал', '15/16'],
  ['Frontend с нуля', 'Филиал Ош', '11/12'],
];
const GROUPS_SOUTH = [
  ['Подготовка к школе', 'Южный филиал', '15/16'],
  ['Английский A2 · утро', 'Южный филиал', '10/12'],
  ['Математика 7 кл.', 'Южный филиал', '13/14'],
  ['English Kids', 'Южный филиал', '8/10'],
];

export const S6Branches: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const netOut = ease(frame, SWAP - 12, 14, 'in');
  const menu = pop(frame, OPEN + 2, false) * (1 - ease(frame, PICK + 3, 7));
  const scoped = ease(frame, PICK + 4, 22);
  const label = frame >= PICK + 3 ? 'Южный филиал (Джал)' : 'Все филиалы';

  const stats = [
    { l: 'Студенты', a: 412, b: 138, suf: '' },
    { l: 'Группы', a: 46, b: 15, suf: '' },
    { l: 'Выручка за месяц', a: 1248400, b: 412600, suf: ' с.' },
  ];

  return (
    <AbsoluteFill style={exitStyle(frame, duration)}>
      <Caption
        n="03"
        label="Филиалы"
        title={['Один центр', 'или двадцать', 'филиалов']}
        body="«Все филиалы» — общая картина. Выберите филиал — и расписание, деньги и ученики покажутся только его."
        bullets={[
          { text: 'Кабинеты и группы по филиалам', at: beat(5) },
          { text: 'Права доступа на каждый филиал', at: beat(6) },
        ]}
      />

      {/* ── network ── */}
      <AbsoluteFill style={{ opacity: 1 - netOut, transform: `translateY(${-netOut * 80}px) scale(${1 - netOut * 0.06})` }}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {DIRS.map(([dx, dy], i) => {
            const draw = ease(frame, beat(1 + i * 0.5), 12);
            return (
              <line
                key={i}
                x1={HUB.x}
                y1={HUB.y}
                x2={HUB.x + dx * R * draw}
                y2={HUB.y + dy * R * draw}
                stroke={C.indigo}
                strokeOpacity={0.3}
                strokeWidth={3}
                strokeDasharray="2 10"
                strokeLinecap="round"
              />
            );
          })}
          {DIRS.map(([dx, dy], i) => {
            // data pulses flowing into the hub, one per beat per branch
            const start = beat(4 + i * 0.25);
            if (frame < start) return null;
            const t = ((frame - start) % BEAT2) / BEAT2;
            return (
              <circle key={`p${i}`} cx={HUB.x + dx * R * (1 - t)} cy={HUB.y + dy * R * (1 - t)} r={6} fill={i % 2 ? C.teal : C.indigo} opacity={Math.sin(t * Math.PI)} />
            );
          })}
        </svg>
        <div style={{ position: 'absolute', left: HUB.x - 75, top: HUB.y - 75 }}>
          <LogoMark size={150} start={0} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: HUB.x - 200,
            width: 400,
            top: HUB.y + 92,
            textAlign: 'center',
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 21,
            color: C.inkSoft,
            opacity: ease(frame, beat(4), 10),
          }}
        >
          Все филиалы · {fmt(interpolate(ease(frame, beat(4), 24), [0, 1], [0, 412]))} учеников
        </div>
        {BRANCHES.map((b, i) => {
          const [dx, dy] = DIRS[i];
          const p = pop(frame, beat(1.5 + i * 0.5));
          return (
            <div
              key={b.n}
              style={{
                position: 'absolute',
                left: HUB.x + dx * R,
                top: HUB.y + dy * R,
                transform: `translate(-50%, -50%) scale(${p})`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 20px 12px 12px',
                borderRadius: 999,
                background: C.card,
                border: `1px solid ${C.line}`,
                boxShadow: '0 16px 34px -20px rgba(22,20,31,0.4)',
                whiteSpace: 'nowrap',
                fontFamily: BODY,
              }}
            >
              <span style={{ width: 42, height: 42, borderRadius: 21, background: i === 1 ? C.tealSoft : C.indigoSoft, display: 'grid', placeItems: 'center' }}>
                <Building2 size={21} color={i === 1 ? C.tealDeep : C.indigo} />
              </span>
              <span>
                <div style={{ fontWeight: 700, fontSize: 20, color: C.ink }}>{b.n}</div>
                <div style={{ fontSize: 16, color: C.inkMute }}>{b.s} учеников</div>
              </span>
            </div>
          );
        })}
      </AbsoluteFill>

      {/* ── switcher in the app ── */}
      {frame >= SWAP - 4 && (
        <Window x={760} y={170} w={1050} h={740} at={SWAP - 4}>
          <div style={{ padding: 34, fontFamily: BODY }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 32, color: C.ink, letterSpacing: -0.6 }}>Обзор центра</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 18px',
                  borderRadius: 16,
                  border: `1.5px solid ${frame >= OPEN && frame < PICK + 4 ? C.indigo : C.line}`,
                  background: scoped > 0 ? C.tealSoft + Math.round(scoped * 255).toString(16).padStart(2, '0') : C.card,
                  fontWeight: 600,
                  fontSize: 21,
                  color: C.ink,
                  minWidth: 290,
                }}
              >
                <Building2 size={22} color={scoped > 0.5 ? C.tealDeep : C.indigo} />
                <span style={{ flex: 1 }}>{label}</span>
                <ChevronDown size={20} color={C.inkMute} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 18, marginTop: 30 }}>
              {stats.map((s, i) => {
                const v = interpolate(scoped, [0, 1], [s.a, s.b]);
                const intro = ease(frame, SWAP + 2 + i * 3, 14);
                return (
                  <div key={s.l} style={{ flex: 1, background: C.paper, borderRadius: 20, padding: '22px 24px', opacity: intro }}>
                    <div style={{ fontSize: 18, color: C.inkMute, fontWeight: 600 }}>{s.l}</div>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 40, color: C.ink, marginTop: 8, letterSpacing: -1 }}>
                      {fmt(v)}
                      {s.suf}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: C.inkMute, marginTop: 34 }}>
              Группы
            </div>
            <div style={{ position: 'relative', height: 320, marginTop: 10 }}>
              {[GROUPS_ALL, GROUPS_SOUTH].map((rows, k) => (
                <div key={k} style={{ position: 'absolute', inset: 0, opacity: k === 0 ? 1 - scoped : scoped }}>
                  {rows.map(([g, b, cap], i) => (
                    <div
                      key={g}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: 74,
                        borderBottom: `1px solid ${C.line}`,
                        opacity: k === 0 ? ease(frame, SWAP + 8 + i * 3, 12) : 1,
                        transform: k === 1 ? `translateY(${(1 - scoped) * (12 + i * 6)}px)` : undefined,
                      }}
                    >
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 21, color: C.ink }}>{g}</span>
                      <span style={{ width: 280, fontSize: 19, color: C.inkSoft }}>{b}</span>
                      <span style={{ width: 90, textAlign: 'right', fontSize: 19, fontWeight: 600, color: C.inkSoft }}>{cap}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* dropdown */}
          <div
            style={{
              position: 'absolute',
              right: 34,
              top: 108,
              width: 400,
              borderRadius: 20,
              background: C.card,
              border: `1px solid ${C.line}`,
              boxShadow: '0 30px 70px -20px rgba(22,20,31,0.4)',
              padding: 10,
              fontFamily: BODY,
              opacity: menu,
              transform: `translateY(${(1 - menu) * -12}px)`,
              transformOrigin: 'top right',
            }}
          >
            {[
              ['Все филиалы', 'Все данные центра'],
              ['Главный офис', ''],
              ['Южный филиал (Джал)', ''],
              ['Филиал «Восток»', ''],
              ['Филиал «Аламедин»', ''],
              ['Филиал Ош', ''],
            ].map(([n, sub], i) => {
              const hot = i === 2 && frame >= PICK - 10;
              return (
                <div
                  key={n}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 13,
                    background: hot ? C.indigoSoft : 'transparent',
                    opacity: ease(frame, OPEN + 3 + i * 1.5, 8),
                  }}
                >
                  <Building2 size={20} color={i === 0 ? C.indigo : C.inkMute} />
                  <span style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 19, color: C.ink }}>{n}</div>
                    {sub && <div style={{ fontSize: 15, color: C.inkMute }}>{sub}</div>}
                  </span>
                  {i === 0 && <Check size={20} color={C.indigo} />}
                </div>
              );
            })}
            <div style={{ borderTop: `1px solid ${C.line}`, margin: '6px 4px 0', padding: '12px 10px 6px', display: 'flex', gap: 10, alignItems: 'center', color: C.inkSoft, fontSize: 17, fontWeight: 600 }}>
              <Settings2 size={18} /> Управлять филиалами
            </div>
          </div>
        </Window>
      )}

      <Cursor
        show={[OPEN - 14, PICK + 16]}
        keys={[
          { f: OPEN - 14, x: 1500, y: 420 },
          { f: OPEN, x: 1660, y: 245, click: true },
          { f: PICK - 12, x: 1600, y: 420 },
          { f: PICK, x: 1580, y: 455, click: true },
          { f: PICK + 16, x: 1540, y: 600 },
        ]}
      />
    </AbsoluteFill>
  );
};

const BEAT2 = 30;
