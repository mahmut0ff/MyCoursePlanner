import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GradeSchema, GradingType } from '../../types';
import { X, Settings, Check, Plus, Trash2 } from 'lucide-react';
import { orgSaveGradeSchema } from '../../lib/api';
import { GRADE_PRESETS, type GradePreset } from '../../lib/gradePresets';
import toast from 'react-hot-toast';

interface GradeSchemaConfigProps {
  courseId: string;
  schema: GradeSchema | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (schema: GradeSchema) => void;
}


const GradeSchemaConfig: React.FC<GradeSchemaConfigProps> = ({ courseId, schema, isOpen, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  
  const [gradingType, setGradingType] = useState<GradingType>(schema?.gradingType || 'points');
  const [minVal, setMinVal] = useState(schema?.scale?.min ?? 0);
  const [maxVal, setMaxVal] = useState(schema?.scale?.max ?? 100);
  const [passThreshold, setPassThreshold] = useState(schema?.passThreshold ?? 50);
  const [labels, setLabels] = useState<Record<string, string>>(schema?.scale?.labels || {});
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');

  if (!isOpen) return null;

  const applyPreset = (p: GradePreset) => {
    setGradingType(p.gradingType);
    setMinVal(p.scale.min);
    setMaxVal(p.scale.max);
    setPassThreshold(p.passThreshold);
    setLabels(p.scale.labels || {});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        courseId,
        gradingType,
        scale: { min: minVal, max: maxVal, labels: Object.keys(labels).length > 0 ? labels : undefined },
        passThreshold,
        rules: schema?.rules || {}
      };
      const res = await orgSaveGradeSchema(data);
      toast.success(t('gradebook.schemaSaved', 'Настройки шкалы оценивания сохранены'));
      onSaved(res as GradeSchema);
      onClose();
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddLabel = () => {
    const key = newKey.trim();
    if (!key) return;
    setLabels(prev => ({ ...prev, [key]: newDesc.trim() }));
    setNewKey('');
    setNewDesc('');
  };

  const handleRemoveLabel = (key: string) => {
    setLabels(prev => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('gradebook.schemaTitle', 'Шкала оценивания')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('gradebook.schemaSubtitle', 'Настройте систему оценок для этого курса')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          
          <div className="space-y-4">
            {/* ── Quick presets ── */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('gradebook.presets', 'Готовые шкалы')}
              </label>
              <div className="flex flex-wrap gap-2">
                {GRADE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    {t(p.labelKey, p.label)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                {t('gradebook.presetsHint', 'Нажмите, чтобы заполнить настройки одним кликом. Затем можно подправить вручную.')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('gradebook.typeLabel', 'Тип оценивания')}
              </label>
              <select
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                value={gradingType}
                onChange={(e) => setGradingType(e.target.value as GradingType)}
              >
                <option value="points">{t('gradebook.typePoints', 'Баллы (Points)')}</option>
                <option value="percent">{t('gradebook.typePercent', 'Проценты (%)')}</option>
                <option value="letter">{t('gradebook.typeLetter', 'Буквенная (A, B, C...)')}</option>
                <option value="pass_fail">{t('gradebook.typePassFail', 'Зачет / Незачет')}</option>
                <option value="custom">{t('gradebook.typeCustom', 'Кастомная')}</option>
              </select>
            </div>

            {(gradingType === 'points' || gradingType === 'percent') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('gradebook.minLabel', 'Минимум')}
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-primary-500"
                    value={minVal}
                    onChange={(e) => setMinVal(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('gradebook.maxLabel', 'Максимум')}
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-primary-500"
                    value={maxVal}
                    onChange={(e) => setMaxVal(Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('gradebook.passThreshold', 'Порог прохождения')}
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-primary-500"
                value={passThreshold}
                onChange={(e) => setPassThreshold(Number(e.target.value))}
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Для баллов и процентов — минимальное значение. Для букв — индекс успешности.
              </p>
            </div>

            {(gradingType === 'letter' || gradingType === 'custom') && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  {t('gradebook.labels', 'Символы и диапазоны')}
                </label>
                {Object.keys(labels).length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-900 p-3 rounded-lg text-center">
                    Нет заданных символов.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(labels).map(([key, desc]) => (
                      <div key={key} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm bg-white dark:bg-slate-700 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">{key}</span>
                          <span className="text-sm text-slate-600 dark:text-slate-400">{desc}</span>
                        </div>
                        <button onClick={() => handleRemoveLabel(key)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline add row */}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder={t('gradebook.labelSymbolPh', 'Символ')}
                    className="w-24 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-primary-500"
                  />
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLabel(); } }}
                    placeholder={t('gradebook.labelDescPh', 'Диапазон или описание (90–100)')}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-primary-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddLabel}
                    disabled={!newKey.trim()}
                    className="shrink-0 p-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('common.add', 'Добавить')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 shrink-0 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            {t('common.cancel', 'Отмена')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {t('common.save', 'Сохранить')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GradeSchemaConfig;
