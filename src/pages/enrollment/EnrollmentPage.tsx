import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { EnrollmentTab } from '../org-settings/EnrollmentTab';
import BulkImportModal from '../../components/ai/BulkImportModal';
import QuickAddBox from '../../components/ai/QuickAddBox';
import { usePlanGate } from '../../contexts/PlanContext';
import { apiGetInviteGroups, apiGetGroupCode, apiRegenGroupCode, type InviteGroup } from '../../lib/api';
import { Loader2, Copy, Check, RefreshCw, Layers, Download, Users, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

/* ── Per-group invite link ── */
const GroupInviteSection: React.FC<{ groups: InviteGroup[] }> = ({ groups }) => {
  const [selId, setSelId] = useState('');
  const [link, setLink] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async (groupId: string, regen = false) => {
    if (!groupId) { setLink(''); setQr(''); setCode(''); return; }
    setLoading(true);
    try {
      const res = regen ? await apiRegenGroupCode(groupId) : await apiGetGroupCode(groupId);
      setLink(res.link); setCode(res.code);
      QRCode.toDataURL(res.link, { width: 256, margin: 1 }).then(setQr).catch(() => {});
    } catch (e: any) { toast.error(e?.message || 'Ошибка'); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Ссылка на конкретную группу</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Кто перейдёт — попадёт сразу в эту группу, без ручной сортировки</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Сначала создайте группы — тогда здесь появятся ссылки для каждой.</p>
      ) : (
        <>
          <select value={selId} onChange={(e) => { setSelId(e.target.value); load(e.target.value); }} className="input w-full mb-3">
            <option value="">Выберите группу…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.courseName ? ` · ${g.courseName}` : ''} ({g.studentsCount})</option>)}
          </select>

          {loading && <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}

          {!loading && link && (
            <div className="flex flex-col sm:flex-row gap-4">
              {qr && <div className="w-28 h-28 bg-white rounded-xl p-2 border border-slate-200 dark:border-slate-600 shrink-0 mx-auto sm:mx-0"><img src={qr} alt="QR" className="w-full h-full" /></div>}
              <div className="flex-1 min-w-0 space-y-2">
                <p className="font-mono text-base font-bold text-slate-900 dark:text-white tracking-widest">{code}</p>
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                  <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate flex-1">{link}</a>
                  <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); toast.success('Скопировано'); setTimeout(() => setCopied(false), 2000); }} className="p-1.5 rounded-md text-slate-400 hover:text-primary-600 shrink-0">
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { if (qr) { const a = document.createElement('a'); a.href = qr; a.download = `group-${code}.png`; a.click(); } }} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"><Download className="w-3.5 h-3.5" /> QR</button>
                  <button onClick={() => { if (window.confirm('Старая ссылка перестанет работать. Продолжить?')) load(selId, true); }} className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 text-slate-500"><RefreshCw className="w-3.5 h-3.5" /> Сменить</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const EnrollmentPage: React.FC = () => {
  const { canAccess } = usePlanGate();
  const hasAI = canAccess('ai');
  const [groups, setGroups] = useState<InviteGroup[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  const loadGroups = () => { apiGetInviteGroups().then((r) => setGroups(r.groups || [])).catch(() => {}); };
  useEffect(() => { loadGroups(); }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="mb-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Набор</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Регистрация учеников и преподавателей через Telegram — ссылки, QR и AI-импорт списков.
        </p>
      </div>

      <EnrollmentTab />

      <GroupInviteSection groups={groups} />

      {/* Mass add */}
      {hasAI && (
        <>
          <button
            onClick={() => setBulkOpen(true)}
            className="w-full text-left bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl p-5 hover:opacity-95 transition-opacity flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Users className="w-6 h-6" /></div>
            <div className="flex-1">
              <p className="font-semibold">AI-импорт списка</p>
              <p className="text-sm text-white/85">Фото бумажного журнала, скрин WhatsApp или вставленный список → аккаунты + ссылки пачкой</p>
            </div>
            <ArrowRight className="w-5 h-5 shrink-0" />
          </button>

          <QuickAddBox onDone={loadGroups} />
        </>
      )}

      <BulkImportModal open={bulkOpen} onClose={() => setBulkOpen(false)} groups={groups} onDone={loadGroups} />
    </div>
  );
};

export default EnrollmentPage;
