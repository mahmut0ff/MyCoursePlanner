import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Mail, MapPin, Phone, MessageCircle, Send, CheckCircle } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const ContactPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />
            <span className="font-bold text-lg">Planula</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user ? (
              <Link to="/dashboard" className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl shadow-lg shadow-primary-500/20 transition-all">{t('nav.dashboard') || 'Dashboard'}</Link>
            ) : (
              <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 transition-colors">{t('auth.login')}</Link>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>

          <h1 className="text-4xl font-extrabold mb-3 text-slate-900">{t('landing.contactPageTitle')}</h1>
          <p className="text-lg text-slate-500 mb-12">{t('landing.contactPageSubtitle')}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Form */}
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm relative overflow-hidden group">
              {sent ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-10 animate-fade-in">
                  <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">{t('landing.contactSent')}</h3>
                  <p className="text-slate-500">We'll get back to you shortly.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t('landing.contactName')}</label>
                    <input type="text" required className="w-full border border-slate-200 rounded-xl px-4 py-3.5 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-all" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t('landing.contactEmail')}</label>
                    <input type="email" required className="w-full border border-slate-200 rounded-xl px-4 py-3.5 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-all" placeholder="john@example.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t('landing.contactMessage')}</label>
                    <textarea required rows={5} className="w-full border border-slate-200 rounded-xl px-4 py-3.5 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-all resize-none" placeholder="How can we help you?" />
                  </div>
                  <button type="submit" className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all">
                    <Send className="w-5 h-5" />
                    {t('landing.contactSend')}
                  </button>
                </form>
              )}
            </div>

            {/* Contact info */}
            <div className="space-y-6 lg:pl-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">{t('landing.contactInfo')}</h3>
              <div className="space-y-4">
                {[
                  { icon: Mail, label: 'support@planula.com', href: 'mailto:support@planula.com', color: 'bg-blue-50 text-blue-600' },
                  { icon: Phone, label: '+996 550 308 078', href: 'tel:+996550308078', color: 'bg-emerald-50 text-emerald-600' },
                  { icon: MessageCircle, label: 'Telegram: @planula_bot', href: 'https://t.me/planula_bot', color: 'bg-sky-50 text-sky-600' },
                  { icon: MapPin, label: t('landing.footerCity'), href: '', color: 'bg-rose-50 text-rose-600' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
                    <div className={`w-12 h-12 ${item.color} rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                      <item.icon className="w-6 h-6" />
                    </div>
                    {item.href ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className="text-slate-700 font-medium hover:text-primary-600 transition-colors">{item.label}</a>
                    ) : (
                      <span className="text-slate-700 font-medium">{item.label}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-[#0f172a] text-white py-8 px-6 text-center mt-auto">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} Planula. {t('landing.rights')}</p>
      </footer>
    </div>
  );
};

export default ContactPage;
