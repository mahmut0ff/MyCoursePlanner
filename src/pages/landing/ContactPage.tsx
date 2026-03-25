import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, GraduationCap, Mail, MapPin, Phone, MessageCircle, Send, CheckCircle } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const ContactPage: React.FC = () => {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center">
              <GraduationCap className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold text-lg">MyCoursePlan</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-4 py-2">{t('auth.login')}</Link>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>

          <h1 className="text-4xl font-extrabold mb-3">{t('landing.contactPageTitle')}</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 mb-12">{t('landing.contactPageSubtitle')}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Form */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-100 dark:border-slate-800">
              {sent ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-lg font-semibold mb-2">{t('landing.contactSent')}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('landing.contactName')}</label>
                    <input type="text" required className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('landing.contactEmail')}</label>
                    <input type="email" required className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('landing.contactMessage')}</label>
                    <textarea required rows={5} className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none" />
                  </div>
                  <button type="submit" className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 transition-colors">
                    <Send className="w-4 h-4" />
                    {t('landing.contactSend')}
                  </button>
                </form>
              )}
            </div>

            {/* Contact info */}
            <div className="space-y-6">
              <h3 className="text-xl font-bold mb-4">{t('landing.contactInfo')}</h3>
              <div className="space-y-4">
                {[
                  { icon: Mail, label: 'info@mycoursePlan.io', href: 'mailto:info@mycoursePlan.io' },
                  { icon: Phone, label: '+996 555 000 000', href: 'tel:+996555000000' },
                  { icon: MessageCircle, label: 'Telegram: @mycoursePlan', href: 'https://t.me/mycoursePlan' },
                  { icon: MapPin, label: t('landing.footerCity'), href: '' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="w-10 h-10 bg-primary-50 dark:bg-primary-500/10 rounded-xl flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    {item.href ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">{item.label}</a>
                    ) : (
                      <span className="text-sm text-slate-600 dark:text-slate-400">{item.label}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-[#0f172a] text-white py-8 px-6 text-center">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} MyCoursePlan. {t('landing.rights')}</p>
      </footer>
    </div>
  );
};

export default ContactPage;
