import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgUpdateStudent } from '../../lib/api';
import { Calendar, CheckCircle, Loader2, MapPin, Pencil, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

export interface EditableStudent {
  uid: string;
  displayName?: string;
  phone?: string;
  city?: string;
  enrollmentDate?: string;
}

interface Props {
  student: EditableStudent;
  onClose: () => void;
  /** Изменённые поля — чтобы вызывающий обновил свою копию без перезагрузки списка. */
  onSaved: (patch: { displayName: string; phone: string; city: string; enrollmentDate: string }) => void;
}

const EditStudentModal: React.FC<Props> = ({ student, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    displayName: student.displayName || '',
    phone: student.phone || '',
    city: student.city || '',
    enrollmentDate: (student as any).enrollmentDate || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.displayName.trim()) { toast.error('Укажите ФИО'); return; }
    const patch = {
      displayName: form.displayName.trim(),
      phone: form.phone.trim(),
      city: form.city.trim(),
      enrollmentDate: form.enrollmentDate,
    };
    setSaving(true);
    try {
      await orgUpdateStudent({ uid: student.uid, ...patch });
      toast.success(t('common.saved', 'Сохранено'));
      onSaved(patch);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm dark:text-white focus:ring-2 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white outline-none';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <Pencil className="w-4 h-4 text-slate-500" />
          {t('org.students.editTitle', 'Редактировать студента')}
        </h2>
        <p className="text-xs text-slate-500 mb-5">{t('org.students.editDesc', 'Измените данные студента и сохраните.')}</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('org.students.fullName', 'ФИО')} *</label>
            <input autoFocus value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} className={field} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {t('common.phone', 'Телефон')}</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+996 ..." className={field} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {t('common.city', 'Город')}</label>
            <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={field} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> {t('org.students.enrollmentDate', 'Дата поступления')}{' '}
              <span className="text-slate-400 font-normal">({t('common.optional', 'необязательно')})</span>
            </label>
            <input type="date" value={form.enrollmentDate} onChange={e => setForm(f => ({ ...f, enrollmentDate: e.target.value }))} className={field} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50">
            {t('common.cancel', 'Отмена')}
          </button>
          <button onClick={handleSave} disabled={saving || !form.displayName.trim()} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-2">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('common.saving', 'Сохранение...')}</> : <><CheckCircle className="w-3.5 h-3.5" /> {t('common.save', 'Сохранить')}</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditStudentModal;
