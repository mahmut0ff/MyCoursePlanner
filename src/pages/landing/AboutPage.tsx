import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart, Rocket, GraduationCap } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
      {/* Navbar */}
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
        <div className="max-w-4xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>

          <h1 className="text-4xl font-extrabold mb-3">{t('landing.aboutPageTitle')}</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 mb-12">{t('landing.aboutPageSubtitle')}</p>

          {/* Mission */}
          <div className="bg-gradient-to-br from-primary-50 to-violet-50 dark:from-primary-500/10 dark:to-violet-500/10 rounded-2xl p-8 mb-8 border border-primary-100 dark:border-primary-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold">{t('landing.aboutMission')}</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg">{t('landing.aboutMissionText')}</p>
          </div>

          {/* Product */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 mb-8 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold">{t('landing.aboutProduct')}</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{t('landing.aboutProductText')}</p>
          </div>

          {/* Team */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
                <Heart className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold">{t('landing.aboutTeam')}</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{t('landing.aboutTeamText')}</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-white py-8 px-6 text-center">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} MyCoursePlan. {t('landing.rights')}</p>
      </footer>
    </div>
  );
};

export default AboutPage;
