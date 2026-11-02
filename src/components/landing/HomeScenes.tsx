import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wallet, GraduationCap, Phone, Bell, Sparkles, Check, SendHorizontal, Signal, Wifi, BatteryFull,
  LayoutDashboard, Users, Layers, BookOpen,
} from 'lucide-react';
import { intlLocale } from '../../lib/locale';
import { focusRing, h2Cls, leadCls } from './LandingKit';

/* ──────────────────────────────────────────────────────────────
   Animated scenes of the home page: the hero chat, the scroll-told
   day and the institution switcher. Grouping comes from whitespace,
   tints and soft shadows, not outlines; every sequence renders its
   final state under prefers-reduced-motion.
   ────────────────────────────────────────────────────────────── */

const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Live visibility of an element (or the first time it is seen, with `once`). */
export function useInView<T extends Element>(threshold = 0.3, once = false) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) io.disconnect();
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);
  return [ref, inView] as const;
}

/** Text that rolls in from below whenever its value changes. */
export const Roll: React.FC<{ children: string; delay?: number; className?: string }> = ({ children, delay = 0, className = '' }) => (
  <span className={`inline-flex overflow-hidden py-[0.06em] align-bottom ${className}`}>
    <span
      key={children}
      className="inline-block animate-[roll-in_0.5s_cubic-bezier(0.22,1,0.36,1)_both]"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </span>
  </span>
);

