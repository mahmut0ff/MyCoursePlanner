import React from 'react';
import { useTranslation } from 'react-i18next';
import { Rocket, GraduationCap, Heart } from 'lucide-react';
import { LandingNav, LandingFooter, LandingCTA, PageHero } from '../../components/landing/LandingChrome';
import { Reveal } from '../../components/landing/LandingKit';

const AboutPage: React.FC = () => {
  const { t } = useTranslation();

  const values = [
    { icon: Rocket, title: t('landing.aboutMission'), text: t('landing.aboutMissionText') },
    { icon: GraduationCap, title: t('landing.aboutProduct'), text: t('landing.aboutProductText') },
    { icon: Heart, title: t('landing.aboutTeam'), text: t('landing.aboutTeamText') },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-900 dark:text-slate-100">
      <LandingNav />

      <main>
        <PageHero title={t('landing.aboutPageTitle')} subtitle={t('landing.aboutPageSubtitle')} />

        <section className="bg-slate-50 py-14 sm:py-20 dark:bg-slate-800/40">
          <div className="mx-auto grid max-w-[1200px] gap-x-10 gap-y-10 px-4 sm:px-8 md:grid-cols-3">
            {values.map((v, i) => (
              <Reveal key={i} delay={i * 80}>
                <article className="max-w-[40ch]">
                  <v.icon aria-hidden className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  <h2 className="mt-4 text-[17px] font-semibold">{v.title}</h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{v.text}</p>
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

export default AboutPage;
