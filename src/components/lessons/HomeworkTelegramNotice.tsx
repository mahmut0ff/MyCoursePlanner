import React from 'react';
import { Send, FileText, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Сдача домашних заданий переехала в Telegram: ученики центра не пользуются
 * веб-версией, и форма загрузки здесь только вводила бы в заблуждение — работа,
 * отправленная «не туда», выглядит сданной, но преподаватель её не ждёт.
 *
 * Показывается везде, где раньше стояла форма сдачи.
 */
const BOT_URL = 'https://t.me/sabakhub_bot';

interface Props {
  /** Компактный вид — для списка заданий, где карточек много. */
  compact?: boolean;
}

const steps = [
  { icon: Send, key: 'homework.tg.step1', text: 'Откройте бота и нажмите /dz' },
  { icon: FileText, key: 'homework.tg.step2', text: 'Выберите задание из списка' },
  { icon: ImageIcon, key: 'homework.tg.step3', text: 'Пришлите ответ: текстом, фото или файлом' },
  { icon: CheckCircle2, key: 'homework.tg.step4', text: 'Бот подтвердит — преподаватель увидит работу' },
];

export const HomeworkTelegramNotice: React.FC<Props> = ({ compact = false }) => {
  const { t } = useTranslation();
  if (compact) {
    return (
      <a
        href={BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 h-8 px-3 bg-sky-500 hover:bg-sky-600 text-white rounded-md font-medium text-sm transition-colors"
      >
        <Send className="w-3.5 h-3.5" />
        {t('homework.tg.submitCompact', 'Сдать в Telegram')}
      </a>
    );
  }

  return (
    <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
      <div className="flex items-start gap-2 mb-3">
        <Send className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-1" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('homework.tg.title', 'Домашние задания сдаются в Telegram')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('homework.tg.desc', 'Здесь работу больше не загрузить — бот принимает текст, фото и файлы')}
          </p>
        </div>
      </div>

      <ol className="space-y-2 mb-4">
        {steps.map(({ icon: Icon, key, text }, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="shrink-0 w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <Icon className="w-3.5 h-3.5" />
            </span>
            {t(key, text)}
          </li>
        ))}
      </ol>

      <a
        href={BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-1.5 h-8 px-3 bg-sky-500 hover:bg-sky-600 text-white rounded-md font-medium text-sm transition-colors"
      >
        <Send className="w-3.5 h-3.5" />
        {t('homework.tg.openBot', 'Открыть бота и сдать ДЗ')}
      </a>
    </div>
  );
};

export default HomeworkTelegramNotice;
