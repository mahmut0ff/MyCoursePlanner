import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolateColors, staticFile, useCurrentFrame } from 'remotion';
import { Apple, CheckCheck, Play } from 'lucide-react';
import { BODY, C, DISPLAY } from '../theme';
import { Grain } from '../components/ui';
import { b, CAP_W, CAP_X, Cap, cueAt, ease, Lines, Mark, PHONE_X, PHONE_Y, pop, Satellite, SECTIONS, seq, Slam, start, TOTAL, Wordmark } from './kit';
import { Device, Screens, ScreenItem, StatusBar, TabBar } from './phone';
import { HomeScreen, Lock } from './screens/LockHome';
import { Journal } from './screens/Journal';
import { Schedule } from './screens/Schedule';
import { Finance } from './screens/Finance';
import { Payroll } from './screens/Payroll';
import { Exam } from './screens/Exam';
import { Kpi } from './screens/Kpi';
import { Student } from './screens/Student';
import { Contest } from './screens/Contest';

// «SabakHub в телефоне» — 62 s, 1920×1080 @ 60 fps. One phone, anchored
// right of centre; the app screens inside it change module by module while
// the left column carries the caption. Every cut sits on a bar of
// music/make_mobile_track.py; both read src/mobile/cues.json.
export const MOBILE_TOTAL = TOTAL;

/* ── backdrop: paper ↔ night ─────────────────────────────────────────────── */
const NIGHT: [number, number][] = [
  [0, start('home')],
  [start('journal') + b(8), start('schedule')],
  [start('exam'), start('kpi')],
  [start('montage'), TOTAL + 200],
];
export const nightAt = (frame: number) => NIGHT.reduce((m, [s, e]) => Math.max(m, (s <= 0 ? 1 : ease(frame, s - 15, 30)) * (1 - ease(frame, e - 15, 30))), 0);

