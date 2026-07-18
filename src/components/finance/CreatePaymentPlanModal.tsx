import React, { useState } from 'react';
import { apiCreatePaymentPlan } from '../../lib/api';
import { CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  studentId: string;
  studentName: string;
  /** Активные студенты для автокомплита. Не передан — студент зафиксирован. */
  students?: any[];
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Выставление счёта. Список студентов необязателен: со страницы студентов счёт
 * всегда выставляется конкретному человеку, а в разделе финансов нужно уметь
 * переключиться на другого, не закрывая форму.
 */
const CreatePaymentPlanModal: React.FC<Props> = ({ studentId, studentName, students, onClose, onSuccess }) => {
  const [form, setForm] = useState({ studentId, studentName, courseName: '', totalAmount: '', deadline: '' });
  const [query, setQuery] = useState(studentName);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickable = students !== undefined;

  const matches = (students || []).filter(s =>
    (s.displayName?.toLowerCase() || '').includes(query.toLowerCase()) ||
    (s.email?.toLowerCase() || '').includes(query.toLowerCase())
  ).slice(0, 8);

  const selectStudent = (s: any) => {
    setForm(f => ({ ...f, studentId: String(s.uid || s.id), studentName: s.displayName || '' }));
    setQuery(s.displayName || '');
    setShowDropdown(false);
  };

  const handleCreate = async () => {
    if (!form.studentId || !form.totalAmount) {
      toast.error('Выберите студента и укажите сумму');
      return;
    }
    setSaving(true);
    try {
      await apiCreatePaymentPlan({
        studentId: form.studentId,
        studentName: form.studentName,
        courseId: 'general',
        courseName: form.courseName || 'Общий',
        totalAmount: Number(form.totalAmount),
        paidAmount: 0,
        status: 'pending',
        deadline: form.deadline || null,
      });
      toast.success('Счёт создан');
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Новый счёт на оплату</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Студент *</label>
            {pickable ? (
              <>
                <input
                  type="text"
                  autoFocus={!form.studentId}
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    setShowDropdown(true);
                    if (!e.target.value) setForm(f => ({ ...f, studentId: '', studentName: '' }));
                  }}
                  onFocus={() => setShowDropdown(true)}
                  className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-4 py-2.5 text-sm dark:text-white ${
                    form.studentId ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700'
                  }`}
                  placeholder="Начните вводить имя студента..."
                />
                {form.studentId && (
                  <div className="absolute right-3 top-[34px] text-emerald-500"><CheckCircle2 className="w-4 h-4" /></div>
                )}
                {showDropdown && query && !form.studentId && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {matches.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Студенты не найдены</div>
                    ) : matches.map(s => (
                      <button key={s.uid || s.id} type="button" onClick={() => selectStudent(s)}
                        className="w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors">
                        {s.avatarUrl ? (
                          <img src={s.avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold">
                            {s.displayName?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{s.displayName}</p>
                          <p className="text-[11px] text-slate-400">{s.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white">
                {form.studentName || '—'}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Курс / Предмет</label>
            <input type="text" value={form.courseName}
              onChange={e => setForm(f => ({ ...f, courseName: e.target.value }))}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
              placeholder="Английский язык"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Сумма (сом) *</label>
            <input type="number" min="1" autoFocus={!pickable || !!form.studentId} value={form.totalAmount}
              onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold dark:text-white"
              placeholder="5000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Срок оплаты</label>
            <input type="date" value={form.deadline}
              onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
            />
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">Отмена</button>
          <button onClick={handleCreate} disabled={saving || !form.studentId || !form.totalAmount}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all">
            {saving ? 'Создание...' : 'Создать счёт'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePaymentPlanModal;
