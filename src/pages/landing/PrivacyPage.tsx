import React from 'react';
import { useTranslation } from 'react-i18next';
import { LegalLayout, type LegalSection } from '../../components/landing/LandingChrome';

/**
 * Политика конфиденциальности. Текст пока на русском (основной язык продукта)
 * и носит ознакомительный характер — перед запуском его стоит выверить с юристом
 * и при необходимости вынести в i18n для en/kg.
 */
const PrivacyPage: React.FC = () => {
  const { t } = useTranslation();

  const sections: LegalSection[] = [
    {
      id: 'data', heading: t('legal.privacy.data.heading', 'Какие данные мы собираем'),
      body: [
        t('legal.privacy.data.p1', 'Данные аккаунта: имя, email, роль в организации и, при входе через Google, базовые данные профиля Google.'),
        t('legal.privacy.data.p2', 'Учебные данные: курсы, уроки, домашние задания, результаты экзаменов, посещаемость и оценки, которые вы создаёте или загружаете в платформу.'),
        t('legal.privacy.data.p3', 'Технические данные: IP-адрес, тип устройства и браузера, а также журналы действий, необходимые для безопасности и диагностики.'),
      ],
    },
    {
      id: 'use', heading: t('legal.privacy.use.heading', 'Как мы используем данные'),
      body: [
        t('legal.privacy.use.p1', 'Чтобы предоставлять и поддерживать работу платформы: вход, синхронизация, уведомления, аналитика для вашей организации.'),
        t('legal.privacy.use.p2', 'Чтобы улучшать продукт и обеспечивать безопасность — выявлять сбои, злоупотребления и подозрительную активность.'),
        t('legal.privacy.use.p3', 'Мы не продаём ваши персональные данные и не используем содержимое ваших курсов для рекламы.'),
      ],
    },
    {
      id: 'storage', heading: t('legal.privacy.storage.heading', 'Хранение и защита'),
      body: [
        t('legal.privacy.storage.p1', 'Данные хранятся в инфраструктуре Google Firebase с шифрованием при передаче и хранении.'),
        t('legal.privacy.storage.p2', 'Данные каждой организации логически изолированы; доступ ограничен ролевой моделью (RBAC) и правилами безопасности.'),
        t('legal.privacy.storage.p3', 'Мы храним данные столько, сколько необходимо для работы сервиса или сколько требует закон.'),
      ],
    },
    {
      id: 'sharing', heading: t('legal.privacy.sharing.heading', 'Передача третьим лицам'),
      body: [
        t('legal.privacy.sharing.p1', 'Мы передаём данные только проверенным подрядчикам, которые помогают работе сервиса (хостинг, аналитика, отправка уведомлений), и только в необходимом объёме.'),
        t('legal.privacy.sharing.p2', 'Мы можем раскрыть данные по обоснованному требованию закона.'),
      ],
    },
    {
      id: 'rights', heading: t('legal.privacy.rights.heading', 'Ваши права'),
      body: [
        t('legal.privacy.rights.p1', 'Вы можете запросить доступ к своим данным, их исправление или удаление.'),
        t('legal.privacy.rights.p2', 'Администратор организации управляет учебными данными своих пользователей в рамках платформы.'),
        t('legal.privacy.rights.p3', 'Для запросов по персональным данным напишите нам на hello@sabakhub.kg.'),
      ],
    },
    {
      id: 'cookies', heading: t('legal.privacy.cookies.heading', 'Cookies и хранилище'),
      body: [
        t('legal.privacy.cookies.p1', 'Мы используем cookies и локальное хранилище браузера для авторизации, запоминания настроек и базовой аналитики использования.'),
        t('legal.privacy.cookies.p2', 'Вы можете очистить хранилище в настройках браузера, но часть функций (например, вход) перестанет работать корректно.'),
      ],
    },
    {
      id: 'changes', heading: t('legal.privacy.changes.heading', 'Изменения политики'),
      body: [
        t('legal.privacy.changes.p1', 'Мы можем обновлять эту политику. О существенных изменениях сообщим в приложении или по email, а дату обновления отразим вверху страницы.'),
      ],
    },
    {
      id: 'contact', heading: t('legal.privacy.contact.heading', 'Контакты'),
      body: [
        t('legal.privacy.contact.p1', 'По вопросам конфиденциальности: hello@sabakhub.kg, Telegram @sabakhub_bot, г. Ош, Кыргызстан.'),
      ],
    },
  ];

  return (
    <LegalLayout
      eyebrow={t('landing.legalEyebrow', 'Правовая информация')}
      title={t('landing.footerPrivacy')}
      updated={t('landing.legalUpdated', 'Последнее обновление: 15 июня 2026')}
      intro={t('landing.privacyIntro', 'Мы уважаем вашу приватность. Здесь описано, какие данные SabakHub собирает, как мы их используем и какие у вас есть права.')}
      sections={sections}
    />
  );
};

export default PrivacyPage;
