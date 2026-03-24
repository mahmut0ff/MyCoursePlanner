import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import {
  BookOpen, ClipboardList, Radio, Brain, BarChart3,
  Shield, Zap, Check, ArrowRight, Star, ChevronRight, ChevronDown,
  Globe, Sparkles, Crown, Menu, X, Users, Play,
  MessageCircle, Mail, MapPin, Phone,
} from 'lucide-react';

/* ────────────────────────────────────────────────
   CSS-based dashboard mockup component (hero)
   ──────────────────────────────────────────────── */
const DashboardMockup: React.FC = () => (
  <div className="relative mx-auto max-w-4xl mt-16 rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-300/40 overflow-hidden">
    {/* Browser chrome */}
    <div className="h-8 bg-slate-100 border-b border-slate-200 flex items-center px-4 gap-2">
      <div className="w-3 h-3 rounded-full bg-red-400" />
      <div className="w-3 h-3 rounded-full bg-amber-400" />
      <div className="w-3 h-3 rounded-full bg-emerald-400" />
      <div className="flex-1 mx-8">
        <div className="h-4 bg-white rounded-md border border-slate-200 mx-auto max-w-xs flex items-center px-2">
          <span className="text-[9px] text-slate-400 truncate">app.planula.io/dashboard</span>
        </div>
      </div>
    </div>
    <div className="flex">
      {/* Mini sidebar */}
      <div className="w-40 bg-[#0f172a] p-3 hidden sm:block">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-lg bg-primary-600" />
          <span className="text-[10px] font-bold text-white">Planula</span>
        </div>
        {['Dashboard', 'Lessons', 'Exams', 'Rooms', 'Students', 'Analytics'].map((item, i) => (
          <div key={item} className={`flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5 ${i === 0 ? 'bg-white/10' : ''}`}>
            <div className={`w-3 h-3 rounded-sm ${i === 0 ? 'bg-primary-400' : 'bg-slate-600'}`} />
            <span className={`text-[9px] ${i === 0 ? 'text-white' : 'text-slate-500'}`}>{item}</span>
          </div>
        ))}
      </div>
      {/* Main content */}
      <div className="flex-1 p-4 bg-slate-50 min-h-[220px]">
        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Students', value: '1,247', color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Exams', value: '24', color: 'text-violet-600', bg: 'bg-violet-50' },
            { label: 'Pass Rate', value: '87%', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Lessons', value: '156', color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map((m) => (
            <div key={m.label} className={`${m.bg} rounded-lg p-2`}>
              <p className={`text-lg font-extrabold ${m.color}`}>{m.value}</p>
              <p className="text-[9px] text-slate-500">{m.label}</p>
            </div>
          ))}
        </div>
        {/* Chart placeholder */}
        <div className="bg-white rounded-lg border border-slate-100 p-3">
          <p className="text-[9px] font-semibold text-slate-700 mb-2">Performance Trend</p>
          <div className="flex items-end gap-1.5 h-16">
            {[40, 55, 45, 70, 65, 80, 75, 90, 85, 95, 88, 92].map((h, i) => (
              <div key={i} className="flex-1 bg-primary-500/80 rounded-t-sm" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ────────────────────────────────────────────────
   Main Landing Page
   ──────────────────────────────────────────────── */
const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const features = [
    { icon: BookOpen, title: t('landing.feat1Title'), desc: t('landing.feat1Desc'), color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { icon: ClipboardList, title: t('landing.feat2Title'), desc: t('landing.feat2Desc'), color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { icon: Radio, title: t('landing.feat3Title'), desc: t('landing.feat3Desc'), color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { icon: Brain, title: t('landing.feat4Title'), desc: t('landing.feat4Desc'), color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { icon: BarChart3, title: t('landing.feat5Title'), desc: t('landing.feat5Desc'), color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { icon: Globe, title: t('landing.feat6Title'), desc: t('landing.feat6Desc'), color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  ];

  const plans = [
    {
      id: 'free', name: t('landing.planFree'), price: 0, popular: false, icon: Zap,
      features: [t('landing.planFreeF1'), t('landing.planFreeF2'), t('landing.planFreeF3'), t('landing.planFreeF4')],
    },
    {
      id: 'professional', name: t('landing.planPro'), price: 2990, popular: true, icon: Crown,
      features: [t('landing.planProF1'), t('landing.planProF2'), t('landing.planProF3'), t('landing.planProF4'), t('landing.planProF5')],
    },
    {
      id: 'enterprise', name: t('landing.planEnt'), price: 7990, popular: false, icon: Shield,
      features: [t('landing.planEntF1'), t('landing.planEntF2'), t('landing.planEntF3'), t('landing.planEntF4'), t('landing.planEntF5')],
    },
  ];

  const steps = [
    { icon: Users, title: t('landing.step1Title'), desc: t('landing.step1Desc') },
    { icon: BookOpen, title: t('landing.step2Title'), desc: t('landing.step2Desc') },
    { icon: Play, title: t('landing.step3Title'), desc: t('landing.step3Desc') },
  ];

  const testimonials = [
    { name: t('landing.test1Name'), role: t('landing.test1Role'), text: t('landing.test1Text'), rating: 5 },
    { name: t('landing.test2Name'), role: t('landing.test2Role'), text: t('landing.test2Text'), rating: 4 },
    { name: t('landing.test3Name'), role: t('landing.test3Role'), text: t('landing.test3Text'), rating: 5 },
  ];

  const faqs = [
    { q: t('landing.faq1Q'), a: t('landing.faq1A') },
    { q: t('landing.faq2Q'), a: t('landing.faq2A') },
    { q: t('landing.faq3Q'), a: t('landing.faq3A') },
    { q: t('landing.faq4Q'), a: t('landing.faq4A') },
    { q: t('landing.faq5Q'), a: t('landing.faq5A') },
  ];

  const stats = [
    { value: '500+', label: t('landing.statOrgs') },
    { value: '15K+', label: t('landing.statStudents') },
    { value: '50K+', label: t('landing.statExams') },
    { value: '99.9%', label: t('landing.statUptime') },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* ═══ Navbar ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/icons/logo.png" alt="Planula" className="h-9 w-auto object-contain" />
            <span className="font-bold text-lg text-slate-900">Planula</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{t('landing.navFeatures')}</a>
            <a href="#how-it-works" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{t('landing.navHowItWorks')}</a>
            <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{t('landing.navPricing')}</a>
            <a href="#faq" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{t('landing.navFaq')}</a>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/login" className="hidden sm:inline-block text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 transition-colors">{t('auth.login')}</Link>
            <Link to="/register" className="hidden sm:inline-block text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-primary-500/20">{t('auth.register')}</Link>
            {/* Mobile menu toggle */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-slate-600 hover:text-slate-900">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 px-6 py-4 space-y-3">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-600 py-2">{t('landing.navFeatures')}</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-600 py-2">{t('landing.navHowItWorks')}</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-600 py-2">{t('landing.navPricing')}</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-600 py-2">{t('landing.navFaq')}</a>
            <div className="flex gap-3 pt-2">
              <Link to="/login" className="flex-1 text-center text-sm font-medium text-slate-600 border border-slate-200 rounded-xl py-2.5">{t('auth.login')}</Link>
              <Link to="/register" className="flex-1 text-center text-sm font-semibold text-white bg-primary-600 rounded-xl py-2.5">{t('auth.register')}</Link>
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
            <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 leading-tight mb-6 tracking-tight">
              {t('landing.heroTitle')}
            </h1>
            <p className="text-lg text-slate-500 mb-10 leading-relaxed max-w-2xl mx-auto">
              {t('landing.heroSubtitle')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register" className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3.5 rounded-xl text-base shadow-xl shadow-primary-500/25 hover:shadow-primary-500/40 transition-all flex items-center gap-2 group">
                {t('landing.heroCta')}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a href="#how-it-works" className="text-slate-600 hover:text-slate-900 font-medium px-6 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-2">
                {t('landing.heroSecondary')}
              </a>
            </div>
          </div>

          {/* Dashboard Mockup */}
          <DashboardMockup />
        </div>
      </section>

      {/* ═══ Stats ═══ */}
      <section className="py-12 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-3xl font-extrabold text-slate-900">{s.value}</p>
              <p className="text-sm text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ How It Works ═══ */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">{t('landing.howItWorksTitle')}</h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">{t('landing.howItWorksSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="text-center relative">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-primary-300 to-primary-100" />
                )}
                <div className="relative z-10">
                  <div className="w-24 h-24 mx-auto bg-primary-50 rounded-3xl flex items-center justify-center mb-5 border-2 border-primary-100">
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg">
                      {i + 1}
                    </div>
                    <step.icon className="w-10 h-10 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Features ═══ */}
      <section id="features" className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">{t('landing.featuresTitle')}</h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">{t('landing.featuresSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
                <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon className={`w-6 h-6 ${f.color}`} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Pricing ═══ */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">{t('landing.pricingTitle')}</h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">{t('landing.pricingSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div key={plan.id} className={`relative rounded-2xl p-7 border transition-all hover:shadow-xl ${plan.popular ? 'bg-primary-600 border-primary-600 text-white shadow-xl shadow-primary-500/30 scale-[1.02]' : 'bg-white border-slate-200 hover:shadow-slate-200/50'}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-bold px-4 py-1 rounded-full shadow-lg">{t('landing.popular')}</div>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.popular ? 'bg-white/20' : 'bg-slate-100'}`}>
                    <plan.icon className={`w-5 h-5 ${plan.popular ? 'text-white' : 'text-slate-600'}`} />
                  </div>
                  <h3 className={`text-lg font-bold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>{plan.name}</h3>
                </div>
                <div className="mb-6">
                  {plan.price === 0 ? (
                    <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>{t('landing.free')}</span>
                  ) : (
                    <>
                      <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>{plan.price.toLocaleString()}</span>
                      <span className={`text-sm ${plan.popular ? 'text-white/70' : 'text-slate-400'}`}> {t('landing.currency')}/{t('landing.perMonth')}</span>
                    </>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2.5 text-sm ${plan.popular ? 'text-white/90' : 'text-slate-600'}`}>
                      <Check className={`w-4 h-4 shrink-0 ${plan.popular ? 'text-emerald-300' : 'text-emerald-500'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/register" className={`block w-full text-center py-3 rounded-xl font-semibold text-sm transition-all ${plan.popular ? 'bg-white text-primary-700 hover:bg-slate-100' : 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/20'}`}>
                  {plan.price === 0 ? t('landing.startFree') : t('landing.startTrial')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Testimonials ═══ */}
      <section id="testimonials" className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">{t('landing.reviewsTitle')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((rev, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className={`w-4 h-4 ${j < rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'}`} />
                  ))}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">"{rev.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-500/10 rounded-full flex items-center justify-center text-sm font-bold text-primary-600">
                    {rev.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{rev.name}</p>
                    <p className="text-xs text-slate-400">{rev.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">{t('landing.faqTitle')}</h2>
            <p className="text-lg text-slate-500">{t('landing.faqSubtitle')}</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="font-semibold text-slate-900 text-sm pr-4">{faq.q}</span>
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
        <div className="max-w-4xl mx-auto text-center bg-primary-600 rounded-3xl p-12 md:p-16 relative overflow-hidden">
          <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] rounded-full bg-white/10" />
          <div className="absolute bottom-[-60px] left-[-40px] w-[180px] h-[180px] rounded-full bg-white/5" />
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">{t('landing.ctaTitle')}</h2>
            <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">{t('landing.ctaSubtitle')}</p>
            <Link to="/register" className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-8 py-3.5 rounded-xl hover:bg-slate-100 transition-colors shadow-xl group">
              {t('landing.ctaButton')}
              <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="bg-[#0f172a] text-white pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />
                <span className="font-bold text-lg">Planula</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">{t('landing.footerDesc')}</p>
              <div className="flex gap-3">
                <a href="https://t.me/planula" target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-primary-600 transition-colors">
                  <MessageCircle className="w-4 h-4" />
                </a>
                <a href="mailto:info@planula.io" className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-primary-600 transition-colors">
                  <Mail className="w-4 h-4" />
                </a>
              </div>
            </div>
            {/* Product */}
            <div>
              <h4 className="font-semibold text-sm mb-4">{t('landing.footerProduct')}</h4>
              <ul className="space-y-2.5">
                <li><a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.navFeatures')}</a></li>
                <li><a href="#pricing" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.navPricing')}</a></li>
                <li><a href="#faq" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.navFaq')}</a></li>
              </ul>
            </div>
            {/* Company */}
            <div>
              <h4 className="font-semibold text-sm mb-4">{t('landing.footerCompany')}</h4>
              <ul className="space-y-2.5">
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.footerAbout')}</a></li>
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.footerPrivacy')}</a></li>
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">{t('landing.footerTerms')}</a></li>
              </ul>
            </div>
            {/* Contact */}
            <div>
              <h4 className="font-semibold text-sm mb-4">{t('landing.footerContact')}</h4>
              <ul className="space-y-2.5">
                <li className="flex items-center gap-2 text-sm text-slate-400">
                  <Mail className="w-4 h-4 shrink-0" /> info@planula.io
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-400">
                  <Phone className="w-4 h-4 shrink-0" /> +996 555 000 000
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-400">
                  <MapPin className="w-4 h-4 shrink-0" /> {t('landing.footerCity')}
                </li>
              </ul>
            </div>
          </div>
          {/* Bottom */}
          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">© {new Date().getFullYear()} Planula. {t('landing.rights')}</p>
            <LanguageSwitcher />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
