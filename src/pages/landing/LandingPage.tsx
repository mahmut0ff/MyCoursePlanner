import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import {
 BookOpen, ClipboardList, Radio, Brain, BarChart3,
 Shield, Zap, Check, ArrowRight, ChevronDown,
 Globe, Sparkles, Crown, Menu, X, Users,
 MessageCircle, Mail, MapPin, Phone, Award,
 Layers, Lock, FileText, Target, Gamepad2,
 Bot, PenTool, LayoutGrid, Database, Briefcase,
 CalendarClock, CheckSquare, UploadCloud,
 Laptop, GraduationCap, Building2
} from 'lucide-react';

/* ──────────────────────────────────────────
 MAIN LANDING PAGE
 ────────────────────────────────────────── */
const LandingPage: React.FC = () => {
 const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
 const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
 const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
 const [demoOpen, setDemoOpen] = useState(false);

 /* ── Feature categories ── */
 const featureCategories = [
 {
 id: 'core',
 icon: Briefcase,
 title: t('landing.catCore'),
 items: [
 { icon: Briefcase, label: t('landing.coreMultiTenant') },
 { icon: Shield, label: t('landing.coreRbac') },
 { icon: Zap, label: t('landing.coreBilling') },
 { icon: Lock, label: t('landing.coreAudit') },
 ],
 },
 {
 id: 'learning',
 icon: BookOpen,
 title: t('landing.catLearning'),
 items: [
 { icon: BookOpen, label: t('landing.learnCourseBuilder') },
 { icon: PenTool, label: t('landing.learnRichEditor') },
 { icon: BarChart3, label: t('landing.learnProgress') },
 { icon: FileText, label: t('landing.learnDiary') },
 ],
 },
 {
 id: 'exams',
 icon: ClipboardList,
 title: t('landing.catExams'),
 items: [
 { icon: ClipboardList, label: t('landing.examBuilder') },
 { icon: LayoutGrid, label: t('landing.examQuestionTypes') },
 { icon: Radio, label: t('landing.examRooms') },
 { icon: Shield, label: t('landing.examAntiCheat') },
 ],
 },
 {
 id: 'ai',
 icon: Bot,
 title: t('landing.catAi'),
 items: [
 { icon: Bot, label: t('landing.aiTelegramBot') },
 { icon: PenTool, label: t('landing.aiGenerateLessons') },
 { icon: FileText, label: t('landing.aiGenerateTests') },
 { icon: Sparkles, label: t('landing.aiEvaluate') },
 ],
 },
 {
 id: 'engagement',
 icon: Gamepad2,
 title: t('landing.catEngagement'),
 items: [
 { icon: Target, label: t('landing.engXpLevels') },
 { icon: Award, label: t('landing.engBadges') },
 { icon: Crown, label: t('landing.engLeaderboards') },
 { icon: Gamepad2, label: t('landing.engQuiz') },
 ],
 },
 {
 id: 'certificates',
 icon: FileText,
 title: t('landing.catCertificates'),
 items: [
 { icon: FileText, label: t('landing.certPdf') },
 { icon: Globe, label: t('landing.certQr') },
 { icon: Layers, label: t('landing.certMultilang') },
 ],
 },
 {
 id: 'communication',
 icon: MessageCircle,
 title: t('landing.catComm'),
 items: [
 { icon: MessageCircle, label: t('landing.commGroup') },
 { icon: Users, label: t('landing.commDirect') },
 { icon: Radio, label: t('landing.commRealtime') },
 ],
 },
 {
 id: 'analytics',
 icon: BarChart3,
 title: t('landing.catAnalytics'),
 items: [
 { icon: BarChart3, label: t('landing.analyticsDashboard') },
 { icon: Users, label: t('landing.analyticsTeacher') },
 { icon: Layers, label: t('landing.analyticsSaas') },
 ],
 },
 ];

 /* ── Pricing plans ── */
 const plans = [
 {
 id: 'basic', name: t('landing.planBasic'), price: 1990, popular: false, icon: BookOpen,
 features: [t('landing.planBasicF1'), t('landing.planBasicF2'), t('landing.planBasicF3'), t('landing.planBasicF4')],
 },
 {
 id: 'pro', name: t('landing.planPro'), price: 4990, popular: true, icon: Crown,
 features: [t('landing.planProF1'), t('landing.planProF2'), t('landing.planProF3'), t('landing.planProF4'), t('landing.planProF5')],
 },
 {
 id: 'enterprise', name: t('landing.planEnt'), price: 14900, popular: false, icon: Shield,
 features: [t('landing.planEntF1'), t('landing.planEntF2'), t('landing.planEntF3'), t('landing.planEntF4'), t('landing.planEntF5')],
 },
 ];

 /* ── Target Niches ── */
 const targetNiches = [
  { id: 'it', icon: Laptop, title: t('landing.niche1Title'), desc: t('landing.niche1Desc') },
  { id: 'lang', icon: Globe, title: t('landing.niche2Title'), desc: t('landing.niche2Desc') },
  { id: 'tutor', icon: GraduationCap, title: t('landing.niche3Title'), desc: t('landing.niche3Desc') },
  { id: 'corporate', icon: Building2, title: t('landing.niche4Title'), desc: t('landing.niche4Desc') },
  { id: 'studio', icon: LayoutGrid, title: t('landing.niche5Title'), desc: t('landing.niche5Desc') },
  { id: 'org', icon: Briefcase, title: t('landing.niche6Title'), desc: t('landing.niche6Desc') }
 ];

 /* ── FAQ ── */
 const faqs = [
 { q: t('landing.faq1Q'), a: t('landing.faq1A') },
 { q: t('landing.faq2Q'), a: t('landing.faq2A') },
 { q: t('landing.faq3Q'), a: t('landing.faq3A') },
 { q: t('landing.faq4Q'), a: t('landing.faq4A') },
 { q: t('landing.faq5Q'), a: t('landing.faq5A') },
 ];


 const navItems = [
 { label: t('landing.navFeatures'), href: '#features' },
 { label: t('landing.navPricing'), href: '#pricing' },
 { label: t('landing.navFaq'), href: '#faq' },
 ];

 const navLinks = [
 { label: t('landing.navFeaturesPage'), to: '/features' },
 { label: t('landing.navAbout'), to: '/about' },
 { label: t('landing.navContact'), to: '/contact' },
 ];

 return (
 <div className="min-h-screen bg-white text-slate-900 transition-colors">

 {/* ═══ Navbar ═══ */}
 <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 ">
 <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
 <Link to="/" className="flex items-center gap-2.5">
 <img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />
 <span className="font-bold text-xl tracking-tight">Planula</span>
 </Link>
 <div className="hidden md:flex items-center gap-8">
 {navItems.map(item => (
 <a key={item.href} href={item.href} className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{item.label}</a>
 ))}
 {navLinks.map(item => (
 <Link key={item.to} to={item.to} className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{item.label}</Link>
 ))}
 </div>
 <div className="flex items-center gap-3">
 <LanguageSwitcher />
 {user ? (
            <Link to="/dashboard" className="hidden sm:inline-block text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-primary-500/20">{t('nav.dashboard') || 'Dashboard'}</Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:inline-block text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 transition-colors">{t('auth.login')}</Link>
              <Link to="/register" className="hidden sm:inline-block text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-primary-500/20">{t('landing.heroCta')}</Link>
            </>
          )}
 <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-slate-600 ">
 {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
 </button>
 </div>
 </div>
 {mobileMenuOpen && (
 <div className="md:hidden bg-white border-t border-slate-200 px-6 py-4 space-y-3">
 {navItems.map(item => (
 <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-600 py-2">{item.label}</a>
 ))}
 {navLinks.map(item => (
 <Link key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-600 py-2">{item.label}</Link>
 ))}
 <div className="flex gap-3 pt-2">
 {user ? (
                <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="flex-1 text-center text-sm font-semibold text-white bg-primary-600 rounded-xl py-2.5 shadow-lg shadow-primary-500/20">{t('nav.dashboard') || 'Dashboard'}</Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="flex-1 text-center text-sm font-medium text-slate-600 border border-slate-200 rounded-xl py-2.5">{t('auth.login')}</Link>
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="flex-1 text-center text-sm font-semibold text-white bg-primary-600 rounded-xl py-2.5">{t('landing.heroCta')}</Link>
                </>
              )}
 </div>
 </div>
 )}
 </nav>

 {/* ═══ Hero ═══ */}
 <section className="pt-32 pb-10 px-6 relative overflow-hidden">
 <div className="absolute top-20 left-[-200px] w-[500px] h-[500px] rounded-full bg-primary-100/50 blur-3xl" />
 <div className="absolute bottom-[-100px] right-[-150px] w-[400px] h-[400px] rounded-full bg-violet-100/50 blur-3xl" />

 <div className="max-w-7xl mx-auto relative z-10">
 <div className="text-center max-w-3xl mx-auto">
 <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-50 border border-primary-200 rounded-full text-sm font-medium text-primary-700 mb-6">
 <Sparkles className="w-4 h-4" />
 {t('landing.heroBadge')}
 </div>
 <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6 tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-transparent">
 {t('landing.heroTitle')}
 </h1>
 <p className="text-lg text-slate-500 mb-4 leading-relaxed max-w-2xl mx-auto">
 {t('landing.heroSubtitle')}
 </p>
 <p className="text-sm text-slate-500 mb-10 font-medium tracking-wide">
 {t('landing.heroStack')}
 </p>
 <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
 <Link to={user ? "/dashboard" : "/register"} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3.5 rounded-xl text-base shadow-xl shadow-primary-500/25 hover:shadow-primary-500/40 transition-all flex items-center gap-2 group">
                {user ? (t('nav.dashboard') || 'Dashboard') : t('landing.heroCta')}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
 <button type="button" onClick={() => setDemoOpen(true)} className="text-slate-600 hover:text-slate-900 font-medium px-6 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-2">
 {t('landing.heroDemo')}
 </button>
 </div>
 </div>
 </div>
 </section>



  {/* ═══ AI Features Highlight (Tests) ═══ */}
  <section className="py-24 px-6 relative overflow-hidden bg-slate-900 border-y border-slate-800">
    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[100px] pointer-events-none" />
    <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-[100px] pointer-events-none" />
    
    <div className="max-w-4xl mx-auto relative z-10">
      <div className="flex flex-col gap-10">
        {/* Text Content */}
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-full text-sm font-medium text-primary-300 mb-6">
            <Sparkles className="w-4 h-4" />
            Planula AI
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
            {t('landing.aiSecTitlePre')}<span className="bg-gradient-to-r from-violet-400 to-primary-400 bg-clip-text text-transparent">{t('landing.aiSecTitleHighlight')}</span>
          </h2>
          <p className="text-lg text-slate-400 mb-8 leading-relaxed">
            {t('landing.aiSecSubtitle')}
          </p>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 border border-violet-500/20">
                <Brain className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">{t('landing.aiSecF1Title')}</h3>
                <p className="text-slate-400 leading-relaxed md:text-sm">{t('landing.aiSecF1Desc')}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0 border border-primary-500/20">
                <Check className="w-6 h-6 text-primary-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">{t('landing.aiSecF2Title')}</h3>
                <p className="text-slate-400 leading-relaxed md:text-sm">{t('landing.aiSecF2Desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  {/* ═══ AI Telegram Bot Highlight ═══ */}
  <section className="py-24 px-6 relative overflow-hidden bg-white border-b border-slate-100">
    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/5 rounded-full blur-[100px] pointer-events-none" />
    <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />

    <div className="max-w-4xl mx-auto relative z-10">
      <div className="flex flex-col gap-10">

        {/* Text Content */}
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-50 border border-primary-100 rounded-full text-sm font-medium text-primary-600 mb-6">
            <MessageCircle className="w-4 h-4" />
            {t('landing.tgSecBadge')}
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight">
            {t('landing.tgSecTitle')}
          </h2>
          <p className="text-lg text-slate-500 mb-8 leading-relaxed">
            {t('landing.tgSecSubtitle')}
          </p>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center shrink-0 border border-primary-100">
                <Database className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{t('landing.tgSecF1Title')}</h3>
                <p className="text-slate-500 leading-relaxed md:text-sm">{t('landing.tgSecF1Desc')}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 border border-violet-100">
                <Shield className="w-6 h-6 text-violet-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{t('landing.tgSecF2Title')}</h3>
                <p className="text-slate-500 leading-relaxed md:text-sm">{t('landing.tgSecF2Desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  {/* ═══ Features Grid ═══ */}
 <section id="features" className="py-20 px-6 bg-slate-50 ">
 <div className="max-w-7xl mx-auto">
 <div className="text-center mb-16">
 <h2 className="text-3xl md:text-4xl font-extrabold mb-4">{t('landing.featuresTitle')}</h2>
 <p className="text-lg text-slate-500 max-w-2xl mx-auto">{t('landing.featuresSubtitle')}</p>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
 {featureCategories.map((cat) => (
 <div key={cat.id} className="bg-white rounded-2xl p-6 border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
 <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
 <cat.icon className="w-6 h-6 text-primary-600" />
 </div>
 <h3 className="text-base font-bold mb-3">{cat.title}</h3>
 <ul className="space-y-2">
 {cat.items.map((item, j) => (
 <li key={j} className="flex items-center gap-2 text-sm text-slate-500 ">
 <item.icon className="w-4 h-4 text-slate-400 shrink-0" />
 {item.label}
 </li>
 ))}
 </ul>
 </div>
 ))}
 </div>
 </div>
 </section>

  {/* ═══ Role: For Teachers & Managers ═══ */}
  <section className="py-24 px-6 relative overflow-hidden bg-slate-900 border-y border-slate-800">
    <div className="absolute top-[-100px] right-[-200px] w-[600px] h-[600px] bg-primary-600/20 rounded-full blur-[120px] pointer-events-none" />
    <div className="max-w-4xl mx-auto relative z-10">
      <div className="flex flex-col gap-10">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-full text-sm font-medium text-primary-400 mb-6">
            <Briefcase className="w-4 h-4" />
            {t('landing.teachSecBadge')}
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
            {t('landing.teachSecTitle')}
          </h2>
          <p className="text-lg text-slate-400 mb-10 leading-relaxed">
            {t('landing.teachSecSubtitle')}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50 group hover:border-primary-400/50 transition-colors">
              <CalendarClock className="w-8 h-8 text-primary-400 mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-white font-bold mb-2">{t('landing.teachCard1Title')}</h4>
              <p className="text-sm text-slate-400">{t('landing.teachCard1Desc')}</p>
            </div>
            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50 group hover:border-violet-400/50 transition-colors">
              <CheckSquare className="w-8 h-8 text-violet-400 mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="text-white font-bold mb-2">{t('landing.teachCard2Title')}</h4>
              <p className="text-sm text-slate-400">{t('landing.teachCard2Desc')}</p>
            </div>
            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50 group hover:border-primary-400/50 transition-colors">
               <Database className="w-8 h-8 text-primary-400 mb-4 group-hover:scale-110 transition-transform" />
               <h4 className="text-white font-bold mb-2">{t('landing.teachCard3Title')}</h4>
               <p className="text-sm text-slate-400">{t('landing.teachCard3Desc')}</p>
            </div>
            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50 group hover:border-violet-400/50 transition-colors">
               <Shield className="w-8 h-8 text-violet-400 mb-4 group-hover:scale-110 transition-transform" />
               <h4 className="text-white font-bold mb-2">{t('landing.teachCard4Title')}</h4>
               <p className="text-sm text-slate-400">{t('landing.teachCard4Desc')}</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  {/* ═══ Role: For Students & Parents ═══ */}
  <section className="py-24 px-6 relative overflow-hidden bg-slate-50 border-b border-slate-100">
    <div className="absolute top-[-100px] left-[-200px] w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
    <div className="max-w-4xl mx-auto relative z-10">
      <div className="flex flex-col gap-10">
        
        {/* Text Content */}
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-50 border border-violet-100 rounded-full text-sm font-medium text-violet-600 mb-6 shadow-sm">
            <Gamepad2 className="w-4 h-4" />
            {t('landing.studSecBadge')}
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight">
            {t('landing.studSecTitle')}
          </h2>
          <p className="text-lg text-slate-500 mb-10 leading-relaxed">
            {t('landing.studSecSubtitle')}
          </p>

          <ul className="space-y-6">
            <li className="flex gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 border border-violet-100 group-hover:bg-violet-500 transition-colors">
                <Crown className="w-6 h-6 text-violet-500 group-hover:text-white transition-colors" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 mb-1">{t('landing.studItem1Title')}</h4>
                <p className="text-slate-500 text-sm leading-relaxed">{t('landing.studItem1Desc')}</p>
              </div>
            </li>
            <li className="flex gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 border border-violet-100 group-hover:bg-violet-500 transition-colors">
                <UploadCloud className="w-6 h-6 text-violet-500 group-hover:text-white transition-colors" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 mb-1">{t('landing.studItem2Title')}</h4>
                <p className="text-slate-500 text-sm leading-relaxed">{t('landing.studItem2Desc')}</p>
              </div>
            </li>
            <li className="flex gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 border border-violet-100 group-hover:bg-violet-500 transition-colors">
                <BarChart3 className="w-6 h-6 text-violet-500 group-hover:text-white transition-colors" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 mb-1">{t('landing.studItem3Title')}</h4>
                <p className="text-slate-500 text-sm leading-relaxed">{t('landing.studItem3Desc')}</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  {/* ═══ Who Uses Planula? (Target Niches) ═══ */}
  <section className="py-24 px-6 bg-white">
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-100 border border-slate-200 rounded-full text-sm font-medium text-slate-600 mb-6 shadow-sm">
          <Target className="w-4 h-4" />
          {t('landing.nichesBadge')}
        </div>
        <h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900 leading-tight">{t('landing.nichesTitle')}</h2>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">{t('landing.nichesSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {targetNiches.map((niche) => (
          <div key={niche.id} className="bg-white rounded-3xl p-8 border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-2xl hover:border-slate-200 transition-all hover:-translate-y-1 group relative overflow-hidden cursor-default">
             <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none bg-primary-500" />
             <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 relative z-10 bg-primary-50 border-2 border-white shadow-sm ring-1 ring-slate-100/50 group-hover:scale-110 transition-transform">
               <niche.icon className="w-6 h-6 text-primary-600" />
             </div>
             <h3 className="text-xl font-bold text-slate-900 mb-3 relative z-10">{niche.title}</h3>
             <p className="text-sm text-slate-500 leading-relaxed relative z-10">
               {niche.desc}
             </p>
          </div>
        ))}
      </div>
    </div>
  </section>

 {/* ═══ Pricing ═══ */}
 <section id="pricing" className="py-20 px-6">
 <div className="max-w-7xl mx-auto">
 <div className="text-center mb-16">
 <h2 className="text-3xl md:text-4xl font-extrabold mb-4">{t('landing.pricingTitle')}</h2>
 <p className="text-lg text-slate-500 max-w-2xl mx-auto">{t('landing.pricingSubtitle')}</p>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
 {plans.map((plan) => (
 <div key={plan.id} className={`relative rounded-2xl p-7 border transition-all hover:shadow-xl ${plan.popular ? 'bg-primary-600 border-primary-600 text-white shadow-xl shadow-primary-500/30 scale-[1.02]' : 'bg-white border-slate-200 hover:shadow-slate-200/50 '}`}>
 {plan.popular && (
 <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-bold px-4 py-1 rounded-full shadow-lg">{t('landing.popular')}</div>
 )}
 <div className="flex items-center gap-3 mb-4">
 <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${plan.popular ? 'bg-white/20' : 'bg-slate-100 '}`}>
 <plan.icon className={`w-6 h-6 ${plan.popular ? 'text-white' : 'text-slate-600 '}`} />
 </div>
 <h3 className={`text-lg font-bold ${plan.popular ? 'text-white' : ''}`}>{plan.name}</h3>
 </div>
 <div className="mb-6">
 {plan.price === 0 ? (
 <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : ''}`}>{t('landing.free')}</span>
 ) : (
 <>
 <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : ''}`}>{plan.price.toLocaleString()}</span>
 <span className={`text-sm ${plan.popular ? 'text-white/70' : 'text-slate-400'}`}> {t('landing.currency')}/{t('landing.perMonth')}</span>
 </>
 )}
 </div>
 <ul className="space-y-3 mb-8">
 {plan.features.map((f) => (
 <li key={f} className={`flex items-center gap-2.5 text-sm ${plan.popular ? 'text-white/90' : 'text-slate-600 '}`}>
 <Check className={`w-4 h-4 shrink-0 ${plan.popular ? 'text-emerald-300' : 'text-emerald-500'}`} />
 {f}
 </li>
 ))}
 </ul>
 <Link to="/register" className={`block w-full text-center py-3 rounded-xl font-semibold text-sm transition-all ${plan.popular ? 'bg-white text-primary-700 hover:bg-slate-100' : 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/20'}`}>
 {plan.id === 'basic' ? t('landing.startTrial14') : t('landing.startTrial3')}
 </Link>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* ═══ FAQ ═══ */}
 <section id="faq" className="py-20 px-6 bg-slate-50 ">
 <div className="max-w-3xl mx-auto">
 <div className="text-center mb-16">
 <h2 className="text-3xl md:text-4xl font-extrabold mb-4">{t('landing.faqTitle')}</h2>
 <p className="text-lg text-slate-500 ">{t('landing.faqSubtitle')}</p>
 </div>
 <div className="space-y-3">
 {faqs.map((faq, i) => (
 <div key={i} className="border border-slate-200 rounded-xl overflow-hidden bg-white ">
 <button
 onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
 className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
 >
 <span className="font-semibold text-sm pr-4">{faq.q}</span>
 <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${openFaqIndex === i ? 'rotate-180' : ''}`} />
 </button>
 {openFaqIndex === i && (
 <div className="px-6 pb-4">
 <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
 </div>
 )}
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* ═══ CTA ═══ */}
 <section className="py-20 px-6">
 <div className="max-w-4xl mx-auto text-center bg-gradient-to-br from-primary-600 to-violet-600 rounded-3xl p-12 md:p-16 relative overflow-hidden">
 <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] rounded-full bg-white/10" />
 <div className="absolute bottom-[-60px] left-[-40px] w-[180px] h-[180px] rounded-full bg-white/5" />
 <div className="relative z-10">
 <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">{t('landing.ctaTitle')}</h2>
 <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">{t('landing.ctaSubtitle')}</p>
 <Link to={user ? "/dashboard" : "/register"} className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-8 py-3.5 rounded-xl hover:bg-slate-100 transition-colors shadow-xl group">
              {user ? (t('nav.dashboard') || 'Dashboard') : t('landing.ctaButton')}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
 </div>
 </div>
 </section>

 {/* ═══ Footer ═══ */}
 <footer className="bg-slate-900 text-white pt-16 pb-8 px-6">
 <div className="max-w-7xl mx-auto">
 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-10 mb-12">
 {/* Brand */}
 <div className="md:col-span-1">
 <div className="flex items-center gap-2.5 mb-4">
 <img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />
 <span className="font-bold text-xl tracking-tight">Planula</span>
 </div>
 <p className="text-sm text-slate-400 leading-relaxed mb-4">{t('landing.footerDesc')}</p>
 <div className="flex gap-3">
 <a href="https://t.me/planula_bot" target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-primary-600 transition-colors">
 <MessageCircle className="w-4 h-4" />
 </a>
 <a href="mailto:support@planula.com" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-primary-600 transition-colors">
 <Mail className="w-4 h-4" />
 </a>
 </div>
 </div>
 {/* Product */}
 <div>
 <h4 className="font-semibold text-sm mb-4">{t('landing.footerProduct')}</h4>
 <ul className="space-y-2.5">
 <li><Link to="/features" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.navFeatures')}</Link></li>
 <li><a href="#pricing" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.navPricing')}</a></li>
 <li><Link to="/docs" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.navDocs')}</Link></li>
 </ul>
 </div>
 {/* Company */}
 <div>
 <h4 className="font-semibold text-sm mb-4">{t('landing.footerCompany')}</h4>
 <ul className="space-y-2.5">
 <li><Link to="/about" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.footerAbout')}</Link></li>
 <li><Link to="/contact" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.footerContactLink')}</Link></li>
 </ul>
 </div>
 {/* Resources */}
 <div>
 <h4 className="font-semibold text-sm mb-4">{t('landing.footerResources')}</h4>
 <ul className="space-y-2.5">
 <li><Link to="/docs" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.navDocs')}</Link></li>
 <li><Link to="/vibecoder" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.footerVibecoder')}</Link></li>
 <li><a href="#faq" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.navFaq')}</a></li>
 </ul>
 </div>
 {/* Contact */}
 <div>
 <h4 className="font-semibold text-sm mb-4">{t('landing.footerContact')}</h4>
 <ul className="space-y-2.5">
 <li className="flex items-center gap-2 text-sm text-slate-400"><Mail className="w-4 h-4 shrink-0" /> support@planula.com</li>
 <li className="flex items-center gap-2 text-sm text-slate-400"><Phone className="w-4 h-4 shrink-0" /> +996 550 308 078</li>
 <li className="flex items-center gap-2 text-sm text-slate-400"><MapPin className="w-4 h-4 shrink-0" /> {t('landing.footerCity')}</li>
 </ul>
 </div>
 </div>
 {/* Legal */}
 <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-6">
 <p className="text-sm text-slate-500 text-center md:text-left">&copy; {new Date().getFullYear()} Planula. {t('landing.rights')}</p>
 <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
 <Link to="/privacy" className="text-sm text-slate-500 hover:text-white transition-colors text-center">{t('landing.footerPrivacy')}</Link>
 <Link to="/terms" className="text-sm text-slate-500 hover:text-white transition-colors text-center">{t('landing.footerTerms')}</Link>
 <LanguageSwitcher />
 </div>
 </div>
 </div>
 </footer>

 <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
 </div>
 );
};

export default LandingPage;
