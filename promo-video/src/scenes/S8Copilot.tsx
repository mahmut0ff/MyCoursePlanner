import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ArrowUp, CheckCircle2, Sparkles, UserPlus } from 'lucide-react';
import { BODY, C, beat, ease, exitStyle, pop } from '../theme';
import { Caption, Cursor } from '../components/ui';

// Bars 24–27 (drop B). The AdminCopilotWidget: a lookup answered instantly,
// then a write that waits for an explicit «Выполнить» — the two-phase
// confirm the real assistant enforces.

const PX = 800;
const PY = 110;
const PW = 1010;
const PH = 870;

const Q1 = 'Покажи должников';
const Q2 = 'Добавь студента Алия Токтосунова в группу Английский B1';

const T_Q1 = beat(1);
const T_A1 = beat(2);
const TYPE_START = beat(4);
const TYPE_END = beat(7.5);
const T_Q2 = beat(8);
const T_CARD = beat(9);
const T_CLICK = beat(11);
const T_DONE = beat(12);

const DEBTORS = [
  ['Бакыт Осмонов', 'Робототехника', '7 600 с.'],
  ['Айпери Жумабаева', 'Английский A2', '6 200 с.'],
  ['Тимур Ким', 'Frontend', '9 800 с.'],
];

const UserMsg: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const p = pop(useCurrentFrame(), at);
  return (
    <div
      style={{
        alignSelf: 'flex-end',
        background: C.indigo,
        color: '#fff',
        padding: '14px 20px',
        borderRadius: 20,
        borderBottomRightRadius: 6,
        fontSize: 21,
        fontWeight: 500,
        maxWidth: 640,
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${(1 - p) * 20}px)`,
      }}
    >
      {text}
    </div>
  );
};

export const S8Copilot: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const typed = Math.round(Q2.length * ease(frame, TYPE_START, TYPE_END - TYPE_START, 'inOut'));
  const inputText = frame >= T_Q2 ? '' : frame >= TYPE_START ? Q2.slice(0, typed) : '';
  const caret = Math.floor(frame / 8) % 2 === 0;
  const card = pop(frame, T_CARD, false);
  const done = ease(frame, T_DONE, 10);
  const pressed = frame >= T_CLICK && frame < T_CLICK + 6;
  // scroll the thread once the confirm card arrives
  const scroll = ease(frame, T_Q2, 20, 'inOut') * 120;

  return (
    <AbsoluteFill style={exitStyle(frame, duration)}>
      <Caption
        n="05"
        label="AI-ассистент"
        title={['Скажите —', 'и готово']}
        body="Ассистент найдёт данные, добавит ученика или перенесёт урок. Любое изменение — только после вашего «Выполнить»."
        bullets={[
          { text: 'Ученики, группы, уроки, оплаты', at: beat(5) },
          { text: 'Импорт списка со скриншота', at: beat(6) },
        ]}
        width={590}
      />

      <div
        style={{
          position: 'absolute',
          left: PX,
          top: PY,
          width: PW,
          height: PH,
          borderRadius: 30,
          background: C.card,
          border: `1px solid ${C.line}`,
          boxShadow: '0 40px 90px -30px rgba(22,20,31,0.35)',
          overflow: 'hidden',
          fontFamily: BODY,
          opacity: pop(frame, 0, false),
          transform: `translateY(${(1 - pop(frame, 0, false)) * 50}px)`,
        }}
      >
        {/* header */}
        <div style={{ height: 96, display: 'flex', alignItems: 'center', gap: 16, padding: '0 30px', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ width: 52, height: 52, borderRadius: 16, background: C.indigoSoft, display: 'grid', placeItems: 'center' }}>
            <Sparkles size={26} color={C.indigo} />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 23, color: C.ink }}>AI-ассистент</div>
            <div style={{ fontSize: 17, color: C.inkMute }}>Управление центром командами</div>
          </div>
        </div>

        {/* thread */}
        <div style={{ position: 'absolute', top: 96, left: 0, right: 0, bottom: 110, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 30px', transform: `translateY(${-scroll}px)` }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['Сколько у нас студентов?', Q1, 'Расписание на сегодня'].map((s, i) => {
                const p = pop(frame, 4 + i * 4);
                const hot = s === Q1 && frame >= T_Q1 - 8 && frame < T_Q1 + 6;
                return (
                  <span
                    key={s}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 999,
                      border: `1.5px solid ${hot ? C.indigo : C.line}`,
                      background: hot ? C.indigoSoft : C.card,
                      fontSize: 18,
                      fontWeight: 600,
                      color: C.inkSoft,
                      opacity: Math.min(1, p * 1.5),
                      transform: `scale(${0.9 + 0.1 * p})`,
                    }}
                  >
                    {s}
                  </span>
                );
              })}
            </div>

            {frame >= T_Q1 && <UserMsg text={Q1} at={T_Q1} />}

            {frame >= T_A1 && (
              <div style={{ alignSelf: 'flex-start', width: 700, opacity: ease(frame, T_A1, 8) }}>
                <div style={{ fontSize: 21, color: C.ink, lineHeight: 1.4 }}>
                  Нашёл <b>5 должников</b> на <b>38 400 с.</b> Вот самые крупные:
                </div>
                <div style={{ marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 18, overflow: 'hidden' }}>
                  {DEBTORS.map(([n, g, s], i) => {
                    const t = ease(frame, T_A1 + 6 + i * 5, 10);
                    return (
                      <div
                        key={n}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '13px 18px',
                          borderTop: i ? `1px solid ${C.line}` : 'none',
                          opacity: t,
                          transform: `translateX(${(1 - t) * 16}px)`,
                          fontSize: 19,
                        }}
                      >
                        <span style={{ flex: 1, fontWeight: 600, color: C.ink }}>{n}</span>
                        <span style={{ width: 220, color: C.inkMute }}>{g}</span>
                        <span style={{ width: 120, textAlign: 'right', fontWeight: 700, color: C.coral }}>{s}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {frame >= T_Q2 && <UserMsg text={Q2} at={T_Q2} />}

            {frame >= T_CARD && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  width: 640,
                  borderRadius: 22,
                  border: `1.5px solid ${done > 0 ? C.teal : C.indigo}55`,
                  background: done > 0 ? C.tealSoft : '#FAFAFF',
                  padding: 24,
                  opacity: card,
                  transform: `translateY(${(1 - card) * 24}px)`,
                }}
              >
                {done < 1 ? (
                  <div style={{ opacity: 1 - done }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, fontSize: 22, color: C.ink }}>
                      <UserPlus size={24} color={C.indigo} /> Создать студента?
                    </div>
                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: 8, fontSize: 19 }}>
                      <span style={{ color: C.inkMute }}>ФИО</span>
                      <span style={{ fontWeight: 600, color: C.ink }}>Алия Токтосунова</span>
                      <span style={{ color: C.inkMute }}>Группа</span>
                      <span style={{ fontWeight: 600, color: C.ink }}>Английский B1 · Пн/Ср 16:00</span>
                      <span style={{ color: C.inkMute }}>Филиал</span>
                      <span style={{ fontWeight: 600, color: C.ink }}>Южный филиал (Джал)</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                      <span
                        style={{
                          padding: '12px 26px',
                          borderRadius: 14,
                          background: C.indigo,
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 19,
                          transform: `scale(${pressed ? 0.94 : 1})`,
                        }}
                      >
                        Выполнить
                      </span>
                      <span style={{ padding: '12px 22px', borderRadius: 14, border: `1.5px solid ${C.line}`, fontWeight: 600, fontSize: 19, color: C.inkSoft }}>
                        Отмена
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 22, fontWeight: 700, color: C.tealDeep, transform: `scale(${0.9 + 0.1 * pop(frame, T_DONE + 10)})` }}>
                    <CheckCircle2 size={30} /> Студент добавлен в группу Английский B1
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div style={{ position: 'absolute', left: 24, right: 24, bottom: 22, height: 70, borderRadius: 20, border: `1.5px solid ${frame >= TYPE_START && frame < T_Q2 ? C.indigo : C.line}`, display: 'flex', alignItems: 'center', padding: '0 12px 0 22px', gap: 12 }}>
          <span style={{ flex: 1, fontSize: 20, color: inputText ? C.ink : C.inkMute, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {inputText || 'Например: добавь студента Иванов Иван…'}
            {frame >= TYPE_START && frame < T_Q2 && caret && <span style={{ color: C.indigo }}>|</span>}
          </span>
          <span style={{ width: 48, height: 48, borderRadius: 14, background: inputText ? C.indigo : C.paperDeep, display: 'grid', placeItems: 'center' }}>
            <ArrowUp size={24} color={inputText ? '#fff' : C.inkMute} />
          </span>
        </div>
      </div>

      <div style={{ position: 'absolute', left: PX, top: PY + PH + 18, width: PW, textAlign: 'center', fontFamily: BODY, fontSize: 17, color: C.inkMute, opacity: ease(frame, T_CARD, 12) }}>
        ИИ может ошибаться — проверяйте действия перед подтверждением
      </div>

      <Cursor
        show={[T_Q1 - 20, T_CLICK + 20]}
        keys={[
          { f: T_Q1 - 20, x: 1500, y: 420 },
          { f: T_Q1 - 4, x: 1230, y: 245, click: true },
          { f: T_Q2, x: 1500, y: 700 },
          { f: T_CLICK - 2, x: 0, y: 0 },
          { f: T_CLICK, x: 0, y: 0, click: true },
          { f: T_CLICK + 20, x: 0, y: 0 },
        ].map((k, i) => (i >= 3 ? { ...k, x: CLICK_X + (i === 5 ? 40 : 0), y: CLICK_Y + (i === 5 ? 40 : 0) } : k))}
      />
    </AbsoluteFill>
  );
};

// «Выполнить» button centre on screen (thread scrolled by 120px)
const CLICK_X = 934;
const CLICK_Y = 740;
