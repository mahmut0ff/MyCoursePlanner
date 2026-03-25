import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, GraduationCap, Rocket, BookOpen, ClipboardList,
  Brain, Gamepad2, Award, MessageCircle, Code, ArrowRight,
} from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const DocsPage: React.FC = () => {
  const { t } = useTranslation();

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
            <Link to="/register" className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl shadow-lg shadow-primary-500/20">{t('landing.heroCta')}</Link>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>

          <h1 className="text-4xl font-extrabold mb-3">{t('landing.docsPageTitle')}</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 mb-12">{t('landing.docsPageSubtitle')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {sections.map((section, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 hover:shadow-lg transition-shadow group cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${section.color} flex items-center justify-center`}>
                    <section.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold">{section.title}</h3>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{section.desc}</p>
                <span className="text-sm text-primary-600 dark:text-primary-400 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Coming soon <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="bg-[#0f172a] text-white py-8 px-6 text-center">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} MyCoursePlan. {t('landing.rights')}</p>
      </footer>
    </div>
  );
};

export default DocsPage;
