import React from 'react';
import { useTranslation } from 'react-i18next';
import { LegalLayout, type LegalSection } from '../../components/landing/LandingChrome';

/**
 * Условия использования. Текст пока на русском (основной язык продукта)
 * и носит ознакомительный характер — перед запуском его стоит выверить с юристом.
 */
const TermsPage: React.FC = () => {
  const { t } = useTranslation();

  const sections: LegalSection[] = [
    {
      id: 'acceptance', heading: t('legal.terms.acceptance.heading', 'Принятие условий'),
      body: [
        t('legal.terms.acceptance.p1', 'Используя SabakHub, вы соглашаетесь с настоящими Условиями. Если вы не согласны, пожалуйста, не используйте платформу.'),
        t('legal.terms.acceptance.p2', 'Если вы пользуетесь сервисом от имени организации, вы подтверждаете, что вправе принимать эти условия за неё.'),
      ],
    },
    {
      id: 'service', heading: t('legal.terms.service.heading', 'Описание сервиса'),
      body: [
        t('legal.terms.service.p1', 'SabakHub — платформа для управления учебными центрами: курсы, экзамены, журналы, коммуникация, аналитика и AI-инструменты.'),
        t('legal.terms.service.p2', 'Мы можем добавлять, изменять или отключать отдельные функции, стремясь заранее уведомлять о значимых изменениях.'),
      ],
    },
    {
      id: 'accounts', heading: t('legal.terms.accounts.heading', 'Аккаунты и доступ'),
      body: [
        t('legal.terms.accounts.p1', 'Вы отвечаете за сохранность учётных данных и за действия, совершённые под вашим аккаунтом.'),
        t('legal.terms.accounts.p2', 'Доступ к функциям зависит от вашей роли (администратор, менеджер, преподаватель, студент) и тарифа организации.'),
      ],
    },
    {
      id: 'billing', heading: t('legal.terms.billing.heading', 'Тарифы и оплата'),
      body: [
        t('legal.terms.billing.p1', 'Платные тарифы оплачиваются согласно выбранному плану. Пробный период предоставляется на указанных в приложении условиях.'),
        t('legal.terms.billing.p2', 'При неоплате по окончании пробного или оплаченного периода доступ к платным модулям может быть ограничен.'),
      ],
    },
    {
      id: 'acceptable', heading: t('legal.terms.acceptable.heading', 'Допустимое использование'),
      body: [
        t('legal.terms.acceptable.p1', 'Запрещено загружать незаконный контент, нарушать чужие права, пытаться обойти защиту, перегружать или взламывать сервис.'),
        t('legal.terms.acceptable.p2', 'Запрещено использовать платформу для рассылки спама, вредоносного ПО или несанкционированного сбора данных.'),
      ],
    },
    {
      id: 'content', heading: t('legal.terms.content.heading', 'Контент и интеллектуальная собственность'),
      body: [
        t('legal.terms.content.p1', 'Контент, который вы загружаете, остаётся вашим. Вы предоставляете нам право хранить и обрабатывать его для работы сервиса.'),
        t('legal.terms.content.p2', 'Права на саму платформу, её код, дизайн и бренд SabakHub принадлежат нам.'),
      ],
    },
    {
      id: 'liability', heading: t('legal.terms.liability.heading', 'Ограничение ответственности'),
      body: [
        t('legal.terms.liability.p1', 'Сервис предоставляется «как есть». Мы стремимся к бесперебойной работе, но не гарантируем отсутствие сбоев.'),
        t('legal.terms.liability.p2', 'В пределах, допустимых законом, мы не отвечаем за косвенные убытки, связанные с использованием платформы.'),
      ],
    },
    {
      id: 'termination', heading: t('legal.terms.termination.heading', 'Прекращение'),
      body: [
        t('legal.terms.termination.p1', 'Вы можете прекратить использование в любой момент. Мы можем приостановить доступ при нарушении этих Условий.'),
        t('legal.terms.termination.p2', 'После прекращения данные могут быть удалены по истечении разумного срока хранения.'),
      ],
    },
    {
      id: 'changes', heading: t('legal.terms.changes.heading', 'Изменения условий'),
      body: [
        t('legal.terms.changes.p1', 'Мы можем обновлять эти Условия. Дата последнего обновления указана вверху страницы; о существенных изменениях уведомим заранее.'),
      ],
    },
    {
      id: 'contact', heading: t('legal.terms.contact.heading', 'Контакты'),
      body: [
        t('legal.terms.contact.p1', 'По юридическим вопросам: hello@sabakhub.kg, Telegram @sabakhub_bot, г. Ош, Кыргызстан.'),
      ],
    },
  ];

  return (
    <LegalLayout
      eyebrow={t('landing.legalEyebrow', 'Правовая информация')}
      title={t('landing.footerTerms')}
      updated={t('landing.legalUpdated', 'Последнее обновление: 15 июня 2026')}
      intro={t('landing.termsIntro', 'Пожалуйста, внимательно ознакомьтесь с условиями использования SabakHub перед началом работы с платформой.')}
      sections={sections}
    />
  );
};

export default TermsPage;
