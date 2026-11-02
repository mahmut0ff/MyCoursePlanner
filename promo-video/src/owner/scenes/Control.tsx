import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Activity, AlertTriangle, Check, KeyRound, Send, X } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { b, camera, Card, Chip, ease, Label, pop, Slam } from '../kit';

// Bars 17–20 (drop B). «Что ещё видит владелец»: four real surfaces on a
// 2×2 board, the camera dives into one per bar —
// Активность преподавателей (KPI) · AI-анализ оттока · Сводка за неделю in
// Telegram · Роли и доступы (a custom «Кассир» without «сводка и прибыль»).

const TW = 836;
const TH = 400;
const GX = 110;
const GY = 190;
const GAP = 28;
const pos = (i: number) => ({ x: GX + (i % 2) * (TW + GAP), y: GY + Math.floor(i / 2) * (TH + GAP) });
const centre = (i: number) => ({ x: pos(i).x + TW / 2, y: pos(i).y + TH / 2 });

export const ZOOM = [b(1.25), b(4), b(8), b(12)];
export const CAPTIONS = ['Кто из учителей реально работает', 'Кто может уйти — и что с этим делать', 'Отчёт приходит сам — в Telegram', 'Каждый сотрудник видит только своё'];

export const kpiColor = (v: number) => (v >= 70 ? C.teal : v >= 40 ? C.amber : C.coral);

export const KPI_ROWS: [string, number, string][] = [
  ['Динара Токтогулова', 94, '61 уч.'],
  ['Айгерим Садыкова', 88, '41 уч.'],
  ['Елена Смирнова', 76, '28 уч.'],
  ['Бакыт Осмонов', 52, '96 уч.'],
  ['Алексей Иванов', 31, '34 уч.'],
];
export const CHURN: [string, number, string, string][] = [
  ['Тимур Ким', 75, 'не был 12 дн., просрочена оплата', 'позвонить родителям сегодня'],
  ['Алина Сыдыкова', 60, 'оценки падают, средний балл 3,1', 'дополнительное занятие с куратором'],
];
export const DIGEST = ['💰 Доход: 312 400 с.', '💸 Расходы: 141 000 с.', '🧾 Долги: 94 000 с. (просрочено: 7)', '🧑‍🎓 Новых учеников: 9', '📞 Новых заявок: 14'];
export const PERMS: [string, string, boolean][] = [
  ['Финансы', 'приём оплат, счета, возвраты', true],
  ['Финансы: сводка и прибыль', 'выручка, прибыль, маржа', false],
  ['Расходы', 'аренда, реклама, зарплаты', false],
  ['Зарплата', 'ставки и ведомости', false],
];

const Head: React.FC<{ icon: React.ReactNode; title: string; sub: string; right?: React.ReactNode }> = ({ icon, title, sub, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 26px 12px' }}>
    {icon}
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 24, color: C.ink }}>{title}</div>
      <div style={{ fontSize: 17, color: C.inkMute, marginTop: 2 }}>{sub}</div>
    </div>
    {right}
  </div>
);

