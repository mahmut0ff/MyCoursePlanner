import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, CheckCircle2, Mic, Sparkles } from 'lucide-react';
import { BODY, C, DISPLAY } from '../../theme';
import { Avatar } from '../../components/ui';
import { cueAt, ease, pop } from '../kit';
import { AppBar, Content, MCard, Pill, Seg, Toast } from '../phone';

// Journal for group «Английский A2». Bar 4–5: the sheet; bar 6–7: the teacher
// taps the mic, speaks, and the AI fills grades + attendance (cues g1…g7).

export const STUDENTS: { name: string; color: string; grade: string; hw: boolean }[] = [
  { name: 'Айпери Жумабаева', color: C.tealDeep, grade: '5', hw: true },
  { name: 'Айдан Бекова', color: C.indigo, grade: '4', hw: true },
  { name: 'Тимур Ким', color: C.coral, grade: 'Н', hw: false },
  { name: 'Алина Сыдыкова', color: C.amber, grade: '5', hw: true },
  { name: 'Данияр Асанов', color: C.plum, grade: '5', hw: true },
  { name: 'Нурлан Токтосунов', color: C.teal, grade: '5', hw: false },
  { name: 'Мээрим Касымова', color: C.indigoDeep, grade: '5', hw: true },
];

export const TRANSCRIPT = 'Всем по пять, Айдану четыре, Тимура не было';

const gradeStyle = (g: string) =>
  g === 'Н' ? { color: C.coral, bg: C.coralSoft } : g === '4' ? { color: C.indigoDeep, bg: C.indigoSoft } : { color: C.tealDeep, bg: C.tealSoft };

const Wave: React.FC<{ frame: number; level: number }> = ({ frame, level }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 56 }}>
    {Array.from({ length: 34 }, (_, i) => {
      const h = 6 + level * (16 + 22 * Math.abs(Math.sin(frame / 5 + i * 0.9) * Math.sin(frame / 13 + i * 0.37)) + 10 * Math.abs(Math.sin(i * 1.7)));
      return <span key={i} style={{ width: 4, height: h, borderRadius: 2, background: i % 3 === 0 ? C.teal : C.indigo, opacity: 0.85 }} />;
    })}
  </div>
);

