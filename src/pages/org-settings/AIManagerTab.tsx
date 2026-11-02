import React, { useEffect, useState } from 'react';
import { Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { apiGetAIManagerSettings, apiUpdateAIManagerSettings } from '../../lib/api';
import type { OrgAIManagerSettings, AIManagerFAQ } from '../../types';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export const AIManagerTab: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<OrgAIManagerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    apiGetAIManagerSettings(organizationId)
      .then((res) => setSettings(res.data))
      .catch((err) => {
        console.error(err);
        toast.error(t('aiManager.loadFailed', 'Не удалось загрузить настройки AI'));
      })
      .finally(() => setLoading(false));
  }, [organizationId]);

  const update = <K extends keyof OrgAIManagerSettings>(key: K, value: OrgAIManagerSettings[K]) => {
    setSettings(s => s ? { ...s, [key]: value } as OrgAIManagerSettings : null);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await apiUpdateAIManagerSettings(settings);
      toast.success(t('aiManager.saved', 'Настройки AI успешно сохранены'));
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('aiManager.saveFailed', 'Ошибка при сохранении настроек AI'));
    } finally {
      setSaving(false);
    }
  };

  const addFAQ = () => {
    if (!settings) return;
    update('faq', [...(settings.faq || []), { question: '', answer: '' }]);
  };

  const updateFAQ = (index: number, key: keyof AIManagerFAQ, value: string) => {
    if (!settings) return;
    const newFaq = [...(settings.faq || [])];
    newFaq[index] = { ...newFaq[index], [key]: value };
    update('faq', newFaq);
  };

  const removeFAQ = (index: number) => {
    if (!settings) return;
    const newFaq = [...(settings.faq || [])];
    newFaq.splice(index, 1);
    update('faq', newFaq);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!settings) {
    return <div className="text-center py-12 text-slate-500">{t('aiManager.loadFailedLong', 'Не удалось загрузить настройки AI.')}</div>;
  }

  return (
    <div className="space-y-4">
      {/* ── On / off ── */}
      <div className="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white" id="ai-assistant-toggle-label">
            {settings.isActive ? t('aiManager.stateOn', 'Ассистент включён') : t('aiManager.stateOff', 'Ассистент выключен')}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {settings.isActive ? t('aiManager.stateOnDesc', 'Отвечает посетителям публичного профиля') : t('aiManager.stateOffDesc', 'Не отвечает — посетители не увидят чат')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!settings.isActive}
          aria-labelledby="ai-assistant-toggle-label"
          onClick={() => update('isActive', !settings.isActive)}
          className={`relative shrink-0 w-8 h-[18px] rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${settings.isActive ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all duration-200 motion-reduce:transition-none ${settings.isActive ? 'left-4' : 'left-0.5'}`} />
        </button>
      </div>

      {settings.isActive && (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* ── Core Instructions ── */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('aiManager.coreKnowledge', 'Базовые знания')}</h3>
            
            <div>
              <label className="label">
                {t('aiManager.greeting', 'Приветственное сообщение (Начальное сообщение)')}
              </label>
              <input
                type="text"
                value={settings.greetingMessage || ''}
                onChange={e => update('greetingMessage', e.target.value)}
                className="input"
                placeholder={t('aiManager.greetingPh', 'Здравствуйте! Я ваш AI-ассистент. Чем могу помочь?')}
              />
            </div>

            <div>
              <label className="label">
                {t('aiManager.about', 'Об организации (Обучающие данные)')}
              </label>
              <textarea
                value={settings.aboutOrganization || ''}
                onChange={e => update('aboutOrganization', e.target.value)}
                className="input min-h-[80px]"
                placeholder={t('aiManager.aboutPh', 'Укажите подробное описание вашей организации: история, миссия, уникальные особенности...')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">
                  {t('aiManager.enrollment', 'Политика зачисления')}
                </label>
                <textarea
                  value={settings.enrollmentPolicy || ''}
                  onChange={e => update('enrollmentPolicy', e.target.value)}
                  className="input min-h-[80px]"
                  placeholder={t('aiManager.enrollmentPh', 'Как студенты могут записаться? Когда открыт набор?')}
                />
              </div>
              <div>
                <label className="label">
                  {t('aiManager.instructions', 'Пользовательские инструкции для AI')}
                </label>
                <textarea
                  value={settings.customInstructions || ''}
                  onChange={e => update('customInstructions', e.target.value)}
                  className="input min-h-[80px]"
                  placeholder={t('aiManager.instructionsPh', "Например: 'Общайся строго официально' или 'Всегда предлагай скидку'")}
                />
              </div>
            </div>
          </div>

          {/* ── FAQ Builder ── */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('aiManager.faqTitle', 'Часто задаваемые вопросы (FAQ)')}</h3>
              <button onClick={addFAQ} className="btn-secondary inline-flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> {t('aiManager.addFaq', 'Добавить FAQ')}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {t('aiManager.faqHint', 'Добавление FAQ помогает AI-ассистенту отвечать точнее и надежнее в нестандартных ситуациях.')}
            </p>

            <div className="space-y-3">
              {(!settings.faq || settings.faq.length === 0) ? (
                <div className="text-center py-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-400">
                  {t('aiManager.faqEmpty', 'Пользовательские FAQ не заданы.')}
                </div>
              ) : (
                settings.faq.map((item, index) => (
                  <div key={index} className="flex gap-2 border border-slate-200 dark:border-slate-700 p-3 rounded-md relative group">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={item.question}
                        onChange={e => updateFAQ(index, 'question', e.target.value)}
                        className="input"
                        placeholder={t('aiManager.question', 'Вопрос')}
                      />
                      <textarea
                        value={item.answer}
                        onChange={e => updateFAQ(index, 'answer', e.target.value)}
                        className="input min-h-[60px]"
                        placeholder={t('aiManager.answer', 'Ответ')}
                      />
                    </div>
                    <button
                      onClick={() => removeFAQ(index)}
                      aria-label={t('common.delete', 'Удалить')}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 self-start opacity-0 group-hover:opacity-100 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* ── Save Action ── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary inline-flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {t('aiManager.save', 'Сохранить настройки AI')}
        </button>
      </div>
    </div>
  );
};
