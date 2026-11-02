import React from 'react';
import { useCurrentFrame } from 'remotion';
import { BookOpen, ChevronRight, FileText, UserPlus, Wallet } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { cueAt, ease, Mark, Num, pop } from '../kit';
import { AppBar, Content, MCard, Pill, Row, SectionTitle, SW } from '../phone';

/* ── lock screen (hook) ──────────────────────────────────────────────────── */
export const Lock: React.FC<{ at: number }> = () => {
  const frame = useCurrentFrame();
  const notif = cueAt('lockNotif');
  const open = cueAt('appOpen');
  const p = pop(frame, notif);
  const press = ease(frame, open - 8, 6) * (1 - ease(frame, open, 6));
  const timeIn = ease(frame, 30, 30);
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(170deg, #2A2460 0%, #4F46E5 38%, #7C3AED 72%, #1B1830 100%)', fontFamily: BODY }}>
      <div style={{ position: 'absolute', left: -80, top: 420, width: 420, height: 420, borderRadius: 210, background: 'radial-gradient(circle, rgba(20,184,166,0.45), transparent 65%)' }} />
      <div style={{ position: 'absolute', right: -120, top: 80, width: 380, height: 380, borderRadius: 190, background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 65%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 118, textAlign: 'center', color: '#fff', opacity: timeIn, transform: `translateY(${(1 - timeIn) * 12}px)` }}>
        <div style={{ fontSize: 17, fontWeight: 600, opacity: 0.85 }}>Среда, 14 октября</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 86, letterSpacing: -3, lineHeight: 1.05, marginTop: 4 }}>9:41</div>
      </div>
      {frame >= notif && (
        <div
          style={{
            position: 'absolute',
            left: 14,
            right: 14,
            top: 330,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            padding: '13px 14px',
            borderRadius: 22,
            background: 'rgba(255,255,255,0.86)',
            boxShadow: '0 20px 40px -20px rgba(0,0,0,0.5)',
            opacity: Math.min(1, p * 1.5),
            transform: `translateY(${(1 - p) * -40}px) scale(${1 - 0.04 * press})`,
          }}
        >
          <Mark size={42} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.inkMute }}>
              <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>SABAKHUB</span>
              <span>сейчас</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, marginTop: 1 }}>Доброе утро!</div>
            <div style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.3 }}>Сегодня 6 занятий. Две оплаты ждут подтверждения.</div>
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', left: SW / 2 - 62, bottom: 9, width: 124, height: 5, borderRadius: 3, background: '#fff', opacity: 0.85 }} />
    </div>
  );
};

/* ── home ────────────────────────────────────────────────────────────────── */
const Stat: React.FC<{ at: number; value: number; suffix?: string; label: string; color: string; bg: string }> = ({ at, value, suffix, label, color, bg }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at);
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 18, padding: '13px 13px 12px', opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 20}px) scale(${0.9 + 0.1 * p})` }}>
      <Num value={value} at={at} dur={34} size={28} color={color} suffix={suffix} />
      <div style={{ fontSize: 12.5, fontWeight: 600, color, opacity: 0.85, marginTop: 2, lineHeight: 1.2 }}>{label}</div>
    </div>
  );
};

const Quick: React.FC<{ icon: React.ReactNode; label: string; at: number; color: string }> = ({ icon, label, at, color }) => {
  const p = pop(useCurrentFrame(), at);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, opacity: Math.min(1, p * 1.5), transform: `scale(${0.8 + 0.2 * p})` }}>
      <span style={{ width: 54, height: 54, borderRadius: 18, background: color + '1F', display: 'grid', placeItems: 'center' }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>{label}</span>
    </div>
  );
};

export const HomeScreen: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const s1 = Math.max(at + 20, cueAt('home1'));
  const s2 = Math.max(at + 30, cueAt('home2'));
  const s3 = Math.max(at + 40, cueAt('home3'));
  const live = 0.6 + 0.4 * Math.sin(frame / 9);
  return (
    <Content>
      <AppBar
        at={at + 6}
        big
        title="Доброе утро 👋"
        sub="Среда, 14 октября · Филиал Центр"
        right={<Avatar name="Нурлан Асанов" color={C.indigo} size={42} ring={C.indigoSoft} />}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <Stat at={s1} value={6} label="занятий сегодня" color={C.indigoDeep} bg={C.indigoSoft} />
        <Stat at={s2} value={92} suffix="%" label="посещаемость" color={C.tealDeep} bg={C.tealSoft} />
        <Stat at={s3} value={2} label="оплаты ждут" color={C.amber} bg={C.amberSoft} />
      </div>

      <SectionTitle at={s3 + 10}>Сейчас идёт</SectionTitle>
      <MCard at={s3 + 14} style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: C.teal, boxShadow: `0 0 0 ${4 * live}px rgba(20,184,166,0.25)` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>Английский A2</div>
            <div style={{ fontSize: 14, color: C.inkMute, marginTop: 2 }}>10:00–11:30 · каб. 204 · Айгерим С.</div>
          </div>
          <Pill color={C.indigoDeep} bg={C.indigoSoft}>7 уч.</Pill>
        </div>
      </MCard>

      <div style={{ display: 'flex', gap: 6, marginTop: 20, padding: '0 4px' }}>
        <Quick at={s3 + 40} icon={<BookOpen size={24} color={C.indigo} />} label="Оценки" color={C.indigo} />
        <Quick at={s3 + 46} icon={<Wallet size={24} color={C.tealDeep} />} label="Оплата" color={C.teal} />
        <Quick at={s3 + 52} icon={<UserPlus size={24} color={C.amber} />} label="Ученик" color={C.amber} />
        <Quick at={s3 + 58} icon={<FileText size={24} color={C.plum} />} label="Отчёт" color={C.plum} />
      </div>

      <SectionTitle at={s3 + 70} right="Все →">Дальше сегодня</SectionTitle>
      <MCard at={s3 + 74} style={{ padding: '4px 16px' }}>
        {[
          ['11:30', 'Подготовка к школе', 'каб. 102 · Елена С.', C.teal],
          ['14:00', 'Английский B1', 'каб. 204 · Айгерим С.', C.indigo],
          ['15:30', 'Программирование', 'каб. 301 · Алексей И.', C.plum],
          ['17:00', 'Шахматы', 'каб. 103 · Нурлан А.', C.amber],
        ].map(([t, n, s, c], i) => (
          <Row key={n} at={s3 + 84 + i * 8} last={i === 3}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: c, marginLeft: 4 }} />
            <span style={{ width: 50, fontWeight: 700, fontSize: 15, color: C.ink }}>{t}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15.5, color: C.ink }}>{n}</div>
              <div style={{ fontSize: 13, color: C.inkMute }}>{s}</div>
            </span>
            <ChevronRight size={18} color={C.inkMute} />
          </Row>
        ))}
      </MCard>
          </Content>
  );
};