export const Journal: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const rowAt = (i: number) => (i < 3 ? cueAt(`row${i + 1}`) : cueAt('row3') + (i - 2) * 15);
  const mic = cueAt('micTap');
  const think = cueAt('aiThink');
  const done = cueAt('gradesDone');
  const gradeAt = (i: number) => cueAt(`g${i + 1}`);

  const pressed = ease(frame, mic, 5) * (1 - ease(frame, mic + 5, 8));
  const sheet = pop(frame, mic + 6, false);
  const listening = frame >= mic + 6 && frame < think;
  const level = ease(frame, mic + 10, 20) * (1 - ease(frame, think - 12, 12));
  const words = TRANSCRIPT.split(' ');
  const shown = Math.floor(ease(frame, mic + 36, 52, 'inOut') * words.length + 0.001);
  const compact = ease(frame, think, 16, 'inOut');
  const sheetOut = ease(frame, done + 2, 14, 'in');
  const dim = ease(frame, mic + 6, 14) * (1 - ease(frame, think, 16));
  const sheetH = 300 - 190 * compact;

  return (
    <Content>
      <AppBar at={at + 4} title="Журнал" sub="Английский A2 · среда, 14 октября" right={<Pill color={C.indigoDeep} bg={C.indigoSoft}>7 уч.</Pill>} />
      <Seg at={at + 10} items={['Оценки', 'Посещаемость', 'ДЗ']} active={0} />
      <div style={{ display: 'flex', fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.inkMute, padding: '16px 14px 6px', opacity: ease(frame, at + 20, 12) }}>
        <span style={{ flex: 1 }}>Ученик</span>
        <span style={{ width: 44, textAlign: 'center' }}>ДЗ</span>
        <span style={{ width: 44, textAlign: 'center' }}>Был</span>
        <span style={{ width: 62, textAlign: 'center' }}>Оценка</span>
      </div>
      <MCard at={at + 22} style={{ padding: '2px 14px' }}>
        {STUDENTS.map((s, i) => {
          const p = pop(frame, rowAt(i), false);
          const g = pop(frame, gradeAt(i));
          const graded = frame >= gradeAt(i);
          const absent = graded && s.grade === 'Н';
          const gs = gradeStyle(s.grade);
          return (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < STUDENTS.length - 1 ? `1px solid ${C.line}` : 'none', opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 18}px)` }}>
              <Avatar name={s.name} color={s.color} size={34} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              <span style={{ width: 44, display: 'grid', placeItems: 'center' }}>
                {s.hw ? (
                  <span style={{ width: 24, height: 24, borderRadius: 12, background: C.tealSoft, display: 'grid', placeItems: 'center' }}>
                    <Check size={14} color={C.tealDeep} strokeWidth={3} />
                  </span>
                ) : (
                  <span style={{ width: 24, height: 24, borderRadius: 12, border: `1.5px dashed ${C.line}` }} />
                )}
              </span>
              <span style={{ width: 44, display: 'grid', placeItems: 'center' }}>
                <span style={{ width: 14, height: 14, borderRadius: 7, background: absent ? C.coral : graded ? C.teal : C.paperDeep, border: graded ? 'none' : `1.5px solid ${C.line}`, transform: `scale(${graded ? 0.8 + 0.2 * g : 1})` }} />
              </span>
              <span style={{ width: 62, display: 'grid', placeItems: 'center' }}>
                {graded ? (
                  <span style={{ width: 38, height: 32, borderRadius: 10, background: gs.bg, color: gs.color, fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, display: 'grid', placeItems: 'center', transform: `scale(${0.4 + 0.6 * g}) rotate(${(1 - g) * -12}deg)`, boxShadow: `0 0 0 ${(1 - g) * 10}px ${gs.bg}` }}>
                    {s.grade}
                  </span>
                ) : (
                  <span style={{ width: 38, height: 32, borderRadius: 10, border: `1.5px dashed ${C.line}`, color: C.inkMute, fontSize: 15, display: 'grid', placeItems: 'center' }}>—</span>
                )}
              </span>
            </div>
          );
        })}
      </MCard>

      {/* dim while listening */}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(22,20,31,${0.28 * dim})`, pointerEvents: 'none' }} />

      {/* mic FAB */}
      {frame < mic + 6 && (
        <div style={{ position: 'absolute', right: 18, bottom: 16, display: 'flex', alignItems: 'center', gap: 10, opacity: ease(frame, at + 40, 14), transform: `scale(${1 - 0.1 * pressed})`, transformOrigin: 'right center' }}>
          <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 14, color: C.indigoDeep, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', boxShadow: '0 8px 20px -10px rgba(22,20,31,0.3)' }}>Голосом</span>
          <span style={{ width: 62, height: 62, borderRadius: 31, background: `linear-gradient(135deg, ${C.indigo}, ${C.violet})`, display: 'grid', placeItems: 'center', boxShadow: '0 14px 30px -10px rgba(79,70,229,0.7)' }}>
            <Mic size={26} color="#fff" />
          </span>
        </div>
      )}

      {/* voice sheet */}
      {frame >= mic + 6 && sheetOut < 1 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: sheetH,
            borderRadius: '28px 28px 0 0',
            background: '#fff',
            boxShadow: '0 -20px 50px -20px rgba(22,20,31,0.35)',
            padding: '14px 20px',
            boxSizing: 'border-box',
            fontFamily: BODY,
            opacity: Math.min(1, sheet * 1.5) * (1 - sheetOut),
            transform: `translateY(${(1 - sheet) * 120 + sheetOut * 80}px)`,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: 44, height: 5, borderRadius: 3, background: C.line, margin: '0 auto 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30 }}>
            {listening ? (
              <>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: C.coral, opacity: 0.6 + 0.4 * Math.sin(frame / 6) }} />
                <span style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>Слушаю…</span>
              </>
            ) : (
              <>
                <Sparkles size={20} color={C.indigo} />
                <span style={{ fontWeight: 700, fontSize: 17, color: C.indigoDeep }}>ИИ проставляет оценки…</span>
              </>
            )}
          </div>
          <div style={{ opacity: 1 - compact, height: 56 * (1 - compact), overflow: 'hidden', marginTop: 10 }}>
            <Wave frame={frame} level={level} />
          </div>
          <div style={{ marginTop: 10 * (1 - compact) + 6, fontSize: 17 * (1 - compact * 0.18), lineHeight: 1.4, color: C.ink, minHeight: 50 }}>
            {words.map((w, i) => (
              <span key={i} style={{ opacity: i < shown ? 1 : 0.18, fontWeight: i < shown ? 600 : 400, transition: 'none' }}>
                {w}{' '}
              </span>
            ))}
          </div>
        </div>
      )}

      <Toast at={done} icon={<CheckCircle2 size={24} color={C.teal} />} title="Готово" text="6 оценок и 1 пропуск проставлены" until={done + 60} tone={C.ink} />
    </Content>
  );
};
