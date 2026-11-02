import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Rocket, BookOpen, ClipboardList, Brain, Gamepad2, Award, MessageCircle, Code,
} from 'lucide-react';
import { LandingNav, LandingFooter, LandingCTA, PageHero } from '../../components/landing/LandingChrome';
import { Reveal } from '../../components/landing/LandingKit';

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
    <div className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-900 dark:text-slate-100">
      <LandingNav />

      <main>
        <PageHero title={t('landing.docsPageTitle')} subtitle={t('landing.docsPageSubtitle')} />

        <section className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {sections.map((s, i) => (
              <Reveal key={i} delay={(i % 4) * 70}>
                <article>
                  <s.icon aria-hidden className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  <h2 className="mt-4 flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                    {s.title}
                    <span className="inline-flex h-5 items-center rounded bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {t('landing.docsComingSoon', 'Скоро')}
                    </span>
                  </h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{s.desc}</p>
                </article>
              </Reveal>
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
