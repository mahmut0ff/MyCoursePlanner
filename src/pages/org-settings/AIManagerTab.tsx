import React, { useEffect, useState } from 'react';
import { Bot, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { apiGetAIManagerSettings, apiUpdateAIManagerSettings } from '../../lib/api';
import type { OrgAIManagerSettings, AIManagerFAQ } from '../../types';
import toast from 'react-hot-toast';

export const AIManagerTab: React.FC<{ organizationId: string }> = ({ organizationId }) => {
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
        toast.error('Не удалось загрузить настройки AI');
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
      toast.success('Настройки AI успешно сохранены');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Ошибка при сохранении настроек AI');
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
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!settings) {
    return <div className="text-center py-12 text-slate-500">Не удалось загрузить настройки AI.</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Status Header ── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${settings.isActive ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Статус AI-ассистента</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {settings.isActive ? 'Активен и отвечает посетителям' : 'В настоящее время отключен на публичном профиле'}
              </p>
            </div>
          </div>
          <button
            onClick={() => update('isActive', !settings.isActive)}
            className={`relative w-12 h-6 rounded-full transition-colors ${settings.isActive ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${settings.isActive ? 'left-[26px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {settings.isActive && (
        <>
          {/* ── Core Instructions ── */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Базовые знания</h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Приветственное сообщение (Начальное сообщение)
              </label>
              <input
                type="text"
                value={settings.greetingMessage || ''}
                onChange={e => update('greetingMessage', e.target.value)}
                className="input"
                placeholder="Здравствуйте! Я ваш AI-ассистент. Чем могу помочь?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Об организации (Обучающие данные)
              </label>
              <textarea
                value={settings.aboutOrganization || ''}
                onChange={e => update('aboutOrganization', e.target.value)}
                className="input min-h-[80px]"
                placeholder="Укажите подробное описание вашей организации: история, миссия, уникальные особенности..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Политика зачисления
                </label>
                <textarea
                  value={settings.enrollmentPolicy || ''}
                  onChange={e => update('enrollmentPolicy', e.target.value)}
                  className="input min-h-[80px]"
                  placeholder="Как студенты могут записаться? Когда открыт набор?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Пользовательские инструкции для AI
                </label>
                <textarea
                  value={settings.customInstructions || ''}
                  onChange={e => update('customInstructions', e.target.value)}
                  className="input min-h-[80px]"
                  placeholder="Например: 'Общайся строго официально' или 'Всегда предлагай скидку'"
                />
              </div>
            </div>
          </div>

          {/* ── FAQ Builder ── */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">Часто задаваемые вопросы (FAQ)</h3>
              <button onClick={addFAQ} className="btn-secondary py-1.5 text-sm flex items-center gap-1">
                <Plus className="w-4 h-4" /> Добавить FAQ
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Добавление FAQ помогает AI-ассистенту отвечать точнее и надежнее в нестандартных ситуациях.
            </p>

            <div className="space-y-3">
              {(!settings.faq || settings.faq.length === 0) ? (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400">
                  Пользовательские FAQ не заданы.
                </div>
              ) : (
                settings.faq.map((item, index) => (
                  <div key={index} className="flex gap-3 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl relative group">
                    <div className="flex-1 space-y-3">
                      <input
                        type="text"
                        value={item.question}
                        onChange={e => updateFAQ(index, 'question', e.target.value)}
                        className="input"
                        placeholder="Вопрос"
                      />
                      <textarea
                        value={item.answer}
                        onChange={e => updateFAQ(index, 'answer', e.target.value)}
                        className="input min-h-[60px]"
                        placeholder="Ответ"
                      />
                    </div>
                    <button
                      onClick={() => removeFAQ(index)}
                      className="text-red-400 hover:text-red-500 self-start p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
      
      {/* ── Save Action ── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить настройки AI
        </button>
      </div>
    </div>
  );
};
