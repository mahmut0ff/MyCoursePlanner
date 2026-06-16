import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Rocket, BookOpen, ClipboardList, Brain, Gamepad2, Award, MessageCircle, Code, ArrowRight,
} from 'lucide-react';
import { LandingNav, LandingFooter, LandingCTA, PageHero } from '../../components/landing/LandingChrome';

const DocsPage: React.FC = () => {
  const { t } = useTranslation();

  const sections = [
    { icon: Rocket, title: t('landing.docsGettingStarted'), desc: t('landing.docsGettingStartedDesc') },
    { icon: BookOpen, title: t('landing.docsCourses'), desc: t('landing.docsCoursesDesc') },
    { icon: ClipboardList, title: t('landing.docsExams'), desc: t('landing.docsExamsDesc') },
    { icon: Brain, title: t('landing.docsAi'), desc: t('landing.docsAiDesc') },
    { icon: Gamepad2, title: t('landing.docsGamification'), desc: t('landing.docsGamificationDesc') },
    { icon: Award, title: t('landing.docsCertificates'), desc: t('landing.docsCertificatesDesc') },
    { icon: MessageCircle, title: t('landing.docsChat'), desc: t('landing.docsChatDesc') },
    { icon: Code, title: t('landing.docsApi'), desc: t('landing.docsApiDesc') },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <LandingNav />

      <main>
        <PageHero eyebrow={t('landing.navDocs')} title={t('landing.docsPageTitle')} subtitle={t('landing.docsPageSubtitle')} />

        <section className="px-6 pb-4">
          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sections.map((section, i) => (
              <div key={i} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100 transition-colors group-hover:bg-primary-600 group-hover:text-white">
                  <section.icon className="w-5 h-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{section.title}</h3>
                <p className="mt-2 flex-grow text-[0.95rem] leading-relaxed text-slate-600">{section.desc}</p>
                <div className="mt-5 flex items-center gap-1.5 border-t border-slate-100 pt-4 text-sm font-medium text-slate-400">
                  {t('landing.docsComingSoon', 'Скоро')}
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-primary-600" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <LandingCTA />
      </main>

      <LandingFooter />
    </div>
  );
};

export default DocsPage;
