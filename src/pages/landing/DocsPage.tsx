import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft, GraduationCap, Rocket, BookOpen, ClipboardList,
  Brain, Gamepad2, Award, MessageCircle, Code, ArrowRight,
} from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const DocsPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();

  const sections = [
    { icon: Rocket, title: t('landing.docsGettingStarted'), desc: t('landing.docsGettingStartedDesc'), color: 'bg-blue-500' },
    { icon: BookOpen, title: t('landing.docsCourses'), desc: t('landing.docsCoursesDesc'), color: 'bg-emerald-500' },
    { icon: ClipboardList, title: t('landing.docsExams'), desc: t('landing.docsExamsDesc'), color: 'bg-violet-500' },
    { icon: Brain, title: t('landing.docsAi'), desc: t('landing.docsAiDesc'), color: 'bg-amber-500' },
    { icon: Gamepad2, title: t('landing.docsGamification'), desc: t('landing.docsGamificationDesc'), color: 'bg-rose-500' },
    { icon: Award, title: t('landing.docsCertificates'), desc: t('landing.docsCertificatesDesc'), color: 'bg-cyan-500' },
    { icon: MessageCircle, title: t('landing.docsChat'), desc: t('landing.docsChatDesc'), color: 'bg-indigo-500' },
    { icon: Code, title: t('landing.docsApi'), desc: t('landing.docsApiDesc'), color: 'bg-slate-500' },
  ];

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
            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 transition-colors">{t('auth.login')}</Link>
            <Link to="/register" className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl shadow-lg shadow-primary-500/20 transition-all">{t('landing.heroCta')}</Link>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>

          <h1 className="text-4xl font-extrabold mb-3 text-slate-900">{t('landing.docsPageTitle')}</h1>
          <p className="text-lg text-slate-500 mb-12">{t('landing.docsPageSubtitle')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sections.map((section, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer flex flex-col h-full">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${section.color} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
                    <section.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{section.title}</h3>
                </div>
                <p className="text-slate-600 leading-relaxed mb-6 flex-grow">{section.desc}</p>
                <div className="pt-4 border-t border-slate-100 flex items-center text-sm font-medium text-primary-600 group-hover:text-primary-700 transition-colors">
                  Coming soon
                  <ArrowRight className="w-4 h-4 ml-1.5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="bg-[#0f172a] text-white py-8 px-6 text-center mt-auto">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} Planula. {t('landing.rights')}</p>
      </footer>
    </div>
  );
};

export default DocsPage;
