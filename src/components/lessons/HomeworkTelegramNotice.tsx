import React from 'react';
import { Send, FileText, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

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
  { icon: Send, text: 'Откройте бота и нажмите /dz' },
  { icon: FileText, text: 'Выберите задание из списка' },
  { icon: ImageIcon, text: 'Пришлите ответ: текстом, фото или файлом' },
  { icon: CheckCircle2, text: 'Бот подтвердит — преподаватель увидит работу' },
];

export const HomeworkTelegramNotice: React.FC<Props> = ({ compact = false }) => {
  if (compact) {
    return (
      <a
        href={BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-semibold text-sm transition-colors"
      >
        <Send className="w-4 h-4" />
        Сдать в Telegram
      </a>
    );
  }

  return (
    <div className="relative overflow-hidden bg-white dark:bg-slate-900 border-2 border-sky-200/70 dark:border-sky-700/40 rounded-2xl p-6 shadow-xl shadow-sky-100/30 dark:shadow-black/20">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-400" />

      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 bg-sky-100 dark:bg-sky-900/30 rounded-xl">
          <Send className="w-6 h-6 text-sky-500" />
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
            Домашние задания сдаются в Telegram
          </h3>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            Здесь работу больше не загрузить — бот принимает текст, фото и файлы
          </p>
        </div>
      </div>

      <ol className="space-y-2.5 mb-6">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <span className="shrink-0 w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
              <Icon className="w-3.5 h-3.5" />
            </span>
            {text}
          </li>
        ))}
      </ol>

      <a
        href={BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-semibold text-sm transition-colors"
      >
        <Send className="w-4 h-4" />
        Открыть бота и сдать ДЗ
      </a>
    </div>
  );
};

export default HomeworkTelegramNotice;
