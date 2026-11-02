import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GradeSchema, GradingType } from '../../types';
import { X, Check, Plus, Trash2, Info, AlertCircle } from 'lucide-react';
import { orgSaveGradeSchema } from '../../lib/api';
import { GRADE_PRESETS, detectPreset, schemaChoices, choiceNumericValue, type GradePreset } from '../../lib/gradePresets';
import toast from 'react-hot-toast';

interface GradeSchemaConfigProps {
  courseId: string;
  /** Название курса — шкала сохраняется для него одного, и это должно быть видно. */
  courseTitle?: string;
  schema: GradeSchema | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (schema: GradeSchema) => void;
}


const GradeSchemaConfig: React.FC<GradeSchemaConfigProps> = ({ courseId, courseTitle, schema, isOpen, onClose, onSaved }) => {
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

  const numeric = gradingType === 'points' || gradingType === 'percent';
  const activePresetId = detectPreset({
    gradingType,
    scale: { min: minVal, max: maxVal, labels },
    passThreshold,
  })?.id;

  // Сохранять заведомо сломанную шкалу нельзя: журнал зажимает оценку в
  // [min, max], поэтому перевёрнутый диапазон превращает любой ввод в одно и то
  // же число, а порог вне диапазона делает «сдал/не сдал» недостижимым.
  const rangeError = numeric && maxVal <= minVal;
  const thresholdError = numeric && !rangeError && (passThreshold < minVal || passThreshold > maxVal);

  /** Отметки, из которых преподаватель выбирает в журнале (нечисловые шкалы). */
  const choices = schemaChoices({ gradingType, scale: { min: minVal, max: maxVal, labels }, passThreshold });

  /** Примеры значений для предпросмотра — то, что преподаватель реально увидит. */
  const sampleValues = (): string[] => {
    if (!numeric) return choices;
    if (rangeError) return [];
    const span = maxVal - minVal;
    if (span <= 6) return Array.from({ length: span + 1 }, (_, i) => String(minVal + i));
    return [String(minVal), String(Math.round(minVal + span / 2)), String(maxVal)];
  };
  const samples = sampleValues();

  const previewHint = (): string => {
    if (!numeric)
      return choices.length
        ? t('gradebook.ui.schema.hintChoices', 'Преподаватель выбирает отметку из списка — вписать что-то другое нельзя. В среднем балле отметка считается по числу под ней (из {{max}}).', { max: maxVal })
        : t('gradebook.ui.schema.hintNoChoices', 'Символы не заданы — ячейка останется со свободным вводом. Добавьте варианты ниже, чтобы преподаватель выбирал из списка.');
    if (rangeError) return t('gradebook.ui.schema.hintRangeError', 'Пока диапазон некорректен, предпросмотр недоступен.');
    const unit = gradingType === 'percent' ? '%' : '';
    return t('gradebook.ui.schema.hintNumeric', 'Преподаватель вводит число от {{min}} до {{max}}; выход за границы журнал сам подтянет к ближайшей. Сдано — от {{pass}} и выше.', { min: `${minVal}${unit}`, max: `${maxVal}${unit}`, pass: `${passThreshold}${unit}` });
  };

  const applyPreset = (p: GradePreset) => {
    setGradingType(p.gradingType);
    setMinVal(p.scale.min);
    setMaxVal(p.scale.max);
    setPassThreshold(p.passThreshold);
    setLabels(p.scale.labels || {});
  };

  const handleSave = async () => {
    if (rangeError || thresholdError) return;
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
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[480px] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('gradebook.schemaTitle', 'Шкала оценивания')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('gradebook.schemaSubtitle', 'Настройте систему оценок для этого курса')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center shrink-0 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-2 overflow-y-auto flex-1 space-y-4">

          {/* Куда именно распространяется шкала: курс + оба журнала */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {courseTitle
                ? t('gradebook.ui.schema.scopeCourse', 'Шкала действует для курса «{{course}}» — и в «Оценках», и в журнале у преподавателя: там будут тот же максимум и те же допустимые значения.', { course: courseTitle })
                : t('gradebook.ui.schema.scopeSelected', 'Шкала действует для выбранного курса — и в «Оценках», и в журнале у преподавателя: там будут тот же максимум и те же допустимые значения.')}
            </p>
          </div>

          <div className="space-y-3">
            {/* ── Quick presets ── */}
            <div>
              <label className="label">
                {t('gradebook.presets', 'Готовые шкалы')}
              </label>
              <div className="flex flex-wrap gap-1">
                {GRADE_PRESETS.map((p) => {
                  const isActive = p.id === activePresetId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => applyPreset(p)}
                      className={`flex items-center gap-1 h-7 px-2 text-sm rounded-md transition-colors ${
                        isActive
                          ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {isActive && <Check className="w-3 h-3" />}
                      {t(p.labelKey, p.label)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {activePresetId
                  ? t('gradebook.presetsActiveHint', 'Выбранная шкала подсвечена. Значения ниже можно подправить вручную — тогда подсветка снимется.')
                  : t('gradebook.presetsHint', 'Нажмите, чтобы заполнить настройки одним кликом. Затем можно подправить вручную.')}
              </p>
            </div>

            <div>
              <label className="label">
                {t('gradebook.typeLabel', 'Тип оценивания')}
              </label>
              <select
                className="input w-full"
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    {t('gradebook.minLabel', 'Минимум')}
                  </label>
                  <input
                    type="number"
                    className="input w-full"
                    value={minVal}
                    onChange={(e) => setMinVal(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label">
                    {t('gradebook.maxLabel', 'Максимум')}
                  </label>
                  <input
                    type="number"
                    className="input w-full"
                    value={maxVal}
                    onChange={(e) => setMaxVal(Number(e.target.value))}
                  />
                </div>
                {rangeError && (
                  <p className="col-span-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {t('gradebook.ui.schema.rangeError', 'Максимум должен быть больше минимума.')}
                  </p>
                )}
              </div>
            )}

            {gradingType !== 'pass_fail' && (
              <div>
                <label className="label">
                  {t('gradebook.passThreshold', 'Порог прохождения')}
                </label>
                <input
                  type="number"
                  className={`input w-full ${thresholdError ? '!border-red-400 dark:!border-red-500' : ''}`}
                  value={passThreshold}
                  onChange={(e) => setPassThreshold(Number(e.target.value))}
                />
                {thresholdError ? (
                  <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {t('gradebook.ui.schema.thresholdError', 'Порог должен быть между {{min}} и {{max}}.', { min: minVal, max: maxVal })}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t('gradebook.ui.schema.thresholdHint', 'Для баллов и процентов — минимальное значение. Для букв — индекс успешности.')}
                  </p>
                )}
              </div>
            )}

            {!numeric && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="label">
                  {gradingType === 'pass_fail'
                    ? t('gradebook.choicesPassFail', 'Варианты отметок')
                    : t('gradebook.labels', 'Символы и диапазоны')}
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {t('gradebook.ui.schema.choicesHint', 'Именно из этого списка преподаватель выбирает отметку в журнале.')}
                </p>
                {Object.keys(labels).length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-center">
                    {gradingType === 'pass_fail'
                      ? t('gradebook.ui.schema.noCustomPassFail', 'Свои варианты не заданы — используются «Зачёт» и «Незачёт».')
                      : t('gradebook.ui.schema.noSymbols', 'Нет заданных символов.')}
                  </p>
                ) : (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {Object.entries(labels).map(([key, desc]) => (
                      <div key={key} className="flex items-center justify-between min-h-[40px] px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">{key}</span>
                          <span className="text-sm text-slate-700 dark:text-slate-300">{desc}</span>
                        </div>
                        <button onClick={() => handleRemoveLabel(key)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-500/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline add row */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder={t('gradebook.labelSymbolPh', 'Символ')}
                    className="input w-24"
                  />
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLabel(); } }}
                    placeholder={t('gradebook.labelDescPh', 'Диапазон или описание (90–100)')}
                    className="input flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={handleAddLabel}
                    disabled={!newKey.trim()}
                    className="btn-secondary shrink-0 w-8 !px-0 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    title={t('common.add', 'Добавить')}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Предпросмотр: чем настройка оборачивается в журнале ── */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="h-8 px-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('gradebook.previewTitle', 'Так это увидит преподаватель в журнале')}
              </span>
              {numeric && !rangeError && (
                <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 shrink-0">
                  {t('journal.ui.maxShort', 'М: {{max}}', { max: maxVal })}
                </span>
              )}
            </div>
            <div className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {samples.length > 0 ? (
                  samples.map((v) => {
                    // Для нечисловых отметок сразу показываем, чем они станут в
                    // среднем балле — иначе перевод остаётся скрытой магией.
                    const asNumber = numeric
                      ? null
                      : choiceNumericValue({ gradingType, scale: { min: minVal, max: maxVal, labels }, passThreshold }, v);
                    return (
                      <span
                        key={v}
                        className="min-w-[2.5rem] px-2 py-1 flex flex-col items-center rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      >
                        <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{v}</span>
                        {asNumber !== null && (
                          <span className="text-[11px] text-slate-400 tabular-nums leading-none">= {asNumber}</span>
                        )}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-xs text-slate-400">{t('gradebook.ui.schema.noValues', 'Нет допустимых значений')}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{previewHint()}</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-2 pb-4 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="btn-ghost"
          >
            {t('common.cancel', 'Отмена')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || rangeError || thresholdError}
            className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {t('common.save', 'Сохранить')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GradeSchemaConfig;
