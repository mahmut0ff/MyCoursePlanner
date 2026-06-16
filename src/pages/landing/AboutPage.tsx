import React from 'react';
import { useTranslation } from 'react-i18next';
import { Rocket, GraduationCap, Heart } from 'lucide-react';
import { LandingNav, LandingFooter, LandingCTA, PageHero } from '../../components/landing/LandingChrome';

const AboutPage: React.FC = () => {
  const { t } = useTranslation();

  const values = [
    { icon: Rocket, title: t('landing.aboutMission'), text: t('landing.aboutMissionText') },
    { icon: GraduationCap, title: t('landing.aboutProduct'), text: t('landing.aboutProductText') },
    { icon: Heart, title: t('landing.aboutTeam'), text: t('landing.aboutTeamText') },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <LandingNav />

      <main>
        <PageHero eyebrow={t('landing.navAbout')} title={t('landing.aboutPageTitle')} subtitle={t('landing.aboutPageSubtitle')} />

        <section className="px-6 pb-4">
          <div className="max-w-5xl mx-auto grid gap-5 md:grid-cols-3">
            {values.map((v, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-7 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                  <v.icon className="w-5 h-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{v.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-slate-600">{v.text}</p>
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

export default AboutPage;