/** A stat like "200+" or "1 день": the leading number counts up the first time it is seen. */
export const CountUp: React.FC<{ value: string }> = ({ value }) => {
  const match = /^(\d+)(.*)$/s.exec(value);
  const target = match ? Number(match[1]) : 0;
  const [ref, inView] = useInView<HTMLSpanElement>(0.6, true);
  const [n, setN] = useState(() => (prefersReduced() ? target : 0));
  useEffect(() => {
    if (!inView || prefersReduced()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1200);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target]);
  if (!match) return <span>{value}</span>;
  return (
    <span ref={ref}>
      <span aria-hidden>{n}{match[2]}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
};

/* ═══ Hero: the director's morning conversation with the bot ═══ */

type Line = { from: 'bot' | 'me'; text?: string; stats?: boolean; button?: string };

const pop = 'animate-[chat-pop_0.35s_cubic-bezier(0.22,1,0.36,1)_both]';
const botBubble = `max-w-[86%] self-start rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-[13px] leading-[1.4] text-slate-800 dark:bg-slate-800 dark:text-slate-100 ${pop} origin-bottom-left`;

export const HeroChat: React.FC<{ chips?: boolean }> = ({ chips = true }) => {
  const { t, i18n } = useTranslation();
  const som = (n: number) => t('mkt.mockSum', { n: n.toLocaleString(intlLocale(i18n.language)) });
  const script = useMemo<Line[]>(
    () => [
      { from: 'bot', text: t('mkt.chatHello') },
      { from: 'bot', stats: true },
      { from: 'bot', text: t('mkt.chatLate'), button: t('mkt.chatOpen') },
      { from: 'me', text: t('mkt.chatAsk') },
      { from: 'bot', text: t('mkt.chatRisk') },
    ],
    [t],
  );
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [shown, setShown] = useState(() => (prefersReduced() ? script.length : 0));
  const [typing, setTyping] = useState(false);

  // Plays the conversation while the phone is on screen, then starts over.
  useEffect(() => {
    if (!inView || prefersReduced()) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const step = (i: number) => {
      if (i >= script.length) {
        later(() => { setShown(0); step(0); }, 7000);
        return;
      }
      if (script[i].from === 'me') {
        later(() => { setShown(i + 1); step(i + 1); }, 1500);
        return;
      }
      later(() => {
        setTyping(true);
        later(() => { setTyping(false); setShown(i + 1); step(i + 1); }, i === 0 ? 700 : 1150);
      }, i === 0 ? 300 : 650);
    };
    setShown(0);
    step(0);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      setTyping(false);
    };
  }, [inView, script]);

  const stats = [
    { label: t('mkt.mockKpi1'), value: t('mkt.mockKpi1Value') },
    { label: t('home.visDirRow1Label'), value: t('home.visDirRow1Value') },
    { label: t('mkt.mockKpi3'), value: '92%' },
  ];

  return (
    <div ref={ref} aria-hidden className="pointer-events-none relative mx-auto w-[288px] select-none sm:w-[308px]">
      <div className="rounded-[46px] bg-slate-950 p-[10px] shadow-[0_40px_80px_-30px_rgba(17,18,20,0.55)] ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex h-[560px] flex-col overflow-hidden rounded-[36px] bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 sm:h-[590px]">
          <div className="flex h-9 shrink-0 items-center justify-between px-6 pt-1 text-[12px] font-semibold tabular-nums">
            <span>07:30</span>
            <span className="flex items-center gap-1">
              <Signal className="h-3.5 w-3.5" />
              <Wifi className="h-3.5 w-3.5" />
              <BatteryFull className="h-4 w-4" />
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 bg-slate-50 px-4 py-2.5 dark:bg-slate-800/60">
            <img src="/icons/logo.png" alt="" className="h-8 w-8 rounded-full" />
            <div>
              <p className="text-[13px] font-semibold leading-4">SabakHub</p>
              <p className={`text-[11px] leading-4 transition-colors ${typing ? 'text-primary-600 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {typing ? t('mkt.chatTyping') : t('mkt.chatBot')}
              </p>
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-1.5 overflow-hidden px-3 pb-3">
            {script.slice(0, shown).map((m, i) =>
              m.from === 'me' ? (
                <p key={i} className={`max-w-[80%] self-end rounded-2xl rounded-br-md bg-primary-600 px-3 py-2 text-[13px] leading-[1.4] text-white ${pop} origin-bottom-right`}>
                  {m.text}
                </p>
              ) : m.stats ? (
                <div key={i} className={`${botBubble} w-[86%]`}>
                  {stats.map((s) => (
                    <p key={s.label} className="flex items-baseline justify-between gap-3 py-0.5">
                      <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
                      <span className="font-semibold tabular-nums">{s.value}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <div key={i} className={botBubble}>
                  {m.text}
                  {m.button && (
                    <span className="mt-2 block rounded-lg bg-white py-1.5 text-center text-[12px] font-medium text-primary-600 dark:bg-slate-900 dark:text-primary-400">
                      {m.button}
                    </span>
                  )}
                </div>
              ),
            )}
            {typing && (
              <span className={`flex gap-1 self-start rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-3 dark:bg-slate-800 ${pop}`}>
                {[0, 150, 300].map((d) => (
                  <i key={d} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-[typing-dot_1.2s_infinite]" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 px-3 pb-5 pt-1">
            <span className="flex h-9 flex-1 items-center rounded-full bg-slate-100 px-4 text-[13px] text-slate-400 dark:bg-slate-800">{t('mkt.chatMessage')}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-white">
              <SendHorizontal className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>

      {chips && (
        <>
          <div className="absolute -left-28 top-24 hidden animate-[mkt-float_6s_ease-in-out_infinite] lg:block">
            <div className="hero-rise flex items-center gap-3 rounded-xl bg-white py-3 pl-3 pr-4 shadow-float dark:bg-slate-800" style={{ animationDelay: '0.9s' }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
                <Wallet className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{t('mkt.chipPaid')}</span>
                <span className="block text-[15px] font-semibold tabular-nums">+{som(4000)}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{t('home.visStudent1')}</span>
              </span>
            </div>
          </div>
          <div className="absolute -right-28 bottom-6 hidden animate-[mkt-float_7s_ease-in-out_infinite] [animation-delay:-3s] lg:block">
            <div className="hero-rise flex items-center gap-3 rounded-xl bg-white py-3 pl-3 pr-4 shadow-float dark:bg-slate-800" style={{ animationDelay: '1.3s' }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
                <GraduationCap className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{t('mkt.chipGrade')}</span>
                <span className="block text-[15px] font-semibold">5 · {t('home.visStudent2')}</span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ═══ «Один день»: scroll moves the sun across the day ═══ */

export type DayStep = { time: string; title: string; desc: string };

const sheet = 'w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-float dark:bg-slate-800';
const enter = (active: boolean, delay: number) => ({
  className: `transition-[opacity,transform] duration-500 ease-out ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`,
  style: { transitionDelay: active ? `${delay}ms` : '0ms' },
});

const CallScene: React.FC<{ active: boolean }> = ({ active }) => {
  const { t, i18n } = useTranslation();
  const som = (n: number) => t('mkt.mockSum', { n: n.toLocaleString(intlLocale(i18n.language)) });
  const rows = [
    { init: t('home.visInit1'), name: t('home.visStudent1'), sum: som(4000) },
    { init: t('home.visInit2'), name: t('home.visStudent2'), sum: som(3500) },
    { init: t('home.visInit3'), name: t('home.visStudent3'), sum: som(3000) },
  ];
  return (
    <div className={sheet}>
      <p className="text-[13px] font-semibold">{t('mkt.mockCallToday')}</p>
      <ul className="mt-3 space-y-1">
        {rows.map((r, j) => {
          const e = enter(active, 150 + j * 120);
          return (
            <li key={r.name} className={`flex items-center gap-3 rounded-lg px-1 py-2 ${e.className}`} style={e.style}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{r.init}</span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{r.name}</span>
              <span className="text-[14px] font-semibold tabular-nums">{r.sum}</span>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${j === 0 ? 'bg-primary-600 text-white animate-[ring-pulse_1.8s_ease-out_infinite]' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
                <Phone className="h-3.5 w-3.5" />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const ScheduleScene: React.FC<{ active: boolean }> = ({ active }) => {
  const { t } = useTranslation();
  const rows = ['09:00', '10:30', '12:00', '13:30'];
  const block = 'absolute h-[44px] rounded-lg px-2.5 py-2 text-[12px] font-medium leading-tight';
  const col = (c: number) => ({ left: c === 0 ? '52px' : 'calc(52px + (100% - 52px) / 2 + 4px)', width: 'calc((100% - 52px) / 2 - 4px)' });
  const toast = enter(active, 1500);
  return (
    <div className={sheet}>
      <div className="relative h-[208px]">
        {rows.map((r, k) => (
          <span key={r} className="absolute left-0 text-[11px] tabular-nums text-slate-400" style={{ top: k * 52 + 2 }}>{r}</span>
        ))}
        <span className={`${block} bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200`} style={{ top: 0, ...col(0) }}>{t('mkt.sceneLesson2')}</span>
        <span className={`${block} bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200`} style={{ top: 104, ...col(1) }}>{t('mkt.sceneLesson3')}</span>
        {/* the lesson being moved: down one column-hop into the free slot */}
        <span
          className={`${block} bg-primary-600 text-white shadow-pop transition-transform duration-700 ease-in-out`}
          style={{ top: 104, ...col(0), transform: active ? 'translate(calc(100% + 8px), 52px)' : 'none', transitionDelay: active ? '500ms' : '0ms' }}
        >
          {t('mkt.sceneLesson1')}
        </span>
      </div>
      <p className={`mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700 dark:bg-slate-900/60 dark:text-slate-300 ${toast.className}`} style={toast.style}>
        <Bell className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400" />
        {t('mkt.sceneMoved')}
      </p>
    </div>
  );
};

const ExamScene: React.FC<{ active: boolean }> = ({ active }) => {
  const { t } = useTranslation();
  const done = enter(active, 1400);
  return (
    <div className={sheet}>
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Sparkles className="h-4 w-4 text-primary-600 dark:text-primary-400" />
        {t('mkt.sceneExamTopic')}
      </p>
      <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{t('mkt.sceneExamBuilding')}</p>
      <ol className="mt-4 space-y-3">
        {[90, 68, 80, 56].map((w, j) => {
          const e = enter(active, 200 + j * 200);
          return (
            <li key={j} className={`flex items-center gap-3 ${e.className}`} style={e.style}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">{j + 1}</span>
              <span className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700" style={{ width: `${w}%` }} />
            </li>
          );
        })}
      </ol>
      <p className={`mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-[12px] font-medium text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 ${done.className}`} style={done.style}>
        <Check className="h-3.5 w-3.5" />
        {t('mkt.sceneExamChecked')}
      </p>
    </div>
  );
};

const ParentsScene: React.FC<{ active: boolean }> = ({ active }) => {
  const { t } = useTranslation();
  const notes = [t('home.visTgMsg'), t('mkt.sceneParentAttend'), t('mkt.sceneParentHw')];
  return (
    <div className="w-full max-w-[340px] rounded-[28px] bg-gradient-to-b from-slate-700 to-slate-950 p-5 text-white shadow-float">
      <p className="text-center text-[44px] font-semibold tabular-nums tracking-[-0.03em]">17:10</p>
      <div className="mt-3 space-y-2">
        {notes.map((m, j) => (
          <div
            key={j}
            className={`rounded-2xl bg-white/[0.09] p-3 transition-[opacity,transform] duration-500 ease-out ${active ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}
            style={{ transitionDelay: active ? `${200 + j * 350}ms` : '0ms' }}
          >
            <p className="flex items-center gap-1.5 text-[11px] text-white/60">
              <img src="/icons/logo.png" alt="" className="h-4 w-4 rounded" />
              SabakHub
              <span className="ms-auto">{t('mkt.sceneNow')}</span>
            </p>
            <p className="mt-1 text-[13px] leading-snug">{m}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const SCENES = [CallScene, ScheduleScene, ExamScene, ParentsScene];

/** The day's sun on an arc: it travels to the active moment, the time rolls underneath. */
const SunArc: React.FC<{ step: number; total: number; time: string }> = ({ step, total, time }) => {
  const tt = 0.12 + (total > 1 ? step / (total - 1) : 0) * 0.76;
  const a = Math.PI * (1 - tt);
  const x = 150 + 130 * Math.cos(a);
  const y = 120 - 100 * Math.sin(a);
  const arc = 'M20 120 A130 100 0 0 1 280 120';
  const ease = '0.9s cubic-bezier(0.22, 1, 0.36, 1)';
  return (
    <div className="relative mt-8 h-[136px] w-[300px] max-w-full" aria-hidden>
      <svg viewBox="0 0 300 130" className="absolute inset-0 h-[130px] w-full overflow-visible">
        <path d={arc} fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="2" strokeDasharray="3 6" />
        <path
          d={arc}
          fill="none"
          className="stroke-primary-500"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={1}
          style={{ strokeDasharray: `${tt} 1`, transition: `stroke-dasharray ${ease}` }}
        />
        <g style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform ${ease}` }}>
          <circle r="17" className="fill-primary-500/15" />
          <circle r="8" className="fill-primary-500" />
        </g>
      </svg>
      <p className="absolute inset-x-0 bottom-0 text-center text-[40px] font-semibold leading-none tabular-nums tracking-[-0.03em]">
        <Roll>{time}</Roll>
      </p>
    </div>
  );
};

const STEP_MS = 5200;

/* The day plays itself like stories while the section is on screen — no scroll
   capture. A bar under the active moment shows the time left; a mouse over the
   section pauses it, a click jumps to a moment. Reduced motion: manual only. */
export const DayStory: React.FC<{ title: string; days: DayStep[] }> = ({ title, days }) => {
  const [ref, inView] = useInView<HTMLElement>(0.35);
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const auto = !prefersReduced();
  const playing = auto && inView && !hold;

  return (
    <section
      ref={ref}
      id="day"
      className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-8 sm:py-28"
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHold(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHold(false); }}
    >
      <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div>
          <h2 className={`${h2Cls} max-w-[20ch]`}>{title}</h2>
          <SunArc step={active} total={days.length} time={days[active].time} />
          <ol className="mt-6 space-y-0.5">
            {days.map((d, i) => {
              const on = i === active;
              return (
                <li key={d.time}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-current={on ? 'step' : undefined}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${focusRing}`}
                  >
                    <span className="flex items-baseline gap-3">
                      <span className={`w-12 shrink-0 text-[13px] font-medium tabular-nums transition-colors ${on ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500'}`}>{d.time}</span>
                      <span className={`text-[16px] font-semibold transition-colors ${on ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{d.title}</span>
                    </span>
                    <span className={`grid transition-[grid-template-rows,opacity] duration-500 ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <span className="overflow-hidden">
                        <span className="block ps-[60px] pt-1.5 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{d.desc}</span>
                        {on && auto && (
                          <span aria-hidden className="ms-[60px] mt-3 block h-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <span
                              key={active}
                              className="block h-full origin-left rounded-full bg-primary-500 animate-[day-progress_linear_both]"
                              style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: playing ? 'running' : 'paused' }}
                              onAnimationEnd={() => setActive((n) => (n + 1) % days.length)}
                            />
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="relative h-[400px] sm:h-[440px]">
          {days.map((d, i) => {
            const Scene = SCENES[i];
            const on = i === active;
            return (
              <div
                key={d.time}
                className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-500 ease-out ${on ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}
              >
                <Scene active={on && inView} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/** A struck-out "how it used to be" line; the strike is drawn when it scrolls in. */
export const Struck: React.FC<{ children: string; delay?: number }> = ({ children, delay = 0 }) => {
  const [ref, seen] = useInView<HTMLElement>(0.9, true);
  return (
    <s ref={ref} className="relative text-[13px] text-slate-400 no-underline dark:text-slate-500">
      {children}
      <span
        aria-hidden
        className={`absolute inset-x-0 top-[55%] h-[1.5px] origin-left rounded-full bg-primary-500/80 transition-transform duration-700 ease-out ${seen ? 'scale-x-100' : 'scale-x-0'}`}
        style={{ transitionDelay: seen ? `${delay}ms` : '0ms' }}
      />
    </s>
  );
};

/* ═══ «Один переключатель»: the same screen re-labels itself ═══ */

export type InstId = 'center' | 'school' | 'language' | 'academy';
export const INSTITUTIONS: { id: InstId; suffix: string; grades: string[][] }[] = [
  { id: 'center', suffix: 'Center', grades: [['87', '92', '78', '95'], ['74', '81', '90', '68'], ['99', '95', '97', '100']] },
  { id: 'school', suffix: 'School', grades: [['5', '5', '4', '5'], ['4', '4', '5', '3'], ['5', '5', '5', '5']] },
  { id: 'language', suffix: 'Language', grades: [['A', 'A', 'B', 'A'], ['B', 'B', 'A', 'C'], ['A', 'A', 'A', 'A']] },
  { id: 'academy', suffix: 'Academy', grades: [['87%', '92%', '78%', '95%'], ['74%', '81%', '90%', '68%'], ['99%', '95%', '97%', '100%']] },
];

export const FitSwitcher: React.FC<{ inst: InstId; onChange: (id: InstId) => void }> = ({ inst, onChange }) => {
  const { t } = useTranslation();
  const current = INSTITUTIONS.find((i) => i.id === inst)!;
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Segments are equal-sized, so only the thumb's position animates.
  useLayoutEffect(() => {
    const place = () => {
      const b = btns.current[INSTITUTIONS.findIndex((i) => i.id === inst)];
      if (b) setThumb({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [inst]);

  const nav = [
    { icon: LayoutDashboard, label: t('nav.dashboard') },
    { icon: Users, label: t(`terms.${inst}.students`), roll: true, active: true },
    { icon: Layers, label: t(`terms.${inst}.groups`), roll: true },
    { icon: BookOpen, label: t('nav.journal') },
    { icon: Wallet, label: t('nav.finances') },
  ];
  const people = [t('home.visStudent1'), t('home.visStudent2'), t('home.visStudent3')];

  return (
    <section id="fit" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-16 sm:px-8 sm:py-24">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className={`${h2Cls} max-w-[20ch]`}>{t('home.fitTitle')}</h2>
          <p className={`mt-4 max-w-[54ch] ${leadCls}`}>{t('home.fitDesc')}</p>
          <div role="group" aria-label={t('home.fitEyebrow')} className="relative mt-7 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4 dark:bg-slate-800">
            <span
              aria-hidden
              className="absolute left-0 top-0 rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out dark:bg-slate-700"
              style={{ width: thumb.w, height: thumb.h, transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
            />
            {INSTITUTIONS.map(({ id }, i) => {
              const selected = inst === id;
              return (
                <button
                  key={id}
                  ref={(node) => { btns.current[i] = node; }}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(id)}
                  className={`relative z-10 flex min-h-10 items-center justify-center rounded-lg px-2 py-1.5 text-center text-[13px] font-medium leading-tight transition-colors ${focusRing} ${
                    selected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {t(`inst.${id}`)}
                </button>
              );
            })}
          </div>
          <p key={inst} className="mt-5 max-w-[54ch] text-[15px] leading-relaxed text-slate-600 animate-[chat-pop_0.4s_cubic-bezier(0.22,1,0.36,1)_both] dark:text-slate-400">
            {t(`home.fitNote${current.suffix}`)}
          </p>
        </div>

        <figure aria-label={t('home.fitPreviewLabel')} className="relative mx-auto h-[360px] w-full max-w-[480px]">
          <div
            aria-hidden
            className="absolute inset-0 text-slate-300 dark:text-slate-700"
            style={{
              backgroundImage: 'radial-gradient(currentColor 1px, transparent 1.3px)',
              backgroundSize: '18px 18px',
              maskImage: 'radial-gradient(closest-side, black 40%, transparent)',
              WebkitMaskImage: 'radial-gradient(closest-side, black 40%, transparent)',
            }}
          />
          <div className="absolute left-0 top-4 w-[200px] rounded-2xl bg-white p-2 shadow-float sm:w-[210px] dark:bg-slate-800">
            <p className="flex h-8 items-center gap-2 px-1.5 text-[12px] font-semibold">
              <img src="/icons/logo.png" alt="" className="h-5 w-5 rounded" />
              SabakHub
            </p>
            <div className="mt-1 space-y-px">
              {nav.map(({ icon: Icon, label, roll, active }, k) => (
                <p
                  key={k}
                  className={`flex h-8 items-center gap-2 rounded-md px-2 text-[13px] ${active ? 'bg-slate-100 font-medium dark:bg-slate-700' : 'text-slate-600 dark:text-slate-300'}`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`} />
                  {roll ? <Roll delay={k * 60}>{label}</Roll> : label}
                </p>
              ))}
            </div>
          </div>
          <div className="absolute bottom-2 right-0 w-[300px] rounded-2xl bg-white p-4 shadow-float sm:w-[320px] dark:bg-slate-800">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-semibold">
                <Roll>{t(`terms.${inst}.group`)}</Roll> #3
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                <Roll delay={80}>{t(`home.fitScale${current.suffix}`)}</Roll>
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {people.map((name, r) => (
                <div key={name} className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{name}</span>
                  {current.grades[r].map((g, c) => (
                    <span key={c} className="flex h-7 w-[38px] items-center justify-center rounded-md bg-slate-100 text-[12px] font-semibold tabular-nums dark:bg-slate-700">
                      <Roll delay={120 + (r * 4 + c) * 35}>{g}</Roll>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
};
