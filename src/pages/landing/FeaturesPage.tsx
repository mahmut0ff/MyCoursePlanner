import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, GraduationCap, BookOpen, ClipboardList, Radio,
  Brain, BarChart3, Shield, Award, Target, Gamepad2,
  MessageCircle, FileText, Globe, Bot, PenTool, LayoutGrid,
  Building2, Lock, Zap, Layers, Users, Crown,
} from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const FeaturesPage: React.FC = () => {
  const { t } = useTranslation();

  const sections = [
    {
      title: t('landing.catCore'),
      gradient: 'from-blue-500 to-indigo-500',
      items: [
        { icon: Building2, label: t('landing.coreMultiTenant') },
        { icon: Shield, label: t('landing.coreRbac') },
        { icon: Zap, label: t('landing.coreBilling') },
        { icon: Lock, label: t('landing.coreAudit') },
      ],
    },
    {
      title: t('landing.catLearning'),
      gradient: 'from-emerald-500 to-teal-500',
      items: [
        { icon: BookOpen, label: t('landing.learnCourseBuilder') },
        { icon: PenTool, label: t('landing.learnRichEditor') },
        { icon: BarChart3, label: t('landing.learnProgress') },
        { icon: FileText, label: t('landing.learnDiary') },
      ],
    },
    {
      title: t('landing.catExams'),
      gradient: 'from-violet-500 to-purple-500',
      items: [
        { icon: ClipboardList, label: t('landing.examBuilder') },
        { icon: LayoutGrid, label: t('landing.examQuestionTypes') },
        { icon: Radio, label: t('landing.examRooms') },
        { icon: Shield, label: t('landing.examAntiCheat') },
      ],
    },
    {
      title: t('landing.catAi'),
      gradient: 'from-amber-500 to-orange-500',
      items: [
        { icon: Bot, label: t('landing.aiGenerateLessons') },
        { icon: Brain, label: t('landing.aiGenerateTests') },
        { icon: Award, label: t('landing.aiEvaluate') },
      ],
    },
    {
      title: t('landing.catEngagement'),
      gradient: 'from-rose-500 to-pink-500',
      items: [
        { icon: Target, label: t('landing.engXpLevels') },
        { icon: Award, label: t('landing.engBadges') },
        { icon: Crown, label: t('landing.engLeaderboards') },
        { icon: Gamepad2, label: t('landing.engQuiz') },
      ],
    },
    {
      title: t('landing.catCertificates'),
      gradient: 'from-cyan-500 to-blue-500',
      items: [
        { icon: FileText, label: t('landing.certPdf') },
        { icon: Globe, label: t('landing.certQr') },
        { icon: Layers, label: t('landing.certMultilang') },
      ],
    },
    {
      title: t('landing.catComm'),
      gradient: 'from-indigo-500 to-violet-500',
      items: [
        { icon: MessageCircle, label: t('landing.commGroup') },
        { icon: Users, label: t('landing.commDirect') },
        { icon: Radio, label: t('landing.commRealtime') },
      ],
    },
    {
      title: t('landing.catAnalytics'),
      gradient: 'from-slate-500 to-zinc-500',
      items: [
        { icon: BarChart3, label: t('landing.analyticsDashboard') },
        { icon: Users, label: t('landing.analyticsTeacher') },
        { icon: Layers, label: t('landing.analyticsSaas') },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
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
        <div className="max-w-5xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>

          <h1 className="text-4xl font-extrabold mb-3 text-slate-900">{t('landing.featuresPageTitle')}</h1>
          <p className="text-lg text-slate-500 mb-12">{t('landing.featuresPageSubtitle')}</p>

          <div className="space-y-8">
            {sections.map((section, i) => {
              const SectionIcon = section.items[0].icon;
              return (
              <div key={i} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${section.gradient} flex items-center justify-center shadow-lg shadow-slate-200/50`}>
                    <SectionIcon className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">{section.title}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {section.items.map((item, j) => (
                    <div key={j} className="flex items-center gap-3 p-4 bg-white border border-slate-100/80 rounded-2xl hover:border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default group">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <item.icon className="w-5 h-5 text-slate-500 group-hover:text-primary-500 transition-colors" />
                      </div>
                      <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="bg-[#0f172a] text-white py-8 px-6 text-center mt-auto">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} Planula. {t('landing.rights')}</p>
      </footer>
    </div>
  );
};

export default FeaturesPage;
