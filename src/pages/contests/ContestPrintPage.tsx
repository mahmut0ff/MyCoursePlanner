/**
 * Печатные формы конкурса: список участников (регистрация), таблички с
 * номерами на столы и протокол итогов категории. PDF — через системный диалог
 * печати («Сохранить как PDF»): так кириллица остаётся текстом, а не картинкой,
 * и не нужно тащить в бандл шрифты для jsPDF.
 */
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { apiContestGet } from '../../lib/api';
import { CONTEST_KIND_LABELS, formatContestDate, juryForCategory, maxTotal, round2, type ContestBundle } from '../../lib/contests';
import { categoryRanking, prizeFor } from './results';

type What = 'participants' | 'placards' | 'protocol';

const ContestPrintPage: React.FC = () => {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const what = (['participants', 'placards', 'protocol'].includes(params.get('what') || '') ? params.get('what') : 'participants') as What;
  const categoryFilter = params.get('category') || '';
  const [data, setData] = useState<ContestBundle | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { apiContestGet(id).then(setData, (e) => setError(e?.message || 'Ошибка')); }, [id]);

  if (error) return <div className="p-8 text-rose-600">{error}</div>;
  if (!data) return <div className="p-8 text-slate-600 dark:text-slate-300">Загрузка…</div>;
  const { contest } = data;
  const cats = contest.categories.filter((c) => !categoryFilter || c.id === categoryFilter);
  const set = (k: string, v: string) => setParams((p) => { if (v) p.set(k, v); else p.delete(k); return p; }, { replace: true });

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
          .page-break { break-after: page; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .print-table th, .print-table td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; }
        .print-table th { background: #f1f5f9; font-weight: 600; }
      `}</style>

      <div className="no-print sticky top-0 bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-3">
        <Link to={`/contests/${contest.id}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="w-4 h-4" />К конкурсу</Link>
        <select value={what} onChange={(e) => set('what', e.target.value)} className="input w-auto">
          <option value="participants">Список участников</option>
          <option value="placards">Таблички на столы</option>
          <option value="protocol">Протокол итогов</option>
        </select>
        <select value={categoryFilter} onChange={(e) => set('category', e.target.value)} className="input w-auto">
          <option value="">Все категории</option>
          {contest.categories.map((c) => <option key={c.id} value={c.id}>Категория {c.code}</option>)}
        </select>
        <button onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold"><Printer className="w-4 h-4" />Печать / PDF</button>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-6 print:p-0">
        {what !== 'placards' && (
          <header className="mb-5">
            <div className="text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-300">{CONTEST_KIND_LABELS[contest.kind]}{contest.season ? ` · ${contest.season}` : ''}</div>
            <h1 className="text-xl font-bold">{contest.title}</h1>
            <div className="text-sm text-slate-600">{[formatContestDate(contest.eventDate), contest.venue].filter(Boolean).join(' · ')}</div>
          </header>
        )}

        {what === 'participants' && cats.map((c, ci) => {
          const list = data.participants.filter((p) => p.categoryId === c.id && p.status !== 'withdrawn');
          return (
            <section key={c.id} className={ci < cats.length - 1 ? 'page-break mb-8' : ''}>
              <h2 className="font-bold text-base mb-2">Категория {c.code} · {c.name} ({c.ageFrom}–{c.ageTo} лет) — {list.length} уч.</h2>
              <table className="print-table">
                <thead><tr><th style={{ width: 60 }}>№</th><th>ФИО (возраст)</th><th>Проект</th><th>Город / район</th><th>Телефон</th><th style={{ width: 90 }}>Отметка</th></tr></thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{p.number}</td>
                      <td>{p.authors.map((a) => `${a.name}${a.age != null ? ` (${a.age})` : ''}`).join(', ')}</td>
                      <td>{p.projectTitle}</td>
                      <td>{p.city}</td>
                      <td>{p.phone}</td>
                      <td>{p.status === 'arrived' ? 'пришёл' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        {what === 'placards' && (
          <div className="grid grid-cols-2 gap-4 print:gap-3">
            {cats.flatMap((c) => data.participants.filter((p) => p.categoryId === c.id && p.status !== 'withdrawn')).map((p) => (
              <div key={p.id} className="border-2 border-slate-900 rounded-xl p-5 text-center break-inside-avoid" style={{ minHeight: '120mm', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div className="text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-300">{contest.title}</div>
                <div className="font-mono font-black my-4" style={{ fontSize: '72px', lineHeight: 1 }}>{p.number}</div>
                <div className="text-lg font-bold">{p.projectTitle}</div>
                <div className="text-sm text-slate-600 mt-1">{p.authors.map((a) => a.name).join(', ')}</div>
              </div>
            ))}
          </div>
        )}

        {what === 'protocol' && cats.map((c, ci) => {
          const r = categoryRanking(data, c.id)!;
          const catJury = juryForCategory(data.jury, c.id);
          const approvedPlace = new Map((r.approved?.rows || []).map((x) => [x.participantId, x.place]));
          const placeOf = (pid: string, live: number | null) => (r.approved ? approvedPlace.get(pid) ?? null : live);
          const rows = r.approved ? [...r.rows].sort((a, b) => (placeOf(a.participantId, a.place) ?? 1e9) - (placeOf(b.participantId, b.place) ?? 1e9)) : r.rows;
          return (
            <section key={c.id} className={ci < cats.length - 1 ? 'page-break mb-8' : ''}>
              <h2 className="font-bold text-base">Протокол оценивания · категория {c.code} ({c.ageFrom}–{c.ageTo} лет)</h2>
              <p className="text-sm mb-3">
                {r.approved ? `Итоги утверждены ${new Date(r.approved.at).toLocaleString('ru-RU')} (${r.approved.byName}).` : 'ПРЕДВАРИТЕЛЬНЫЕ ИТОГИ — не утверждены.'}
                {' '}Итоговый балл — среднее арифметическое сумм баллов оценивших членов жюри (максимум {maxTotal(contest.criteria)}).
              </p>
              <table className="print-table">
                <thead>
                  <tr>
                    <th>Место</th><th>№</th><th>Проект / авторы</th>
                    {contest.criteria.map((cr) => <th key={cr.id} title={cr.name}>{cr.name} (ср.)</th>)}
                    <th>Итог</th><th>Сумма</th><th>Жюри</th><th>Приз</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const place = placeOf(row.participantId, row.place);
                    return (
                      <tr key={row.participantId}>
                        <td style={{ fontWeight: 700 }}>{place ?? '—'}{row.needsDecision && !r.approved ? ' (ничья)' : ''}</td>
                        <td style={{ fontFamily: 'monospace' }}>{row.number}</td>
                        <td><b>{row.projectTitle}</b><br />{row.authors}</td>
                        {contest.criteria.map((cr) => <td key={cr.id}>{row.juryCount ? round2(row.criterionAverages[cr.id]) : '—'}</td>)}
                        <td style={{ fontWeight: 700 }}>{round2(row.average)}</td>
                        <td>{round2(row.sum)}</td>
                        <td>{row.juryCount}/{catJury.length}</td>
                        <td>{prizeFor(c, place)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {contest.tieBreakCriterionIds.length > 0 && (
                <p className="text-[12px] mt-2">Порядок разрешения ничьей: {contest.tieBreakCriterionIds.map((tid) => contest.criteria.find((x) => x.id === tid)?.name).filter(Boolean).join(' → ')}.</p>
              )}
              {r.resolutions.map((x, i) => (
                <p key={i} className="text-[12px] mt-1">Решение жюри по ничьей ({x.participantIds.map((pid) => r.rows.find((row) => row.participantId === pid)?.number).join(' > ')}): {x.comment}</p>
              ))}
              <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-6 text-sm break-inside-avoid">
                {catJury.map((j) => (
                  <div key={j.uid}><div className="border-b border-slate-400 h-6" /><div className="text-[12px] mt-1">{j.name}{j.title ? `, ${j.title}` : ''}</div></div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ContestPrintPage;
