import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Activity, AlertTriangle, Check, KeyRound, Send, X as Off } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { b, camera, Card, Chip, ease, pop, Slam } from '../kit';
import { CAPTIONS, CHURN, DIGEST, KPI_ROWS, kpiColor, PERMS, ZOOM } from '../scenes/Control';
import { LowerThird } from './RFinance';
import { CW, CX, CY, X } from './layout';

// Bars 17–20 (drop B), vertical: the four surfaces stacked in one column;
// the camera lands on one per bar, then pulls all the way out so the whole
// column reads as a single "control room" before the cut.

const TH = 640;
const GAP = 40;
const Y0 = 560;
const tileY = (i: number) => Y0 + i * (TH + GAP);

const Head: React.FC<{ icon: React.ReactNode; title: string; sub: string; right?: React.ReactNode }> = ({ icon, title, sub, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '28px 30px 16px' }}>
    {icon}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 32, color: C.ink }}>{title}</div>
      <div style={{ fontSize: 22, color: C.inkMute, marginTop: 4 }}>{sub}</div>
    </div>
    {right}
  </div>
);

const IconBox: React.FC<{ c: string; children: React.ReactNode }> = ({ c, children }) => (
  <span style={{ width: 64, height: 64, borderRadius: 18, background: c + '1E', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{children}</span>
);

export const RControl: React.FC = () => {
  const frame = useCurrentFrame();
  const keys = [
    { f: 0, x: CX, y: CY, s: 1 },
    ...ZOOM.map((f, i) => ({ f, x: CX, y: tileY(i) + TH / 2, s: 1.04 })),
    { f: b(15.1), x: CX, y: (350 + tileY(3) + TH) / 2, s: 0.34 },
  ];
  const cam = camera(frame, keys, 26, CX, CY);
  const cap = Math.max(0, ZOOM.filter((z) => frame >= z).length - 1);
  const live = (i: number) => ZOOM[i] + 8;
  const capLen = cap < 3 ? ZOOM[cap + 1] - ZOOM[cap] : b(15) - ZOOM[3];

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, overflow: 'hidden' }}>
      <AbsoluteFill style={cam}>
        <div style={{ position: 'absolute', left: X, top: 350, width: CW }}>
          <Slam text="Что ещё видит владелец" at={2} size={84} stagger={4} highlight={['владелец']} />
        </div>

        <Card x={X} y={tileY(0)} w={CW} h={TH} at={4}>
          <Head icon={<IconBox c={C.indigo}><Activity size={32} color={C.indigo} /></IconBox>} title="Активность преподавателей" sub="KPI: стабильность + вовлечённость" />
          {KPI_ROWS.map(([n, val, st], i) => {
            const g = ease(frame, live(0) + i * 6, 24);
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 30px' }}>
                <Avatar name={n} color={[C.tealDeep, C.teal, C.indigo, C.amber, C.coral][i]} size={50} />
                <span style={{ width: 300 }}>
                  <div style={{ fontWeight: 700, fontSize: 26, color: C.ink, whiteSpace: 'nowrap' }}>{n}</div>
                  <div style={{ fontSize: 20, color: C.inkMute }}>{st}</div>
                </span>
                <span style={{ flex: 1, height: 16, borderRadius: 8, background: C.paperDeep }}>
                  <span style={{ display: 'block', height: 16, borderRadius: 8, width: `${val * g}%`, background: kpiColor(val) }} />
                </span>
                <span style={{ width: 64, textAlign: 'right', fontFamily: DISPLAY, fontWeight: 600, fontSize: 34, color: kpiColor(val) }}>{Math.round(val * g)}</span>
              </div>
            );
          })}
        </Card>

        <Card x={X} y={tileY(1)} w={CW} h={TH} at={10}>
          <Head
            icon={<IconBox c={C.coral}><AlertTriangle size={32} color={C.coral} /></IconBox>}
            title="AI-анализ оттока"
            sub="Кто в зоне риска, почему и что делать"
            right={<Chip color={C.coral} bg={C.coralSoft} size={21}>6</Chip>}
          />
          {CHURN.map(([n, r, why, act], i) => {
            const p = pop(frame, live(1) + i * 12);
            return (
              <div key={n} style={{ margin: '8px 26px 14px', padding: '20px 24px', borderRadius: 22, background: C.paper, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 24}px)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Avatar name={n} color={i ? C.amber : C.coral} size={46} />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 28, color: C.ink }}>{n}</span>
                  <Chip color={i ? C.amber : C.coral} bg={i ? C.amberSoft : C.coralSoft} size={21}>риск {r}%</Chip>
                </div>
                <div style={{ fontSize: 23, color: C.inkSoft, marginTop: 10, lineHeight: 1.35 }}>
                  <b>Причина:</b> {why}
                </div>
                <div style={{ fontSize: 23, color: C.tealDeep, marginTop: 4, lineHeight: 1.35 }}>
                  <b>Действие:</b> {act}
                </div>
              </div>
            );
          })}
        </Card>

        <Card x={X} y={tileY(2)} w={CW} h={TH} at={16} style={{ background: '#E7EBF0' }}>
          <Head icon={<IconBox c="#3A8BD8"><Send size={30} color="#3A8BD8" /></IconBox>} title="Telegram · по понедельникам" sub="и «☀️ Утренняя сводка» от ИИ каждый день" />
          <div style={{ margin: '6px 30px', padding: '22px 26px', borderRadius: 24, borderTopLeftRadius: 6, background: '#fff', fontSize: 30, lineHeight: 1.55, color: C.ink }}>
            <div style={{ fontWeight: 700 }}>📊 Сводка за неделю</div>
            {DIGEST.map((l, i) => (
              <div key={l} style={{ opacity: ease(frame, live(2) + i * 6, 10), transform: `translateX(${(1 - ease(frame, live(2) + i * 6, 12)) * 16}px)` }}>
                {l}
              </div>
            ))}
          </div>
        </Card>

        <Card x={X} y={tileY(3)} w={CW} h={TH} at={22}>
          <Head
            icon={<IconBox c={C.plum}><KeyRound size={30} color={C.plum} /></IconBox>}
            title="Роли и доступы"
            sub="Своя роль «Кассир» — за минуту"
            right={<Chip color={C.plum} bg={C.plumSoft} size={21}>Кассир</Chip>}
          />
          {PERMS.map(([n, d, on], i) => {
            const t = ease(frame, live(3) + i * 6, 10);
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 30px', opacity: t }}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 28, color: C.ink }}>{n}</div>
                  <div style={{ fontSize: 22, color: C.inkMute }}>{d}</div>
                </span>
                <span style={{ width: 84, height: 48, borderRadius: 24, background: on ? C.teal : C.paperDeep, position: 'relative', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 5, left: on ? 41 : 5, width: 38, height: 38, borderRadius: 19, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                    {on ? <Check size={22} color={C.tealDeep} /> : <Off size={22} color={C.inkMute} />}
                  </span>
                </span>
              </div>
            );
          })}
        </Card>
      </AbsoluteFill>

      {frame >= ZOOM[0] && frame < b(15) && <LowerThird n={cap + 1} text={CAPTIONS[cap]} frame={frame} local={frame - ZOOM[cap]} len={capLen} />}
    </AbsoluteFill>
  );
};
