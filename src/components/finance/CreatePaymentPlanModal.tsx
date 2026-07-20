import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiCreatePaymentPlan, orgGetCourses } from '../../lib/api';
import { useBranch } from '../../contexts/BranchContext';
import { CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { CURRENCY_SUFFIX, formatMoney } from '../../lib/money';
import type { Course } from '../../types';

interface Props {
  studentId: string;
  studentName: string;
  /** Активные студенты для автокомплита. Не передан — студент зафиксирован. */
  students?: any[];
  onClose: () => void;
  onSuccess: () => void;
}

/** Явный «счёт вне курса». Такие счета не попадают в прибыльность по курсам. */
const NO_COURSE = 'general';

/**
 * Цена 0 — это настоящая цена (бесплатный курс), а не «не задана». Проверка
 * через truthiness съедала бы её и молча просила ввести сумму руками.
 */
const hasPrice = (c?: Course): c is Course & { price: number } => typeof c?.price === 'number';

/**
 * Выставление счёта. Список студентов необязателен: со страницы студентов счёт
 * всегда выставляется конкретному человеку, а в разделе финансов нужно уметь
 * переключиться на другого, не закрывая форму.
 *
 * Курс выбирается из справочника, а не пишется руками: раньше форма всегда
 * отправляла courseId='general', и любой выставленный вручную счёт оседал в
 * неатрибутируемой куче — прибыльность по курсам посчитать было невозможно.
 * Вариант «без курса» остался, но теперь это осознанный выбор, а не умолчание.
 */
const CreatePaymentPlanModal: React.FC<Props> = ({ studentId, studentName, students, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { activeBranchId } = useBranch();
  const [form, setForm] = useState({ studentId, studentName, courseId: '', courseName: '', totalAmount: '', deadline: '' });
  const [query, setQuery] = useState(studentName);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  // Автоподстановка цены не должна затирать введённое руками: как только
  // директор поправил сумму, смена курса её больше не трогает.
  const [amountTouched, setAmountTouched] = useState(false);

  useEffect(() => {
    orgGetCourses()
      .then((data: Course[]) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([]));
    // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  }, [activeBranchId]);

  const pickable = students !== undefined;

  const matches = useMemo(() => {
    const q = query.toLowerCase();
    return (students || []).filter(s =>
      (s.displayName?.toLowerCase() || '').includes(q) ||
      (s.email?.toLowerCase() || '').includes(q)
    ).slice(0, 8);
  }, [students, query]);

  const selectStudent = (s: any) => {
    setForm(f => ({ ...f, studentId: String(s.uid || s.id), studentName: s.displayName || '' }));
    setQuery(s.displayName || '');
    setShowDropdown(false);
  };

  const selectCourse = (id: string) => {
    const course = courses.find(c => c.id === id);
    setForm(f => ({
      ...f,
      courseId: id,
      // Название курса храним в счёте копией: курс могут переименовать или
      // удалить, а в истории платежей строка должна остаться читаемой.
      courseName: course ? course.title : '',
      totalAmount: !amountTouched && hasPrice(course) ? String(course.price) : f.totalAmount,
    }));
  };

  const selectedCourse = courses.find(c => c.id === form.courseId);
  const canSubmit = !!form.studentId && !!form.totalAmount && !!form.courseId;

  const handleCreate = async () => {
    if (!canSubmit) {
      toast.error(t('finances.fillStudentCourseAmount', 'Выберите студента, курс и укажите сумму'));
      return;
    }
    setSaving(true);
    try {
      await apiCreatePaymentPlan({
        studentId: form.studentId,
        studentName: form.studentName,
        courseId: form.courseId,
        courseName: form.courseName || t('finances.noCourseName', 'Общий'),
        totalAmount: Number(form.totalAmount),
        paidAmount: 0,
        status: 'pending',
        deadline: form.deadline || null,
      });
      toast.success(t('finances.planCreated', 'Счёт создан'));
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message || t('finances.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('finances.newPlanTitle', 'Новый счёт на оплату')}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.student', 'Студент')} *</label>
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
                  placeholder={t('finances.studentSearchPlaceholder', 'Начните вводить имя студента...')}
                />
                {form.studentId && (
                  <div className="absolute right-3 top-[34px] text-emerald-500"><CheckCircle2 className="w-4 h-4" /></div>
                )}
                {showDropdown && query && !form.studentId && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {matches.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-400">{t('finances.noStudentsFound', 'Студенты не найдены')}</div>
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.course', 'Курс')} *</label>
            <select value={form.courseId} onChange={e => selectCourse(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white">
              <option value="">{t('finances.selectCourse', 'Выберите курс...')}</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title}{hasPrice(c) ? ` — ${formatMoney(c.price)}` : ''}
                </option>
              ))}
              <option value={NO_COURSE}>{t('finances.noCourse', 'Без курса / другое')}</option>
            </select>
            {form.courseId === NO_COURSE && (
              <input type="text" value={form.courseName}
                onChange={e => setForm(f => ({ ...f, courseName: e.target.value }))}
                className="w-full mt-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
                placeholder={t('finances.planPurposePlaceholder', 'За что счёт: учебники, экзамен...')}
              />
            )}
            {selectedCourse && !hasPrice(selectedCourse) && (
              <p className="text-[11px] text-slate-400 mt-1">{t('finances.coursePriceMissing', 'У курса не задана цена — укажите сумму вручную')}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('finances.amount', 'Сумма')} ({CURRENCY_SUFFIX}) *
            </label>
            <input type="number" min="1" autoFocus={!pickable || !!form.studentId} value={form.totalAmount}
              onChange={e => { setAmountTouched(true); setForm(f => ({ ...f, totalAmount: e.target.value })); }}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold dark:text-white"
              placeholder="5000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.deadline', 'Срок оплаты')}</label>
            <input type="date" value={form.deadline}
              onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
            />
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">{t('finances.cancel', 'Отмена')}</button>
          <button onClick={handleCreate} disabled={saving || !canSubmit}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all">
            {saving ? t('finances.creating', 'Создание...') : t('finances.createPlan', 'Создать счёт')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePaymentPlanModal;
