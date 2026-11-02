import React from 'react';
import { useCurrentFrame } from 'remotion';
import { CheckCircle2, DoorOpen, GraduationCap, MapPin, MessageCircle, UserRound } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { cueAt, ease, pop } from '../kit';
import { AppBar, Content, MCard, Pill } from '../phone';

// Student card: since when, course, teacher, room, payment — and the branch.

const Fact: React.FC<{ at: number; icon: React.ReactNode; k: string; v: string; sub?: string; color: string }> = ({ at, icon, k, v, sub, color }) => {
  const p = pop(useCurrentFrame(), at);
  return (
    <div style={{ flex: '1 1 46%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: '12px 13px', boxSizing: 'border-box', opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 20}px) scale(${0.94 + 0.06 * p})`, fontFamily: BODY }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: C.inkMute }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, background: color + '1F', display: 'grid', placeItems: 'center' }}>{icon}</span>
        {k}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, marginTop: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
      {sub && <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );
};

export const Student: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const st = (i: number) => cueAt(`st${i}`);
  return (
    <Content>
      <AppBar at={at + 4} back title="Ученик" right={<Pill color={C.tealDeep} bg={C.tealSoft}>Учится</Pill>} />
      <MCard at={at + 12} style={{ padding: '18px 16px 16px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Avatar name="Айпери Жумабаева" color={C.tealDeep} size={74} ring={C.tealSoft} />
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 21, color: C.ink, marginTop: 12, letterSpacing: -0.4 }}>Айпери Жумабаева</div>
        <div style={{ fontSize: 14, color: C.inkMute, marginTop: 4, opacity: ease(frame, st(1), 14) }}>
          с 7 июля 2025 · учится <b style={{ color: C.ink }}>1 год 3 мес</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12, opacity: ease(frame, st(1) + 8, 14) }}>
          <Pill color={C.indigoDeep} bg={C.indigoSoft} size={12.5}>средний балл 4,7</Pill>
          <Pill color={C.tealDeep} bg={C.tealSoft} size={12.5}>посещаемость 96 %</Pill>
        </div>
      </MCard>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        <Fact at={st(2)} icon={<MapPin size={14} color={C.indigo} />} k="Филиал" v="Центр" sub="пн · ср · пт" color={C.indigo} />
        <Fact at={st(2) + 6} icon={<GraduationCap size={14} color={C.tealDeep} />} k="Курс" v="Английский A2" sub="группа A2-1 · 10:00" color={C.teal} />
        <Fact at={st(3)} icon={<UserRound size={14} color={C.amber} />} k="Преподаватель" v="Айгерим Садыкова" color={C.amber} />
        <Fact at={st(3) + 6} icon={<DoorOpen size={14} color={C.plum} />} k="Аудитория" v="каб. 204" sub="2 этаж" color={C.plum} />
      </div>

      <MCard at={st(4)} style={{ padding: '13px 16px', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: BODY }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: C.tealSoft, display: 'grid', placeItems: 'center' }}>
            <CheckCircle2 size={20} color={C.tealDeep} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>Оплачено до 17 ноября</div>
            <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2 }}>7 600 с. в месяц · договорная цена</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`, fontSize: 13.5, color: C.inkSoft, fontFamily: BODY, opacity: ease(frame, st(4) + 10, 14) }}>
          <MessageCircle size={14} color="#0B6E5F" />
          Родитель: Гульнара Ж. · напоминания в WhatsApp
        </div>
      </MCard>
    </Content>
  );
};
