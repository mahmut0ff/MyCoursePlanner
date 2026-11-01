import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Phone, MessageCircle, Send, Check } from 'lucide-react';
import { LandingNav, LandingFooter, PageHero } from '../../components/landing/LandingChrome';
import { primaryBtn } from '../../components/landing/LandingKit';
import RequestDemoModal from '../../components/landing/RequestDemoModal';

const ContactPage: React.FC = () => {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Backwards-compat: ?demo=1 still auto-opens the request-demo modal.
    if (searchParams.get('demo') === '1') setDemoOpen(true);
  }, [searchParams]);

  const channels = [
    { icon: MessageCircle, label: 'Telegram', value: '@sabakhub_bot', href: 'https://t.me/sabakhub_bot' },
    { icon: Phone, label: t('landing.footerContact'), value: '+996 550 308 078', href: 'tel:+996550308078' },
    { icon: MapPin, label: t('landing.footerCity'), value: t('landing.footerCity'), href: '' },
  ];

  // Filled fields, as on /login: the tint marks the field, a ring appears only on focus.
  const inputClass =
    'w-full rounded-lg border border-transparent bg-slate-100 px-3.5 text-[14px] text-slate-900 placeholder:text-slate-500 transition-colors hover:bg-slate-200/70 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/25 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:hover:bg-slate-700/70 dark:focus:bg-slate-900';
  const labelClass = 'mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300';

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-900 dark:text-slate-100">
      <LandingNav />

      <main>
        <PageHero title={t('landing.contactPageTitle')} subtitle={t('landing.contactPageSubtitle')} />

        <section className="mx-auto grid max-w-[1200px] gap-12 px-4 pb-20 sm:px-8 sm:pb-28 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div className="max-w-[520px]">
            {sent ? (
              <div className="flex items-start gap-3 rounded-lg bg-primary-50 px-4 py-3.5 text-[15px] text-primary-800 dark:bg-primary-500/10 dark:text-primary-200">
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                {t('landing.contactSent')}
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="space-y-4">
                <div>
                  <label htmlFor="contact-name" className={labelClass}>{t('landing.contactName')}</label>
                  <input id="contact-name" type="text" required className={`h-11 ${inputClass}`} placeholder={t('landing.demo.ownerNamePlaceholder', 'Айбек Турсунов')} />
                </div>
                <div>
                  <label htmlFor="contact-email" className={labelClass}>{t('landing.contactEmail')}</label>
                  <input id="contact-email" type="email" required className={`h-11 ${inputClass}`} placeholder="aibek@example.kg" />
                </div>
                <div>
                  <label htmlFor="contact-message" className={labelClass}>{t('landing.contactMessage')}</label>
                  <textarea id="contact-message" required rows={5} className={`min-h-[140px] resize-none py-2.5 ${inputClass}`} placeholder={t('landing.contactPlaceholder', 'Расскажите коротко, чем можем помочь')} />
                </div>
                <button type="submit" className={`${primaryBtn} w-full`}>
                  <Send aria-hidden className="h-4 w-4" />
                  {t('landing.contactSend')}
                </button>
              </form>
            )}
          </div>

          <div>
            <h2 className="text-[15px] font-semibold">{t('landing.contactInfo')}</h2>
            <ul className="mt-5 space-y-5">
              {channels.map((c, i) => {
                const inner = (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
                      <c.icon aria-hidden className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] text-slate-500 dark:text-slate-400">{c.label}</span>
                      <span className="block truncate text-[15px] font-medium transition-colors group-hover:text-primary-600 dark:group-hover:text-primary-400">{c.value}</span>
                    </span>
                  </>
                );
                return (
                  <li key={i}>
                    {c.href ? (
                      <a href={c.href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3.5">{inner}</a>
                    ) : (
                      <div className="flex items-center gap-3.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </main>

      <LandingFooter />
      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

export default ContactPage;
