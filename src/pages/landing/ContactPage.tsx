import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Phone, MessageCircle, Send, CheckCircle2 } from 'lucide-react';
import { LandingNav, LandingFooter, PageHero } from '../../components/landing/LandingChrome';
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
    { icon: MessageCircle, label: 'Telegram', value: '@planula_bot', href: 'https://t.me/planula_bot' },
    { icon: Phone, label: t('landing.footerContact'), value: '+996 550 308 078', href: 'tel:+996550308078' },
    { icon: MapPin, label: t('landing.footerCity'), value: t('landing.footerCity'), href: '' },
  ];

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10';

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <LandingNav />

      <main>
        <PageHero eyebrow={t('landing.footerContact')} title={t('landing.contactPageTitle')} subtitle={t('landing.contactPageSubtitle')} />

        <section className="px-6 pb-4">
          <div className="max-w-5xl mx-auto grid gap-6 lg:grid-cols-5">
            {/* Form */}
            <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              {sent ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">{t('landing.contactSent')}</h3>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('landing.contactName')}</label>
                    <input type="text" required className={inputClass} placeholder="Айбек Турсунов" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('landing.contactEmail')}</label>
                    <input type="email" required className={inputClass} placeholder="aibek@example.kg" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('landing.contactMessage')}</label>
                    <textarea required rows={5} className={`${inputClass} resize-none`} placeholder={t('landing.contactPlaceholder', 'Расскажите коротко, чем можем помочь')} />
                  </div>
                  <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
                    <Send className="w-4 h-4" />
                    {t('landing.contactSend')}
                  </button>
                </form>
              )}
            </div>

            {/* Channels */}
            <div className="lg:col-span-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{t('landing.contactInfo')}</h3>
              <div className="mt-4 space-y-3">
                {channels.map((c, i) => {
                  const inner = (
                    <>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                        <c.icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{c.label}</p>
                        <p className="truncate text-sm font-medium text-slate-800">{c.value}</p>
                      </div>
                    </>
                  );
                  return c.href ? (
                    <a key={i} href={c.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary-200 hover:bg-primary-50/30">{inner}</a>
                  ) : (
                    <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">{inner}</div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <div className="h-16" />
      </main>

      <LandingFooter />
      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

export default ContactPage;
