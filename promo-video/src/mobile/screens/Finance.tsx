import React from 'react';
import { useCurrentFrame } from 'remotion';
import { CheckCircle2, ChevronDown, MessageCircle } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { cueAt, ease, fmt, Num, pop } from '../kit';
import { AppBar, Content, MCard, Pill, Seg, Toast } from '../phone';

// Finance → «Должники». Bar 11–12: the list; bar 13: a WhatsApp reminder goes
// to Айпери's parent; bar 14: the parent pays, the row flips to «Оплачено».

export const DEBTORS: { name: string; course: string; paid: number; total: number; due: string; overdue: boolean; color: string }[] = [
  { name: 'Айпери Жумабаева', course: 'Английский A2', paid: 0, total: 7600, due: 'до 17.10', overdue: false, color: C.tealDeep },
  { name: 'Тимур Ким', course: 'Математика', paid: 0, total: 6500, due: 'срок прошёл', overdue: true, color: C.coral },
  { name: 'Алина Сыдыкова', course: 'Подготовка к школе', paid: 3000, total: 6000, due: 'до 20.10', overdue: false, color: C.amber },
  { name: 'Данияр Асанов', course: 'Программирование', paid: 0, total: 8000, due: 'срок прошёл', overdue: true, color: C.plum },
];

export const Finance: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const wa = cueAt('whatsapp');
  const paidAt = cueAt('parentPaid');
  const rowAt = (i: number) => (i < 3 ? cueAt(`pay${i + 1}`) : cueAt('pay3') + 15);
  const paid = frame >= paidAt;
  const flip = pop(frame, paidAt);

  return (
    <Content>
      <AppBar
        at={at + 4}
        title="Финансы"
        sub="Октябрь 2026"
        right={
          <Pill color={C.indigoDeep} bg={C.indigoSoft} size={14}>
            Центр <ChevronDown size={14} />
          </Pill>
        }
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <MCard at={at + 12} style={{ flex: 1, padding: '13px 15px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkMute }}>Собрано</div>
          <div style={{ marginTop: 4 }}>
            {paid ? <Num value={320000} from={312400} at={paidAt} dur={40} size={25} color={C.tealDeep} suffix="с." /> : <Num value={312400} from={240000} at={at + 14} dur={46} size={25} color={C.tealDeep} suffix="с." />}
          </div>
        </MCard>
        <MCard at={at + 18} style={{ flex: 1, padding: '13px 15px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkMute }}>Долг · {paid ? 6 : 7} учеников</div>
          <div style={{ marginTop: 4 }}>
            {paid ? <Num value={86400} from={94000} at={paidAt} dur={40} size={25} color={C.coral} suffix="с." /> : <Num value={94000} from={120000} at={at + 20} dur={46} size={25} color={C.coral} suffix="с." />}
          </div>
        </MCard>
      </div>
      <div style={{ marginTop: 14 }}>
        <Seg at={at + 24} items={['Все', `Должники · ${paid ? 6 : 7}`, 'Оплачено']} active={1} />
      </div>

      <MCard at={at + 30} style={{ padding: '2px 14px', marginTop: 14 }}>
        {DEBTORS.map((d, i) => {
          const p = pop(frame, rowAt(i), false);
          const isAiperi = i === 0;
          const nowPaid = isAiperi && paid;
          const paidSum = nowPaid ? d.total : d.paid;
          const left = d.total - paidSum;
          const prog = ease(frame, rowAt(i) + 8, 30) * (d.paid / d.total) + (nowPaid ? ease(frame, paidAt, 30) * (1 - d.paid / d.total) : 0);
          const tag = nowPaid ? { text: 'Оплачено', c: C.tealDeep, bg: C.tealSoft } : d.overdue ? { text: d.due, c: C.coral, bg: C.coralSoft } : { text: d.due, c: C.amber, bg: C.amberSoft };
          return (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < DEBTORS.length - 1 ? `1px solid ${C.line}` : 'none', opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 18}px)`, fontFamily: BODY }}>
              <Avatar name={d.name} color={d.color} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                  <span style={{ transform: `scale(${nowPaid ? 0.7 + 0.3 * flip : 1})` }}>
                    <Pill color={tag.c} bg={tag.bg} size={11.5}>
                      {nowPaid && <CheckCircle2 size={12} />}
                      {tag.text}
                    </Pill>
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2 }}>{d.course}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ flex: 1, height: 6, borderRadius: 3, background: C.paperDeep, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.min(1, prog) * 100}%`, background: nowPaid ? C.teal : d.overdue ? C.coral : C.amber, borderRadius: 3 }} />
                  </span>
                  <span style={{ fontSize: 12.5, color: nowPaid ? C.tealDeep : C.inkSoft, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums' }}>
                    {nowPaid ? `${fmt(d.total)} из ${fmt(d.total)}` : `${fmt(paidSum)} из ${fmt(d.total)} · осталось ${fmt(left)}`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </MCard>

      <Toast at={wa} until={paidAt - 4} tone="#0B6E5F" icon={<MessageCircle size={24} color="#fff" />} title="Напоминание отправлено" text="Родителю Айпери · WhatsApp · за 3 дня до срока" />
      <Toast at={paidAt + 6} until={paidAt + 110} icon={<CheckCircle2 size={24} color={C.teal} />} title="Оплата принята · 7 600 с." text="Айпери Жумабаева · Английский A2" />
    </Content>
  );
};
