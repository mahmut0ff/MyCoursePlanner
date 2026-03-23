import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import {
  GraduationCap, BookOpen, ClipboardList, Radio, Brain, BarChart3,
  Shield, Zap, Check, ArrowRight, Star, ChevronRight,
  Globe, Sparkles, Crown,
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const { t } = useTranslation();

  const features = [
    { icon: BookOpen, title: t('landing.feat1Title'), desc: t('landing.feat1Desc'), color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { icon: ClipboardList, title: t('landing.feat2Title'), desc: t('landing.feat2Desc'), color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { icon: Radio, title: t('landing.feat3Title'), desc: t('landing.feat3Desc'), color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { icon: Brain, title: t('landing.feat4Title'), desc: t('landing.feat4Desc'), color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { icon: BarChart3, title: t('landing.feat5Title'), desc: t('landing.feat5Desc'), color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { icon: Globe, title: t('landing.feat6Title'), desc: t('landing.feat6Desc'), color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  ];

  const plans = [
    { id: 'starter', name: 'Starter', price: 39, popular: false, icon: Zap, features: ['50 students', '5 teachers', '20 exams', 'Auto-grading', 'Email support'] },
    { id: 'professional', name: 'Professional', price: 79, popular: true, icon: Crown, features: ['200 students', '20 teachers', 'Unlimited exams', 'AI feedback', 'Priority support'] },
    { id: 'enterprise', name: 'Enterprise', price: 99, popular: false, icon: Shield, features: ['Unlimited everything', 'AI analytics', 'Custom branding', 'API access', 'Dedicated manager'] },
  ];

  const testimonials = [
    { name: t('landing.test1Name'), role: t('landing.test1Role'), text: t('landing.test1Text'), rating: 5 },
    { name: t('landing.test2Name'), role: t('landing.test2Role'), text: t('landing.test2Text'), rating: 5 },
    { name: t('landing.test3Name'), role: t('landing.test3Role'), text: t('landing.test3Text'), rating: 5 },
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
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">MyCoursePlan</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{t('landing.navFeatures')}</a>
            <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{t('landing.navPricing')}</a>
            <a href="#testimonials" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">{t('landing.navReviews')}</a>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 transition-colors">{t('auth.login')}</Link>
            <Link to="/register" className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-primary-500/20">{t('auth.register')}</Link>
          </div>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Decorative blobs */}
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
              <a href="#features" className="text-slate-600 hover:text-slate-900 font-medium px-6 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-2">
                {t('landing.heroSecondary')}
              </a>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((s) => (
              <div key={s.label} className="text-center p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-3xl font-extrabold text-slate-900">{s.value}</p>
                <p className="text-sm text-slate-500 mt-1">{s.label}</p>
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
                  <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>${plan.price}</span>
                  <span className={`text-sm ${plan.popular ? 'text-white/70' : 'text-slate-400'}`}> /{t('landing.perMonth')}</span>
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
                  {t('landing.startTrial')}
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
                  {Array.from({ length: rev.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
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
      <footer className="border-t border-slate-200 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary-600" />
            <span className="font-bold text-slate-900">MyCoursePlan</span>
          </div>
          <p className="text-sm text-slate-400">© {new Date().getFullYear()} MyCoursePlan. {t('landing.rights')}</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
