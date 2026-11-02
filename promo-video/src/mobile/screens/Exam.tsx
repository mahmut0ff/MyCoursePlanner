import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Sparkles } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { cueAt, ease } from '../kit';
import { AppBar, Content, MCard, Pill } from '../phone';

// Student's exam result: the score ring draws (ping on «ringDone»), topic bars
// grow, then the AI report types itself out («как от преподавателя»).

export const TOPICS: [string, number][] = [
  ['Грамматика', 92],
  ['Лексика', 88],
  ['Аудирование', 70],
  ['Письмо', 64],
];

export const REPORT =
  'Грамматика и лексика — твои сильные стороны, ошибок почти нет. Слабее аудирование: в быстрой речи путаешь Past Simple и Present Perfect. На этой неделе — два диалога из Unit 5 и 10 минут аудио в день.';

export const Exam: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const ringDone = cueAt('ringDone');
  const typeAt = cueAt('type1');
  const ring = ease(frame, at + 16, ringDone - at - 16, 'inOut');
  const score = Math.round(84 * ring);
  const R = 56;
  const circ = 2 * Math.PI * R;
  const chars = Math.floor(ease(frame, typeAt, 170, 'inOut') * REPORT.length);
  const caret = frame >= typeAt && chars < REPORT.length && Math.floor(frame / 16) % 2 === 0;
  return (
    <Content>
      <AppBar at={at + 4} back title="Итоговый тест" sub="Английский A2 · 14 октября" right={<Pill color={C.tealDeep} bg={C.tealSoft}>Сдан</Pill>} />
      <MCard at={at + 12} style={{ padding: '16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 136, height: 136, flexShrink: 0 }}>
            <svg width={136} height={136} viewBox="0 0 136 136" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="68" cy="68" r={R} fill="none" stroke={C.paperDeep} strokeWidth="12" />
              <circle cx="68" cy="68" r={R} fill="none" stroke={C.teal} strokeWidth="12" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - 0.84 * ring)} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 32, color: C.ink, letterSpacing: -1 }}>{score}%</div>
                <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: -2 }}>21 из 25</div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, fontFamily: BODY }}>
            {TOPICS.map(([n, v], i) => {
              const g = ease(frame, at + 40 + i * 10, 40);
              const col = v >= 80 ? C.teal : v >= 70 ? C.amber : C.coral;
              return (
                <div key={n} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>
                    <span>{n}</span>
                    <span style={{ color: col }}>{Math.round(v * g)}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: C.paperDeep, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${v * g}%`, background: col, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </MCard>

      <MCard at={ringDone + 20} tone={`linear-gradient(150deg, ${C.indigoDeep} 0%, ${C.indigo} 55%, ${C.violet} 100%)`} style={{ padding: '16px 18px 18px', marginTop: 12, border: 'none', boxShadow: '0 24px 50px -24px rgba(79,70,229,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,0.16)', display: 'grid', placeItems: 'center' }}>
            <Sparkles size={18} color="#fff" />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Отчёт от ИИ</div>
            <div style={{ fontSize: 12.5, opacity: 0.75 }}>как от преподавателя · для ученика</div>
          </div>
        </div>
        <div style={{ marginTop: 12, fontFamily: BODY, fontSize: 15.5, lineHeight: 1.5, color: '#fff', minHeight: 120 }}>
          {REPORT.slice(0, chars)}
          <span style={{ display: 'inline-block', width: 2, height: 17, background: '#fff', marginLeft: 2, verticalAlign: 'text-bottom', opacity: caret ? 1 : 0 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, opacity: ease(frame, typeAt + 180, 14) }}>
          <Pill color="#fff" bg="rgba(255,255,255,0.16)" size={12}>Отправлено ученику</Pill>
          <Pill color="#fff" bg="rgba(255,255,255,0.16)" size={12}>и родителю</Pill>
        </div>
      </MCard>
      <MCard at={typeAt + 70} style={{ padding: '13px 16px', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: BODY }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.inkMute }}>Динамика за курс</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, marginTop: 3 }}>
              68 % → 76 % → <span style={{ color: C.tealDeep }}>84 %</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 40 }}>
            {[68, 76, 84].map((v, i) => {
              const g = ease(frame, typeAt + 80 + i * 8, 20);
              return <span key={v} style={{ width: 16, height: 40 * (v / 100) * g, borderRadius: 4, background: i === 2 ? C.teal : C.indigoSoft }} />;
            })}
          </div>
        </div>
      </MCard>
    </Content>
  );
};
