import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Calculator } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { cueAt, ease, Num, pop } from '../kit';
import { AppBar, Content, MCard, Pill, PrimaryButton } from '../phone';

// Payroll for one teacher: the formula builds line by line (tok1…tok4), then
// the total counts up on the ping. Rates come from the real product:
// «% от собранного» + a named rate for an individual student.

const Line: React.FC<{ at: number; label: string; sub?: string; value: React.ReactNode; muted?: boolean }> = ({ at, label, sub, value, muted }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at, false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 16}px)` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: muted ? C.inkSoft : C.ink }}>{label}</div>
        {sub && <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, color: muted ? C.inkSoft : C.ink, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
};

export const Payroll: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const tok = (i: number) => cueAt(`tok${i}`);
  const total = cueAt('salaryTotal');
  return (
    <Content>
      <AppBar at={at + 4} back title="Зарплата" sub="Октябрь · расчёт с 01.10 по 31.10" />
      <MCard at={at + 12} style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name="Айгерим Садыкова" color={C.teal} size={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>Айгерим Садыкова</div>
            <div style={{ fontSize: 13.5, color: C.inkMute, marginTop: 2 }}>Английский A2, B1 · 41 ученик</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          <Pill color={C.indigoDeep} bg={C.indigoSoft} size={12.5}>20 % с оплат студентов</Pill>
          <Pill color={C.tealDeep} bg={C.tealSoft} size={12.5}>+ своя сумма за 1 ученика</Pill>
        </div>
      </MCard>

      <MCard at={at + 24} style={{ padding: '14px 18px 8px', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, background: C.indigoSoft, display: 'grid', placeItems: 'center' }}>
            <Calculator size={18} color={C.indigo} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>Как считается</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, color: C.inkMute }}>автоматически</span>
        </div>
        <Line at={tok(1)} label="Собрано с учеников" sub="40 учеников · оплаты за октябрь" value={<Num value={293500} at={tok(1)} dur={30} size={17} suffix="с." />} muted />
        <Line at={tok(2)} label="× 20 %" sub="ставка преподавателя" value={<Num value={58700} at={tok(2)} dur={30} size={17} suffix="с." />} />
        <Line at={tok(3)} label="+ Индивидуально · Айпери Ж." sub="ученица изъята из основной ставки" value={<Num value={4000} at={tok(3)} dur={24} size={17} suffix="с." />} />
        <div style={{ height: 1, background: C.line, margin: '4px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0 8px', opacity: ease(frame, tok(4), 12) }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 17, color: C.ink }}>Итого к выплате</span>
          <Num value={62700} from={0} at={tok(4)} dur={total - tok(4)} size={28} color={C.indigoDeep} suffix="с." />
        </div>
      </MCard>

      <MCard at={total + 14} style={{ padding: '14px 16px', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: BODY }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 15.5, color: C.ink }}>Ведомость · 7 преподавателей</span>
          <Num value={336900} at={total + 16} dur={30} size={20} suffix="с." />
        </div>
        <PrimaryButton at={total + 24} style={{ marginTop: 12 }}>Утвердить ведомость</PrimaryButton>
      </MCard>
    </Content>
  );
};
