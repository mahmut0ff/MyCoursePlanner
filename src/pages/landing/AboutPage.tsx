import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart, Rocket, GraduationCap } from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center shrink-0">
              <GraduationCap className="w-4.5 h-4.5 text-white" />
            </div>
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
        <div className="max-w-4xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>

          <h1 className="text-4xl font-extrabold mb-3 text-slate-900">{t('landing.aboutPageTitle')}</h1>
          <p className="text-lg text-slate-500 mb-12">{t('landing.aboutPageSubtitle')}</p>

          <div className="space-y-8">
            {/* Mission */}
            <div className="bg-gradient-to-br from-primary-50 to-violet-50 rounded-3xl p-8 md:p-10 border border-primary-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/40 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none transition-transform group-hover:scale-110" />
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/20">
                    <Rocket className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">{t('landing.aboutMission')}</h2>
                </div>
                <p className="text-slate-700 text-lg leading-relaxed">{t('landing.aboutMissionText')}</p>
              </div>
            </div>

            {/* Product */}
            <div className="bg-white rounded-3xl p-8 md:p-10 border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-600/20 group-hover:scale-110 transition-transform">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{t('landing.aboutProduct')}</h2>
              </div>
              <p className="text-slate-600 text-lg leading-relaxed">{t('landing.aboutProductText')}</p>
            </div>

            {/* Team */}
            <div className="bg-white rounded-3xl p-8 md:p-10 border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20 group-hover:scale-110 transition-transform">
                  <Heart className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{t('landing.aboutTeam')}</h2>
              </div>
              <p className="text-slate-600 text-lg leading-relaxed">{t('landing.aboutTeamText')}</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-white py-8 px-6 text-center mt-auto">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} Planula. {t('landing.rights')}</p>
      </footer>
    </div>
  );
};

export default AboutPage;
