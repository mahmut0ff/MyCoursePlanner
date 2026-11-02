import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Activity, ChevronDown } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { cueAt, ease, pop } from '../kit';
import { AppBar, Content, MCard, Pill } from '../phone';

// Manager's view: teacher KPI computed from grades + attendance + activity.
// Bars grow on the rising blips (kpi1…kpi5).

export const KPI_ROWS: [string, number, string, string, string][] = [
  ['Динара Токтогулова', 94, '61 уч.', 'журнал · 5 мин назад', C.tealDeep],
  ['Айгерим Садыкова', 88, '41 уч.', 'оценки голосом · 12 мин назад', C.teal],
  ['Елена Смирнова', 76, '28 уч.', 'заметка к ученику · 1 ч назад', C.indigo],
  ['Бакыт Осмонов', 52, '96 уч.', 'посещаемость · вчера', C.amber],
  ['Алексей Иванов', 31, '34 уч.', 'был в сети 4 дня назад', C.coral],
];

export const kpiColor = (v: number) => (v >= 70 ? C.teal : v >= 40 ? C.amber : C.coral);

export const Kpi: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const rowAt = (i: number) => cueAt(`kpi${i + 1}`);
  return (
    <Content>
      <AppBar
        at={at + 4}
        back
        title="KPI преподавателей"
        sub="Октябрь · из оценок и посещаемости"
        right={
          <Pill color={C.indigoDeep} bg={C.indigoSoft} size={14}>
            Центр <ChevronDown size={14} />
          </Pill>
        }
      />
      <div style={{ display: 'flex', gap: 6, opacity: ease(frame, at + 12, 14) }}>
        <Pill color={C.inkSoft} bg={C.paperDeep} size={12.5}>50 % стабильность</Pill>
        <Pill color={C.inkSoft} bg={C.paperDeep} size={12.5}>50 % вовлечённость</Pill>
        <Pill color={C.inkSoft} bg={C.paperDeep} size={12.5}>норма = медиана × 2</Pill>
      </div>

      <MCard at={at + 18} style={{ padding: '4px 14px', marginTop: 14 }}>
        {KPI_ROWS.map(([n, v, st, act, col], i) => {
          const p = pop(frame, rowAt(i) - 6, false);
          const g = ease(frame, rowAt(i), 34);
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < KPI_ROWS.length - 1 ? `1px solid ${C.line}` : 'none', opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 18}px)`, fontFamily: BODY }}>
              <Avatar name={n} color={col} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
                  <span style={{ fontSize: 12.5, color: C.inkMute }}>{st}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
                  <span style={{ flex: 1, height: 9, borderRadius: 5, background: C.paperDeep, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${v * g}%`, background: kpiColor(v), borderRadius: 5 }} />
                  </span>
                  <span style={{ width: 34, textAlign: 'right', fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, color: kpiColor(v) }}>{Math.round(v * g)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 12.5, color: i === 4 ? C.coral : C.inkMute }}>
                  <Activity size={12} />
                  {act}
                </div>
              </div>
            </div>
          );
        })}
      </MCard>

      <MCard at={rowAt(4) + 30} style={{ padding: '12px 16px', marginTop: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkMute }}>Активность за сегодня</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontFamily: BODY, fontSize: 14.5, fontWeight: 600, color: C.ink }}>
          <span>38 оценок</span>
          <span style={{ color: C.inkMute }}>·</span>
          <span>6 уроков</span>
          <span style={{ color: C.inkMute }}>·</span>
          <span>4 заметки</span>
        </div>
      </MCard>
    </Content>
  );
};
