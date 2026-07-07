import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import { LandingNav, LandingFooter, SectionHead } from '../../components/landing/LandingChrome';
import {
  BookOpen, ClipboardList, Radio, Brain, BarChart3,
  Shield, Zap, Check, ArrowRight, ChevronDown,
  Globe, Sparkles, Crown, Users,
  MessageCircle, Award,
  Layers, Lock, FileText, Target, Gamepad2,
  Bot, PenTool, LayoutGrid, Database, Briefcase,
  CalendarClock, CheckSquare, UploadCloud,
  Laptop, GraduationCap, Building2,
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [demoOpen, setDemoOpen] = useState(false);

  /* ── Feature categories ── */
  const featureCategories = [
    {
      id: 'core', icon: Briefcase, title: t('landing.catCore'),
      items: [
        { icon: Briefcase, label: t('landing.coreMultiTenant') },
        { icon: Shield, label: t('landing.coreRbac') },
        { icon: Zap, label: t('landing.coreBilling') },
        { icon: Lock, label: t('landing.coreAudit') },
      ],
    },
    {
      id: 'learning', icon: BookOpen, title: t('landing.catLearning'),
      items: [
        { icon: BookOpen, label: t('landing.learnCourseBuilder') },
        { icon: PenTool, label: t('landing.learnRichEditor') },
        { icon: BarChart3, label: t('landing.learnProgress') },
        { icon: FileText, label: t('landing.learnDiary') },
      ],
    },
    {
      id: 'exams', icon: ClipboardList, title: t('landing.catExams'),
      items: [
        { icon: ClipboardList, label: t('landing.examBuilder') },
        { icon: LayoutGrid, label: t('landing.examQuestionTypes') },
        { icon: Radio, label: t('landing.examRooms') },
        { icon: Shield, label: t('landing.examAntiCheat') },
      ],
    },
    {
      id: 'ai', icon: Bot, title: t('landing.catAi'),
      items: [
        { icon: Bot, label: t('landing.aiTelegramBot') },
        { icon: PenTool, label: t('landing.aiGenerateLessons') },
        { icon: FileText, label: t('landing.aiGenerateTests') },
        { icon: Sparkles, label: t('landing.aiEvaluate') },
      ],
    },
    {
      id: 'engagement', icon: Gamepad2, title: t('landing.catEngagement'),
      items: [
        { icon: Target, label: t('landing.engXpLevels') },
        { icon: Award, label: t('landing.engBadges') },
        { icon: Crown, label: t('landing.engLeaderboards') },
        { icon: Gamepad2, label: t('landing.engQuiz') },
      ],
    },
    {
      id: 'certificates', icon: FileText, title: t('landing.catCertificates'),
      items: [
        { icon: FileText, label: t('landing.certPdf') },
        { icon: Globe, label: t('landing.certQr') },
        { icon: Layers, label: t('landing.certMultilang') },
      ],
    },
    {
      id: 'communication', icon: MessageCircle, title: t('landing.catComm'),
      items: [
        { icon: MessageCircle, label: t('landing.commGroup') },
        { icon: Users, label: t('landing.commDirect') },
        { icon: Radio, label: t('landing.commRealtime') },
      ],
    },
    {
      id: 'analytics', icon: BarChart3, title: t('landing.catAnalytics'),
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

  /* ── Target niches ── */
  const targetNiches = [
    { id: 'it', icon: Laptop, title: t('landing.niche1Title'), desc: t('landing.niche1Desc') },
    { id: 'lang', icon: Globe, title: t('landing.niche2Title'), desc: t('landing.niche2Desc') },
    { id: 'tutor', icon: GraduationCap, title: t('landing.niche3Title'), desc: t('landing.niche3Desc') },
    { id: 'corporate', icon: Building2, title: t('landing.niche4Title'), desc: t('landing.niche4Desc') },
    { id: 'studio', icon: LayoutGrid, title: t('landing.niche5Title'), desc: t('landing.niche5Desc') },
    { id: 'org', icon: Briefcase, title: t('landing.niche6Title'), desc: t('landing.niche6Desc') },
  ];

  /* ── FAQ ── */
  const faqs = [
    { q: t('landing.faq1Q'), a: t('landing.faq1A') },
    { q: t('landing.faq2Q'), a: t('landing.faq2A') },
    { q: t('landing.faq3Q'), a: t('landing.faq3A') },
    { q: t('landing.faq4Q'), a: t('landing.faq4A') },
    { q: t('landing.faq5Q'), a: t('landing.faq5A') },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased selection:bg-primary-600 selection:text-white">

      <LandingNav variant="home" />

      {/* ═══ Hero ═══ */}
      <section className="relative overflow-hidden px-6 pt-36 pb-20 sm:pt-40 sm:pb-28">
        {/* fading grid — replaces the old blur blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#e2e8f01a_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01a_1px,transparent_1px)] bg-[size:56px_56px]"
          style={{ WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000 55%, transparent 100%)', maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000 55%, transparent 100%)' }}
        />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary-200/30 blur-[120px]" />

        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur">
            <Sparkles className="w-4 h-4 text-primary-600" />
            {t('landing.heroBadge')}
          </div>
          <h1 className="mt-6 text-balance text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] text-slate-900">
            {t('landing.heroTitle')}
          </h1>
          <p className="mt-6 text-lg sm:text-xl leading-relaxed text-slate-600 max-w-2xl mx-auto">
            {t('landing.heroSubtitle')}
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            {user ? (
              <Link to="/dashboard" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-primary-600/20 transition-all hover:bg-primary-700 hover:shadow-primary-600/30">
                {t('nav.dashboard') || 'Dashboard'}
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <>
                <button type="button" onClick={() => setDemoOpen(true)} className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-primary-600/20 transition-all hover:bg-primary-700 hover:shadow-primary-600/30">
                  {t('landing.heroDemo')}
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                </button>
                <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-base font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
                  {t('auth.login')}
                </Link>
              </>
            )}
          </div>
          <p className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm text-slate-600">
            <Check className="h-4 w-4 shrink-0 text-primary-600" aria-hidden />
            <span><span className="font-semibold text-slate-900">200+</span> {t('landing.statStudents')}</span>
            <span className="text-slate-300" aria-hidden>·</span>
            <span><span className="font-semibold text-slate-900">50+</span> {t('landing.statExams')}</span>
          </p>
        </div>

        {/* Product preview */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div aria-hidden className="absolute -inset-x-6 -top-6 bottom-0 -z-10 rounded-[2rem] bg-gradient-to-b from-primary-100/50 to-transparent blur-2xl" />
          <ProductFrame />
        </div>
      </section>

      {/* ═══ Features ═══ */}
      <section id="features" className="px-6 py-20 sm:py-28 bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto">
          <SectionHead eyebrow={t('landing.nichesBadge')} title={t('landing.featuresTitle')} subtitle={t('landing.featuresSubtitle')} />
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featureCategories.map((cat) => (
              <div key={cat.id} className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100 transition-colors group-hover:bg-primary-600 group-hover:text-white">
                  <cat.icon className="w-5 h-5" />
                </div>
                <h3 className="mt-5 text-[0.95rem] font-semibold text-slate-900">{cat.title}</h3>
                <ul className="mt-3 space-y-2">
                  {cat.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-slate-500">
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

      {/* ═══ AI (the one dark, focal section) ═══ */}
      <section className="relative overflow-hidden px-6 py-20 sm:py-28 bg-slate-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0 opacity-[0.18] bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff14_1px,transparent_1px)] bg-[size:56px_56px]"
          style={{ WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 40%, #000 40%, transparent 100%)', maskImage: 'radial-gradient(ellipse 60% 60% at 50% 40%, #000 40%, transparent 100%)' }}
        />
        <div aria-hidden className="pointer-events-none absolute right-[-10%] top-[-20%] -z-0 h-[460px] w-[460px] rounded-full bg-primary-600/20 blur-[130px]" />

        <div className="relative max-w-6xl mx-auto">
          <SectionHead
            tone="dark"
            eyebrow="SabakHub AI"
            title={`${t('landing.aiSecTitlePre')}${t('landing.aiSecTitleHighlight')}`}
            subtitle={t('landing.aiSecSubtitle')}
          />
          <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              { icon: Brain, title: t('landing.aiSecF1Title'), desc: t('landing.aiSecF1Desc') },
              { icon: Check, title: t('landing.aiSecF2Title'), desc: t('landing.aiSecF2Desc') },
              { icon: Database, title: t('landing.tgSecF1Title'), desc: t('landing.tgSecF1Desc') },
              { icon: MessageCircle, title: t('landing.tgSecF2Title'), desc: t('landing.tgSecF2Desc') },
            ].map((f, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300 ring-1 ring-primary-400/20">
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
              <Bot className="w-4 h-4 text-primary-300" />
              {t('landing.tgSecBadge')}
            </span>
          </div>
        </div>
      </section>

      {/* ═══ For teachers & managers ═══ */}
      <section className="px-6 py-20 sm:py-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <SectionHead align="left" eyebrow={t('landing.teachSecBadge')} title={t('landing.teachSecTitle')} subtitle={t('landing.teachSecSubtitle')} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: CalendarClock, title: t('landing.teachCard1Title'), desc: t('landing.teachCard1Desc') },
              { icon: CheckSquare, title: t('landing.teachCard2Title'), desc: t('landing.teachCard2Desc') },
              { icon: Database, title: t('landing.teachCard3Title'), desc: t('landing.teachCard3Desc') },
              { icon: Shield, title: t('landing.teachCard4Title'), desc: t('landing.teachCard4Desc') },
            ].map((c, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5">
                <c.icon className="w-7 h-7 text-primary-600" />
                <h4 className="mt-4 font-semibold text-slate-900">{c.title}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ For students & parents ═══ */}
      <section className="px-6 py-20 sm:py-28 bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <ul className="order-2 lg:order-1 space-y-3">
            {[
              { icon: Crown, title: t('landing.studItem1Title'), desc: t('landing.studItem1Desc') },
              { icon: UploadCloud, title: t('landing.studItem2Title'), desc: t('landing.studItem2Desc') },
              { icon: BarChart3, title: t('landing.studItem3Title'), desc: t('landing.studItem3Desc') },
            ].map((s, i) => (
              <li key={i} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">{s.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{s.desc}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="order-1 lg:order-2">
            <SectionHead align="left" eyebrow={t('landing.studSecBadge')} title={t('landing.studSecTitle')} subtitle={t('landing.studSecSubtitle')} />
          </div>
        </div>
      </section>

      {/* ═══ Niches ═══ */}
      <section className="px-6 py-20 sm:py-28">
        <div className="max-w-6xl mx-auto">
          <SectionHead eyebrow={t('landing.nichesBadge')} title={t('landing.nichesTitle')} subtitle={t('landing.nichesSubtitle')} />
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {targetNiches.map((niche) => (
              <div key={niche.id} className="group rounded-2xl border border-slate-200 bg-white p-7 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white transition-colors group-hover:bg-primary-600">
                  <niche.icon className="w-5 h-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{niche.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{niche.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Pricing ═══ */}
      <section id="pricing" className="px-6 py-20 sm:py-28 bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto">
          <SectionHead eyebrow={t('landing.navPricing')} title={t('landing.pricingTitle')} subtitle={t('landing.pricingSubtitle')} />
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-7 transition-all ${plan.popular
                  ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20 md:-translate-y-3'
                  : 'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5'}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-7 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-primary-600/30">
                    {t('landing.popular')}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${plan.popular ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <plan.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold">{plan.name}</h3>
                </div>
                <div className="mt-6 flex items-baseline gap-1.5">
                  {plan.price === 0 ? (
                    <span className="text-4xl font-bold tracking-tight">{t('landing.free')}</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold tracking-tight">{plan.price.toLocaleString()}</span>
                      <span className={`text-sm ${plan.popular ? 'text-white/60' : 'text-slate-500'}`}>{t('landing.currency')}/{t('landing.perMonth')}</span>
                    </>
                  )}
                </div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2.5 text-sm ${plan.popular ? 'text-white/85' : 'text-slate-600'}`}>
                      <Check className={`mt-0.5 w-4 h-4 shrink-0 ${plan.popular ? 'text-primary-400' : 'text-primary-600'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className={`mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all ${plan.popular
                    ? 'bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                >
                  {t('landing.heroDemo')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="px-6 py-20 sm:py-28">
        <div className="max-w-3xl mx-auto">
          <SectionHead eyebrow={t('landing.navFaq')} title={t('landing.faqTitle')} subtitle={t('landing.faqSubtitle')} />
          <div className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map((faq, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                  aria-expanded={openFaqIndex === i}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="font-medium text-slate-900">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 shrink-0 text-slate-400 transition-transform ${openFaqIndex === i ? 'rotate-180 text-primary-600' : ''}`} />
                </button>
                <div className={`grid transition-all duration-200 ${openFaqIndex === i ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'}`}>
                  <p className="overflow-hidden text-sm leading-relaxed text-slate-500">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="px-6 pb-24">
        <div className="relative max-w-5xl mx-auto overflow-hidden rounded-3xl bg-slate-900 px-8 py-16 sm:px-16 sm:py-20 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.35),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">{t('landing.ctaTitle')}</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">{t('landing.ctaSubtitle')}</p>
            {user ? (
              <Link to="/dashboard" className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-100">
                {t('nav.dashboard') || 'Dashboard'}
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <button type="button" onClick={() => setDemoOpen(true)} className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-100">
                {t('landing.heroDemo')}
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      <LandingFooter />

      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

/* Language-neutral product preview — a stylised app window built from
   shapes only, so it reads as "a real product" in every locale. */
const ProductFrame: React.FC = () => {
  const navIcons = [LayoutGrid, BookOpen, ClipboardList, Users, BarChart3, CalendarClock];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 h-10">
        <span className="h-3 w-3 rounded-full bg-slate-300" />
        <span className="h-3 w-3 rounded-full bg-slate-300" />
        <span className="h-3 w-3 rounded-full bg-slate-300" />
        <div className="ml-3 hidden h-5 w-full max-w-[260px] items-center rounded-md border border-slate-200 bg-white px-2 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="ml-2 h-1.5 w-24 rounded bg-slate-200" />
        </div>
      </div>
      <div className="flex h-[300px] sm:h-[380px]">
        {/* sidebar */}
        <aside className="hidden w-48 shrink-0 flex-col border-r border-slate-100 bg-white p-4 sm:flex">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary-600 to-violet-600" />
            <span className="h-3 w-20 rounded bg-slate-200" />
          </div>
          <div className="mt-6 space-y-1.5">
            {navIcons.map((Icon, i) => (
              <div key={i} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${i === 0 ? 'bg-primary-50 text-primary-600' : 'text-slate-400'}`}>
                <Icon className="h-4 w-4" />
                <span className={`h-2 rounded ${i === 0 ? 'w-16 bg-primary-200' : 'w-14 bg-slate-200'}`} />
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center gap-2 rounded-lg bg-slate-50 p-2">
            <span className="h-7 w-7 rounded-full bg-slate-200" />
            <span className="h-2 w-16 rounded bg-slate-200" />
          </div>
        </aside>
        {/* main */}
        <main className="flex-1 bg-slate-50/60 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <span className="h-4 w-32 rounded bg-slate-300" />
            <span className="h-8 w-24 rounded-lg bg-primary-600" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { Icon: Users, tint: 'text-primary-600 bg-primary-50' },
              { Icon: ClipboardList, tint: 'text-violet-600 bg-violet-50' },
              { Icon: Award, tint: 'text-teal-600 bg-teal-50' },
            ].map(({ Icon, tint }, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="mt-3 block h-4 w-12 rounded bg-slate-300" />
                <span className="mt-1.5 block h-2 w-14 rounded bg-slate-200" />
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="h-3 w-24 rounded bg-slate-300" />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="h-1.5 w-8 rounded bg-emerald-200" />
              </span>
            </div>
            <div className="mt-3 space-y-2.5">
              {[['bg-emerald-400', 'bg-emerald-400', 'bg-amber-400'], ['bg-emerald-400', 'bg-amber-400', 'bg-emerald-400'], ['bg-amber-400', 'bg-emerald-400', 'bg-emerald-400']].map((row, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-slate-200 to-slate-300" />
                  <span className="h-2 flex-1 rounded bg-slate-200" />
                  {row.map((c, j) => (
                    <span key={j} className={`h-5 w-5 rounded-md ${c}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
