import React, { useRef, useState } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { apiRosterExtract, apiBulkCreate, type InviteGroup, type BulkCreateRow } from '../../lib/api';
import { X, Loader2, Sparkles, Upload, ClipboardPaste, Trash2, Plus, Copy, Check, Users } from 'lucide-react';
import toast from 'react-hot-toast';

type Row = { name: string; phone: string };

const BulkImportModal: React.FC<{ open: boolean; onClose: () => void; groups: InviteGroup[]; onDone?: () => void }> = ({ open, onClose, groups, onDone }) => {
  const { organizationId } = useAuth();
  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [groupId, setGroupId] = useState('');
  const [results, setResults] = useState<BulkCreateRow[] | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => { setText(''); setRows([]); setResults(null); setGroupId(''); setRole('student'); };
  const close = () => { reset(); onClose(); };

  const extractFromText = async () => {
    if (!text.trim()) { toast.error('Вставьте список'); return; }
    setBusy(true);
    try {
      const res = await apiRosterExtract({ prompt: text.trim() });
      const students = res?.data?.students || [];
      setRows(students.map((s) => ({ name: s.name || '', phone: s.phone || '' })));
      if (students.length === 0) toast.error('Не удалось распознать людей');
    } catch (e: any) { toast.error(e?.message || 'Ошибка распознавания'); }
    finally { setBusy(false); }
  };

  const extractFromFile = async (file: File) => {
    setBusy(true);
    try {
      const path = `ai-imports/${organizationId}/${Date.now()}-${file.name}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const res = await apiRosterExtract({ fileUrl: url });
      const students = res?.data?.students || [];
      setRows(students.map((s) => ({ name: s.name || '', phone: s.phone || '' })));
      if (students.length === 0) toast.error('На фото не нашлось людей — попробуйте чётче');
    } catch (e: any) { toast.error(e?.message || 'Ошибка обработки файла'); }
    finally { setBusy(false); }
  };

  const create = async () => {
    const clean = rows.filter((r) => r.name.trim() || r.phone.trim());
    if (clean.length === 0) { toast.error('Список пуст'); return; }
    setBusy(true);
    try {
      const res = await apiBulkCreate({ students: clean, role, groupId: groupId || undefined });
      setResults(res.results);
      toast.success(`Создано: ${res.created}`);
      onDone?.();
    } catch (e: any) { toast.error(e?.message || 'Ошибка создания'); }
    finally { setBusy(false); }
  };

  const copyAll = () => {
    const lines = (results || []).filter((r) => r.link).map((r) => `${r.name}: ${r.link}`).join('\n');
    navigator.clipboard.writeText(lines);
    setCopiedAll(true);
    toast.success('Все ссылки скопированы');
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI-импорт списка</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Из фото журнала, скрина чата или вставленного списка</p>
            </div>
          </div>
          <button onClick={close} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {!results && rows.length === 0 && (
            <>
              <div className="flex gap-1.5">
                <button onClick={() => setTab('paste')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'paste' ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}><ClipboardPaste className="w-4 h-4" /> Вставить текст</button>
                <button onClick={() => setTab('upload')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'upload' ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}><Upload className="w-4 h-4" /> Фото / PDF</button>
              </div>

              {tab === 'paste' ? (
                <>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} className="input w-full min-h-[140px] resize-y font-mono text-sm" placeholder={'Вставьте список из Excel, WhatsApp, заметок…\nНапример:\nАйгуль Сатарова +996700112233\nБекзат Ж. 0555 44 55 66'} autoFocus />
                  <button onClick={extractFromText} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Распознать список
                  </button>
                </>
              ) : (
                <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center cursor-pointer hover:border-primary-300 transition-colors">
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) extractFromFile(f); e.target.value = ''; }} />
                  {busy ? <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" /> : <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />}
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-2">Загрузите фото бумажного списка или PDF</p>
                  <p className="text-xs text-slate-400 mt-1">AI распознает имена и телефоны</p>
                </div>
              )}
            </>
          )}

          {/* Editable preview */}
          {!results && rows.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Проверьте список ({rows.length})</p>
                <button onClick={() => setRows((r) => [...r, { name: '', phone: '' }])} className="text-xs text-primary-600 dark:text-primary-400 font-medium flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Строка</button>
              </div>
              <div className="max-h-[240px] overflow-y-auto space-y-1.5">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={r.name} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="input flex-1 text-sm py-1.5" placeholder="Имя Фамилия" />
                    <input value={r.phone} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} className="input w-36 text-sm py-1.5" placeholder="+996…" />
                    <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="p-1.5 text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={role} onChange={(e) => setRole(e.target.value as any)} className="input text-sm">
                  <option value="student">Ученики</option>
                  <option value="teacher">Преподаватели</option>
                </select>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="input text-sm" disabled={role === 'teacher'}>
                  <option value="">Без группы</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.courseName ? ` · ${g.courseName}` : ''}</option>)}
                </select>
              </div>
              <button onClick={create} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Создать {rows.filter(r => r.name.trim() || r.phone.trim()).length} аккаунтов
              </button>
            </>
          )}

          {/* Results */}
          {results && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Готово ✅ ({results.filter(r => r.status !== 'error').length})</p>
                <button onClick={copyAll} className="text-xs font-medium text-primary-600 dark:text-primary-400 flex items-center gap-1">
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} Скопировать все ссылки
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Отправьте каждому его персональную ссылку — он войдёт одним тапом, без пароля.</p>
              <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.name}{r.phone ? ` · ${r.phone}` : ''}</p>
                      {r.link ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate block">{r.link}</a> : <span className="text-xs text-red-500">{r.error || 'ошибка'}</span>}
                    </div>
                    {r.link && (
                      <button onClick={() => { navigator.clipboard.writeText(r.link!); toast.success('Скопировано'); }} className="p-1.5 text-slate-400 hover:text-primary-600 shrink-0"><Copy className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={close} className="btn-secondary w-full">Закрыть</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkImportModal;