const IconBox: React.FC<{ c: string; children: React.ReactNode }> = ({ c, children }) => (
  <span style={{ width: 48, height: 48, borderRadius: 14, background: c + '1E', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{children}</span>
);

export const Control: React.FC = () => {
  const frame = useCurrentFrame();
  const keys = [{ f: 0, x: 960, y: 560, s: 0.94 }, ...ZOOM.map((f, i) => ({ f, x: centre(i).x, y: centre(i).y - 10, s: 1.62 })), { f: b(15.2), x: 960, y: 560, s: 0.94 }];
  const cam = camera(frame, keys, 26);
  const cap = Math.max(0, ZOOM.filter((z) => frame >= z).length - 1);
  const capLocal = frame - ZOOM[cap];
  const capP = pop(capLocal, 10);
  const capOut = cap < 3 ? ease(frame, ZOOM[cap + 1] - 10, 8, 'in') : ease(frame, b(15), 8, 'in');
  const live = (i: number) => ZOOM[i] + 8;

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, overflow: 'hidden' }}>
      <AbsoluteFill style={cam}>
        <div style={{ position: 'absolute', left: GX, top: 96 }}>
          <Slam text="Что ещё видит владелец" at={2} size={60} stagger={4} highlight={['владелец']} />
        </div>

        {/* A — teacher KPI */}
        <Card x={pos(0).x} y={pos(0).y} w={TW} h={TH} at={4}>
          <Head
            icon={<IconBox c={C.indigo}><Activity size={26} color={C.indigo} /></IconBox>}
            title="Активность преподавателей"
            sub="KPI = 50% стабильность + 50% вовлечённость"
            right={<Chip color={C.inkSoft} bg={C.paperDeep} size={16}>Этот месяц</Chip>}
          />
          {KPI_ROWS.map(([n, v, st], i) => {
            const g = ease(frame, live(0) + i * 6, 24);
            const val = v as number;
            return (
              <div key={n as string} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 26px' }}>
                <Avatar name={n as string} color={[C.tealDeep, C.teal, C.indigo, C.amber, C.coral][i]} size={36} />
                <span style={{ width: 250, fontWeight: 600, fontSize: 19, color: C.ink }}>{n}</span>
                <span style={{ width: 70, fontSize: 16, color: C.inkMute }}>{st}</span>
                <span style={{ flex: 1, height: 12, borderRadius: 6, background: C.paperDeep }}>
                  <span style={{ display: 'block', height: 12, borderRadius: 6, width: `${val * g}%`, background: kpiColor(val) }} />
                </span>
                <span style={{ width: 44, textAlign: 'right', fontFamily: DISPLAY, fontWeight: 600, fontSize: 21, color: kpiColor(val) }}>{Math.round(val * g)}</span>
              </div>
            );
          })}
        </Card>

        {/* B — churn */}
        <Card x={pos(1).x} y={pos(1).y} w={TW} h={TH} at={10}>
          <Head
            icon={<IconBox c={C.coral}><AlertTriangle size={26} color={C.coral} /></IconBox>}
            title="AI-анализ оттока"
            sub="Кто в зоне риска, почему и что делать"
            right={<Chip color={C.coral} bg={C.coralSoft} size={16}>В зоне риска 6</Chip>}
          />
          {CHURN.map(([n, r, why, act], i) => {
            const p = pop(frame, live(1) + i * 12);
            return (
              <div key={n as string} style={{ margin: '6px 22px 10px', padding: '14px 18px', borderRadius: 18, background: C.paper, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 24}px)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={n as string} color={i ? C.amber : C.coral} size={34} />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 20, color: C.ink }}>{n}</span>
                  <Chip color={i ? C.amber : C.coral} bg={i ? C.amberSoft : C.coralSoft} size={16}>риск {r}%</Chip>
                </div>
                <div style={{ fontSize: 17, color: C.inkSoft, marginTop: 8 }}>
                  <b>Причина:</b> {why}
                </div>
                <div style={{ fontSize: 17, color: C.tealDeep, marginTop: 3 }}>
                  <b>Действие:</b> {act}
                </div>
              </div>
            );
          })}
        </Card>

        {/* C — weekly digest in Telegram */}
        <Card x={pos(2).x} y={pos(2).y} w={TW} h={TH} at={16} style={{ background: '#E7EBF0' }}>
          <Head
            icon={<IconBox c="#3A8BD8"><Send size={24} color="#3A8BD8" /></IconBox>}
            title="Telegram · каждый понедельник"
            sub="и «☀️ Утренняя сводка» от ИИ каждый день"
          />
          <div style={{ margin: '4px 26px', padding: '16px 20px', borderRadius: 18, borderTopLeftRadius: 6, background: '#fff', fontSize: 20, lineHeight: 1.55, color: C.ink, width: 470 }}>
            <div style={{ fontWeight: 700 }}>📊 Сводка за неделю</div>
            {DIGEST.map((l, i) => (
              <div key={l} style={{ opacity: ease(frame, live(2) + i * 6, 10), transform: `translateX(${(1 - ease(frame, live(2) + i * 6, 12)) * 16}px)` }}>
                {l}
              </div>
            ))}
          </div>
        </Card>

        {/* D — roles */}
        <Card x={pos(3).x} y={pos(3).y} w={TW} h={TH} at={22}>
          <Head
            icon={<IconBox c={C.plum}><KeyRound size={24} color={C.plum} /></IconBox>}
            title="Роли и доступы"
            sub="Своя роль «Кассир» — создаётся за минуту"
            right={<Chip color={C.plum} bg={C.plumSoft} size={16}>Кассир</Chip>}
          />
          {PERMS.map(([n, d, on], i) => {
            const t = ease(frame, live(3) + i * 6, 10);
            return (
              <div key={n as string} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 26px', opacity: t }}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 20, color: C.ink }}>{n}</div>
                  <div style={{ fontSize: 16, color: C.inkMute }}>{d}</div>
                </span>
                <span
                  style={{
                    width: 64,
                    height: 36,
                    borderRadius: 18,
                    background: on ? C.teal : C.paperDeep,
                    position: 'relative',
                  }}
                >
                  <span style={{ position: 'absolute', top: 4, left: on ? 32 : 4, width: 28, height: 28, borderRadius: 14, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                    {on ? <Check size={16} color={C.tealDeep} /> : <X size={16} color={C.inkMute} />}
                  </span>
                </span>
              </div>
            );
          })}
        </Card>
      </AbsoluteFill>

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
          opacity: frame >= ZOOM[0] ? Math.min(1, capP * 1.5) * (1 - capOut) : 0,
          transform: `translateX(${(1 - capP) * -40}px)`,
        }}
      >
        <Label color={C.teal} style={{ fontSize: 20 }}>{`0${cap + 1}`}</Label>
        {CAPTIONS[cap]}
      </div>
    </AbsoluteFill>
  );
};
