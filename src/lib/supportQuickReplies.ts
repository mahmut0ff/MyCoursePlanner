/**
 * Canned replies for the support desk.
 *
 * Ids are STABLE — they key the i18n entries in locales/*.json, so renaming one
 * silently drops back to the Russian fallback. `shortcut` is what the operator
 * types after «/»; it is matched against the localized title too, so «/опл» and
 * «/pay» both find the payment template.
 *
 * Deliberately a module constant rather than a Firestore collection: fifteen
 * templates that change a few times a year don't justify a CRUD screen, and
 * keeping them in the locale files means they translate with everything else.
 */
export interface QuickReply {
  id: string;
  shortcut: string;
  /** Russian source text — also the i18n fallback, so an untranslated key still reads correctly. */
  titleRu: string;
  bodyRu: string;
}

export const SUPPORT_QUICK_REPLIES: QuickReply[] = [
  {
    id: 'greeting',
    shortcut: 'привет',
    titleRu: 'Приветствие',
    bodyRu: 'Здравствуйте! Спасибо за обращение в поддержку SabakHub. Уже смотрю ваш вопрос.',
  },
  {
    id: 'inProgress',
    shortcut: 'вработе',
    titleRu: 'Взяли в работу',
    bodyRu: 'Принял обращение в работу. Разбираюсь и вернусь с ответом в ближайшее время.',
  },
  {
    id: 'needDetails',
    shortcut: 'детали',
    titleRu: 'Нужны детали',
    bodyRu: 'Чтобы точнее разобраться, подскажите, пожалуйста:\n1. На какой странице возникает проблема?\n2. Что вы делали перед этим?\n3. Что произошло вместо ожидаемого?',
  },
  {
    id: 'needScreenshot',
    shortcut: 'скрин',
    titleRu: 'Попросить скриншот',
    bodyRu: 'Пришлите, пожалуйста, скриншот или короткое видео экрана — так я увижу проблему вашими глазами и отвечу быстрее. Прикрепить файл можно кнопкой «скрепка» ниже.',
  },
  {
    id: 'reproSteps',
    shortcut: 'шаги',
    titleRu: 'Шаги воспроизведения',
    bodyRu: 'Опишите, пожалуйста, по шагам, что нужно сделать, чтобы ошибка повторилась. Если она появляется не всегда — напишите, как часто.',
  },
  {
    id: 'clearCache',
    shortcut: 'кеш',
    titleRu: 'Очистить кеш',
    bodyRu: 'Попробуйте, пожалуйста, обновить страницу с очисткой кеша: Ctrl + F5 (на Windows) или Cmd + Shift + R (на Mac). Часто это снимает проблему сразу.',
  },
  {
    id: 'tryAnotherBrowser',
    shortcut: 'браузер',
    titleRu: 'Другой браузер',
    bodyRu: 'Проверьте, пожалуйста, повторяется ли проблема в другом браузере или в режиме инкогнито. Это поможет понять, дело в расширениях браузера или в самой платформе.',
  },
  {
    id: 'accessRights',
    shortcut: 'права',
    titleRu: 'Права доступа',
    bodyRu: 'Похоже, дело в правах доступа. Доступы настраиваются владельцем учебного центра в разделе «Команда и роли» — попросите его открыть нужный раздел для вашей роли.',
  },
  {
    id: 'planLimit',
    shortcut: 'тариф',
    titleRu: 'Ограничение тарифа',
    bodyRu: 'Эта возможность доступна на более высоком тарифе. Посмотреть, что входит в каждый план, и перейти на другой можно в разделе «Подписка» в настройках организации.',
  },
  {
    id: 'payment',
    shortcut: 'оплата',
    titleRu: 'Вопрос по оплате',
    bodyRu: 'По оплате и счетам: раздел «Подписка» в настройках организации показывает текущий план, дату списания и историю платежей. Если платёж не отобразился в течение часа — напишите сюда, проверим вручную.',
  },
  {
    id: 'bugAccepted',
    shortcut: 'баг',
    titleRu: 'Баг передан разработчикам',
    bodyRu: 'Подтверждаю: это ошибка на нашей стороне. Передал разработчикам, напишу вам сюда, как только выйдет исправление. Спасибо, что сообщили!',
  },
  {
    id: 'featureRequest',
    shortcut: 'идея',
    titleRu: 'Пожелание принято',
    bodyRu: 'Спасибо за идею — записал её в список пожеланий. Мы приоритизируем доработки по числу запросов, так что ваш голос учтён.',
  },
  {
    id: 'fixed',
    shortcut: 'исправлено',
    titleRu: 'Исправлено',
    bodyRu: 'Исправление уже на проде. Обновите, пожалуйста, страницу (Ctrl + F5) и проверьте — всё должно работать. Напишите, если что-то осталось.',
  },
  {
    id: 'waitingReply',
    shortcut: 'ждём',
    titleRu: 'Ожидаем ответа',
    bodyRu: 'Жду от вас уточнения, чтобы продолжить. Если вопрос уже решился сам — просто напишите, и я закрою обращение.',
  },
  {
    id: 'closing',
    shortcut: 'закрыть',
    titleRu: 'Закрытие обращения',
    bodyRu: 'Рад, что вопрос решён! Закрываю обращение. Если понадобится что-то ещё — пишите в этот же чат, история сохранится.',
  },
];

/**
 * Filter by the text typed after «/». Matches the shortcut, the localized title
 * and the body, so the operator can find a template by any of the three.
 */
export function filterQuickReplies(
  replies: { id: string; shortcut: string; title: string; body: string }[],
  queryText: string,
) {
  const needle = queryText.trim().toLowerCase();
  if (!needle) return replies;
  return replies.filter((r) =>
    r.shortcut.toLowerCase().includes(needle) ||
    r.title.toLowerCase().includes(needle) ||
    r.body.toLowerCase().includes(needle));
}
