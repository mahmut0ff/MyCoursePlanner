import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orgUpdateTeacher } from '../../lib/api';
import { CheckCircle, Loader2, MapPin, Pencil, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

export interface EditableTeacher {
  uid: string;
  displayName?: string;
  phone?: string;
  city?: string;
}

interface Props {
  teacher: EditableTeacher;
  onClose: () => void;
  /** Изменённые поля — чтобы вызывающий обновил свою копию без перезагрузки списка. */
  onSaved: (patch: { displayName: string; phone: string; city: string }) => void;
}

/**
 * Правка карточки преподавателя. Намеренно уже, чем форма добавления: логин,
 * пароль и роли сюда не входят — доступом заведует RBAC на странице команды.
 */
const EditTeacherModal: React.FC<Props> = ({ teacher, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    displayName: teacher.displayName || '',
    phone: teacher.phone || '',
    city: teacher.city || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.displayName.trim()) { toast.error('Укажите ФИО'); return; }
    const patch = {
      displayName: form.displayName.trim(),
      phone: form.phone.trim(),
      city: form.city.trim(),
    };
    setSaving(true);
    try {
      await orgUpdateTeacher({ uid: teacher.uid, ...patch });
      toast.success(t('common.saved', 'Сохранено'));
      onSaved(patch);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const field = 'input';

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-pop max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
          <Pencil className="w-4 h-4 text-slate-500" />
          {t('org.teachers.editTitle', 'Редактировать преподавателя')}
        </h2>
        <p className="text-xs text-slate-500 mb-4">{t('org.teachers.editDesc', 'Измените данные преподавателя и сохраните. Логин и права меняются отдельно.')}</p>
        <div className="space-y-3">
          <div>
            <label className="label">{t('org.students.fullName', 'ФИО')} *</label>
            <input autoFocus value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} className={field} />
          </div>
          <div>
            <label className="label flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {t('common.phone', 'Телефон')}</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+996 ..." className={field} />
          </div>
          <div>
            <label className="label flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {t('common.city', 'Город')}</label>
            <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={field} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={saving} className="btn-ghost disabled:opacity-50">
            {t('common.cancel', 'Отмена')}
          </button>
          <button onClick={handleSave} disabled={saving || !form.displayName.trim()} className="btn-primary disabled:opacity-50 inline-flex items-center gap-1.5">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('common.saving', 'Сохранение...')}</> : <><CheckCircle className="w-3.5 h-3.5" /> {t('common.save', 'Сохранить')}</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditTeacherModal;