const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const night = nightAt(frame);
  return (
    <>
      <AbsoluteFill style={{ background: C.paper }} />
      <AbsoluteFill style={{ background: C.night, opacity: night }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(1000px 760px at ${30 + 4 * Math.sin(frame / 300)}% ${28 + 5 * Math.cos(frame / 260)}%, rgba(79,70,229,${0.09 + 0.13 * night}), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 760px at ${76 + 3 * Math.cos(frame / 280)}% ${82 + 4 * Math.sin(frame / 230)}%, rgba(20,184,166,${0.07 + 0.1 * night}), transparent 70%)`,
        }}
      />
      <Grain opacity={0.05} />
    </>
  );
};

/* ── the phone ───────────────────────────────────────────────────────────── */
const SCREENS: ScreenItem[] = [
  { at: 0, tab: 0, kind: 'fade', dark: true, screen: Lock },
  { at: cueAt('appOpen'), tab: 0, kind: 'launch', screen: HomeScreen },
  { at: start('journal'), tab: 1, kind: 'fade', screen: Journal },
  { at: start('schedule'), tab: 2, kind: 'fade', screen: Schedule },
  { at: start('finance'), tab: 3, kind: 'fade', screen: Finance },
  { at: start('payroll'), tab: 4, kind: 'push', screen: Payroll },
  { at: start('exam'), tab: 4, kind: 'push', screen: Exam },
  { at: start('kpi'), tab: 4, kind: 'push', screen: Kpi },
  { at: start('students'), tab: 4, kind: 'push', screen: Student },
  { at: start('contest'), tab: 4, kind: 'push', screen: Contest },
  // the montage shows the home screen already populated (its intro ran before the cut)
  { at: start('montage'), tab: 0, kind: 'fade', screen: ({ at }) => <HomeScreen at={at - 120} /> },
];

const PhoneRig: React.FC = () => {
  const frame = useCurrentFrame();
  const rise = ease(frame, 0, 84);
  const mont = ease(frame, start('montage'), 40, 'inOut');
  const outro = ease(frame, start('outro'), 34, 'in');
  const floatY = 5 * Math.sin(frame / 75);
  const rotY = 1.6 * Math.sin(frame / 130);
  const tx = -400 * mont;
  const ty = (1 - rise) * 560 + floatY + 20 * mont + 320 * outro;
  const s = (1.06 - 0.06 * rise) * (1 - 0.22 * mont) * (1 - 0.1 * outro);
  const rz = (1 - rise) * -7;
  const opacity = Math.min(1, rise * 2.5) * (1 - outro);
  if (opacity <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: PHONE_X, top: PHONE_Y, perspective: 2400, opacity }}>
      <div style={{ transform: `translate(${tx}px, ${ty}px) scale(${s}) rotateZ(${rz}deg) rotateY(${rotY}deg)`, transformOrigin: '50% 50%' }}>
        <Device>
          <Screens items={SCREENS} />
        </Device>
      </div>
    </div>
  );
};

/* ── chrome: brand bug ───────────────────────────────────────────────────── */
const Bug: React.FC = () => {
  const frame = useCurrentFrame();
  const o = ease(frame, start('home') + 6, 16) * (1 - ease(frame, start('montage') - 16, 14));
  if (o <= 0) return null;
  const night = nightAt(frame);
  const ink = interpolateColors(night, [0, 1], [C.ink, C.paper]);
  const soft = interpolateColors(night, [0, 1], [C.inkMute, '#9B96AC']);
  return (
    <div style={{ position: 'absolute', left: CAP_X, top: 56, display: 'flex', alignItems: 'center', gap: 14, opacity: o }}>
      <Mark size={42} />
      <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 25, color: ink, letterSpacing: -0.4 }}>SabakHub</span>
      <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 16, letterSpacing: 1.5, textTransform: 'uppercase', color: soft, marginLeft: 10, paddingLeft: 18, borderLeft: `1px solid ${soft}`, opacity: 0.9 }}>
        мобильное приложение · концепт
      </span>
    </div>
  );
};

/* ── hook title ──────────────────────────────────────────────────────────── */
const HookTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const out = ease(frame, start('home') - 18, 16, 'in');
  const kick = ease(frame, 24, 16);
  return (
    <div style={{ position: 'absolute', left: CAP_X, top: 330, width: CAP_W, opacity: 1 - out, transform: `translateY(${-20 * out}px)` }}>
      <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: C.teal, opacity: kick, marginBottom: 22 }}>Мобильное приложение</div>
      <Wordmark at={40} size={108} color={C.paper} />
      <div style={{ marginTop: 22 }}>
        <Lines lines={['Весь учебный центр —', 'в кармане']} at={84} size={46} color="#C9C4D6" />
      </div>
    </div>
  );
};

/* ── satellites ──────────────────────────────────────────────────────────── */
const TeacherPush: React.FC = () => (
  <Satellite at={cueAt('teacherPush', 'schedule')} until={dur('schedule') - 16} y={660} w={600} label="Телефон преподавателя">
    <div style={{ background: 'linear-gradient(160deg, #2A2460, #4F46E5 60%, #7C3AED)', padding: '26px 18px 22px' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px', borderRadius: 22, background: 'rgba(255,255,255,0.9)', fontFamily: BODY }}>
        <Mark size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.inkMute }}>
            <span style={{ fontWeight: 700, letterSpacing: 0.4 }}>SABAKHUB</span>
            <span>сейчас</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 19, color: C.ink, marginTop: 2 }}>Занятие перенесено</div>
          <div style={{ fontSize: 16.5, color: C.inkSoft, lineHeight: 1.35 }}>Английский B1 · ср 14.10 · 16:30–18:00 · каб. 305</div>
        </div>
      </div>
    </div>
  </Satellite>
);

const ParentWhatsApp: React.FC = () => {
  const frame = useCurrentFrame();
  const paidAt = cueAt('parentPaid', 'finance') + 10;
  const p2 = pop(frame, paidAt);
  return (
    <Satellite at={cueAt('whatsapp', 'finance')} until={dur('finance') - 16} y={640} w={600} label="Телефон родителя">
      <div style={{ background: '#EDE6DA', fontFamily: BODY }}>
        <div style={{ height: 70, background: '#0B6E5F', display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px' }}>
          <Mark size={44} />
          <div style={{ color: '#fff' }}>
            <div style={{ fontWeight: 700, fontSize: 19 }}>SabakHub</div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>учебный центр · WhatsApp</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ alignSelf: 'flex-start', maxWidth: '92%', background: '#fff', borderRadius: 18, borderTopLeftRadius: 5, padding: '12px 15px 8px', fontSize: 17, lineHeight: 1.4, color: C.ink, boxShadow: '0 1px 2px rgba(22,20,31,0.14)' }}>
            <b>Напоминание об оплате</b>
            <br />
            Здравствуйте! Ученик: Айпери Жумабаева.
            <br />
            Сумма к оплате: <b>7 600 с.</b> Оплатить до: <b>17.10.2026</b>
            <div style={{ textAlign: 'right', fontSize: 13, color: C.inkMute, marginTop: 4, display: 'flex', justifyContent: 'flex-end', gap: 5, alignItems: 'center' }}>
              15:00 <CheckCheck size={16} color="#53BDEB" />
            </div>
          </div>
          {frame >= paidAt && (
            <div style={{ alignSelf: 'flex-start', background: '#fff', borderRadius: 18, borderTopLeftRadius: 5, padding: '12px 15px 8px', fontSize: 17, lineHeight: 1.4, color: C.ink, boxShadow: '0 1px 2px rgba(22,20,31,0.14)', opacity: Math.min(1, p2 * 1.5), transform: `translateY(${(1 - p2) * 20}px)` }}>
              ✅ <b>Оплата принята</b> · 7 600 с. Спасибо!
              <div style={{ textAlign: 'right', fontSize: 13, color: C.inkMute, marginTop: 4 }}>16:41</div>
            </div>
          )}
        </div>
      </div>
    </Satellite>
  );
};

/* ── montage + outro ─────────────────────────────────────────────────────── */
const SidePhone: React.FC<{ cx: number; at: number; dir: 1 | -1; tab: number; children: React.ReactNode }> = ({ cx, at, dir, tab, children }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at, false);
  const outro = ease(frame, start('outro'), 34, 'in');
  if (frame < at || outro >= 1) return null;
  return (
    <div style={{ position: 'absolute', left: cx - 240, top: 65, perspective: 2400, opacity: Math.min(1, p * 1.5) * (1 - outro) }}>
      <div style={{ transform: `translate(${(1 - p) * 260 * dir}px, ${outro * 320}px) scale(0.78) rotateY(${(1 - p) * 18 * dir}deg)`, transformOrigin: '50% 50%' }}>
        <Device>
          <div style={{ position: 'absolute', inset: 0, background: C.paper }}>{children}</div>
          <StatusBar />
          <TabBar active={tab} />
        </Device>
      </div>
    </div>
  );
};

const Montage: React.FC = () => {
  const frame = useCurrentFrame();
  const s = start('montage');
  if (frame < s) return null;
  const out = ease(frame, start('outro'), 24, 'in');
  return (
    <>
      <SidePhone cx={960 - 430} at={cueAt('m2')} dir={-1} tab={1}>
        <Journal at={start('journal')} />
      </SidePhone>
      <SidePhone cx={960 + 430} at={cueAt('m3')} dir={1} tab={4}>
        <Exam at={start('exam')} />
      </SidePhone>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 62, display: 'flex', justifyContent: 'center', opacity: 1 - out, transform: `translateY(${-30 * out}px)` }}>
        <Slam text="Один центр. Одно приложение." at={cueAt('m1')} size={54} color={C.paper} stagger={5} highlight={['Одно', 'приложение.']} hiColor={C.teal} />
      </div>
    </>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const s = start('outro');
  if (frame < s) return null;
  const logo = cueAt('logo');
  const cta = cueAt('cta');
  const tag = ease(frame, cta, 20);
  const stores = pop(frame, cta + 26, false);
  const fade = ease(frame, TOTAL - 50, 50, 'in');
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 262, display: 'flex', justifyContent: 'center' }}>
        <Mark size={150} start={logo} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 450, display: 'flex', justifyContent: 'center' }}>
        <Wordmark at={logo + 14} size={100} color={C.paper} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 596, textAlign: 'center', fontFamily: BODY, fontSize: 31, color: '#C9C4D6', opacity: tag, transform: `translateY(${(1 - tag) * 14}px)` }}>
        Операционная система учебного центра — теперь и в телефоне
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 690, display: 'flex', justifyContent: 'center', gap: 16, opacity: Math.min(1, stores * 1.5), transform: `translateY(${(1 - stores) * 24}px)` }}>
        {[
          [<Apple key="a" size={26} color="#fff" />, 'App Store'],
          [<Play key="p" size={24} color="#fff" fill="#fff" />, 'Google Play'],
        ].map(([icon, name]) => (
          <div key={name as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px 12px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', fontFamily: BODY, color: '#fff' }}>
            {icon}
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 0.5 }}>СКОРО В</div>
              <div style={{ fontWeight: 700, fontSize: 20, marginTop: -2 }}>{name}</div>
            </div>
          </div>
        ))}
      </div>
      <AbsoluteFill style={{ background: '#000', opacity: fade, pointerEvents: 'none' }} />
    </>
  );
};

/* ── captions per section ────────────────────────────────────────────────── */
const dur = (k: string) => SECTIONS[k][1] * 120;

export const MobilePromo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.paper }}>
    <Backdrop />
    <Audio src={staticFile('music-mobile.wav')} />

    <Sequence {...seq('hook')}>
      <HookTitle />
    </Sequence>
    <Sequence {...seq('home')}>
      <Cap label="Главный экран" duration={dur('home')} shots={[{ at: 0, title: ['Всё, что происходит', 'сегодня — на одном', 'экране'], body: 'Занятия, посещаемость и оплаты. Открыл — и уже в курсе.' }]} />
    </Sequence>
    <Sequence {...seq('journal')}>
      <Cap
        n="01"
        label="Журнал"
        duration={dur('journal')}
        darkAt={b(8)}
        shots={[
          { at: 0, title: ['Оценки, посещаемость,', 'домашки — с телефона'], body: 'Преподаватель заполняет журнал за минуту, прямо на уроке.' },
          { at: b(8), title: ['Скажите голосом —', 'ИИ проставит сам'], body: '«Всем по пять, Айдану четыре, Тимура не было» — и журнал заполнен.' },
        ]}
      />
    </Sequence>
    <Sequence {...seq('schedule')}>
      <Cap
        n="02"
        label="Расписание и кабинеты"
        duration={dur('schedule')}
        shots={[
          { at: 0, title: ['У каждого филиала —', 'своё расписание'], body: 'Время, кабинет, преподаватель. Свободные кабинеты видно сразу.' },
          { at: b(5.5), title: ['Перенесли занятие —', 'преподаватель знает'], body: 'Уведомление приходит сразу. Звонить никому не нужно.' },
        ]}
      />
      <TeacherPush />
    </Sequence>
    <Sequence {...seq('finance')}>
      <Cap
        n="03"
        label="Финансы"
        duration={dur('finance')}
        shots={[
          { at: 0, title: ['Кто оплатил, кто должен', 'и сколько'], body: 'Все платежи, долги и сроки — в одном списке.' },
          { at: b(8), title: ['Напоминание родителю', 'уходит само'], body: 'WhatsApp за три дня до срока. Без звонков и неловких разговоров.' },
        ]}
      />
      <ParentWhatsApp />
    </Sequence>
    <Sequence {...seq('payroll')}>
      <Cap n="04" label="Зарплаты" duration={dur('payroll')} shots={[{ at: 0, title: ['Зарплата считается', 'сама — по формуле', 'каждого преподавателя'], body: 'Процент от собранного, оклад, своя сумма за ученика. Без Excel.' }]} />
    </Sequence>
    <Sequence {...seq('exam')}>
      <Cap n="05" label="Экзамены" dark duration={dur('exam')} shots={[{ at: 0, title: ['После экзамена ИИ', 'пишет ученику отчёт'], body: 'Что получается, где слабые места и над чем поработать — как от преподавателя.' }]} />
    </Sequence>
    <Sequence {...seq('kpi')}>
      <Cap n="06" label="KPI преподавателя" duration={dur('kpi')} shots={[{ at: 0, title: ['Менеджер видит,', 'кто как работает'], body: 'Считается автоматически — из оценок, посещаемости и активности в системе.' }]} />
    </Sequence>
    <Sequence {...seq('students')}>
      <Cap n="07" label="Ученики и филиалы" duration={dur('students')} shots={[{ at: 0, title: ['Карточка ученика —', 'всё на месте'], body: 'С какого дня учится, курс, преподаватель, кабинет, оплата.' }]} />
    </Sequence>
    <Sequence {...seq('contest')}>
      <Cap n="08" label="Олимпиады" tag="в разработке" duration={dur('contest')} shots={[{ at: 0, title: ['Жюри ставит оценки', 'с телефона'], body: 'Критерии, возрастные категории, итоги — сразу у администратора.' }]} />
    </Sequence>

    <PhoneRig />
    <Montage />
    <Outro />
    <Bug />
  </AbsoluteFill>
);
