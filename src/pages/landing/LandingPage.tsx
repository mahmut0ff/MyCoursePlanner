import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Wallet, ClipboardCheck, CalendarDays, Coins, Send, Sparkles, Network, Trophy, ArrowRight, Check,
} from 'lucide-react';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import {
  Cta, MktNav, MktFooter, ProductMock, Reveal, focusRing, focusRingNight, eyebrowCls, h2Cls, primaryBtn,
} from '../../components/landing/LandingKit';

/* ──────────────────────────────────────────────────────────────
   SabakHub home page — warm editorial marketing surface.
   Paper/ink palette + Unbounded/Golos Text pairing, deliberately
   distinct from the cool slate of the product app; flips with the
   app's dark theme through the --mkt-* variables in index.css.
   ────────────────────────────────────────────────────────────── */

type InstId = 'center' | 'school' | 'language' | 'academy';
const INSTITUTIONS: { id: InstId; suffix: string }[] = [
  { id: 'center', suffix: 'Center' },
  { id: 'school', suffix: 'School' },
  { id: 'language', suffix: 'Language' },
  { id: 'academy', suffix: 'Academy' },
];

const FEATURES = [
  { n: 1, icon: Wallet, wide: true },
  { n: 2, icon: ClipboardCheck },
  { n: 3, icon: CalendarDays },
  { n: 4, icon: Coins },
  { n: 5, icon: Send },
  { n: 6, icon: Sparkles, wide: true },
  { n: 7, icon: Network, wide: true },
  { n: 8, icon: Trophy, wide: true },
];

const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const [demoOpen, setDemoOpen] = useState(false);
  const [inst, setInst] = useState<InstId>('center');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [pastHero, setPastHero] = useState(false);

  // Phone-only sticky CTA shows up once the hero's own button has scrolled away.
  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > 640);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openDemo = () => setDemoOpen(true);
  const suffix = INSTITUTIONS.find((i) => i.id === inst)!.suffix;
  // Terminology of the currently selected institution type flows into the
  // day-timeline copy and the switcher preview, mirroring the real product.
  const terms = {
    students: t(`terms.${inst}.students`),
    group: t(`terms.${inst}.group`),
  };

  const faqs = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ q: t(`home.faq${n}Q`), a: t(`home.faq${n}A`) }));

  // The director's morning opens the day: money first, then the teaching hours.
  const days = [
    { time: '07:30', title: t('home.day1Title'), desc: t('home.day1Desc'), dark: true },
    { time: '07:45', title: t('home.day2Title'), desc: t('home.day2Desc', terms) },
    { time: '12:30', title: t('home.day3Title'), desc: t('home.day3Desc', terms) },
    { time: '17:10', title: t('home.day4Title'), desc: t('home.day4Desc', terms) },
  ];

  const stats = [1, 2, 3, 4].map((n) => ({ num: t(`mkt.stat${n}Num`), label: t(`mkt.stat${n}Label`) }));
  const steps = [1, 2, 3].map((n) => ({ title: t(`mkt.step${n}Title`), desc: t(`mkt.step${n}Desc`) }));

  const anchors = [
    { href: '#features', label: t('landing.navFeatures') },
    { href: '#day', label: t('home.navHow') },
    { href: '#pricing', label: t('home.navPricing') },
    { href: '#faq', label: t('home.navFaq') },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-paper font-marketing text-ink antialiased selection:bg-primary-600 selection:text-white">
      <MktNav anchors={anchors} onDemo={openDemo} />

      {/* ═══ Hero ═══ */}
      <header className="relative mx-auto max-w-[1240px] px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:pb-20 lg:pt-[80px]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-10%] -z-0 h-[520px] w-[520px] rounded-full bg-primary-600/10 blur-3xl"
        />
        <div className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <p className={`hero-rise ${eyebrowCls}`}>{t('home.heroEyebrow')}</p>
            <h1
              className="hero-rise mt-[22px] text-balance font-marketing-display text-[clamp(34px,4.6vw,64px)] font-bold leading-[1.08] tracking-[-0.01em]"
              style={{ animationDelay: '0.06s' }}
            >
              {t('home.heroTitle1')}{' '}
              <span className="shadow-[inset_0_-0.32em_0_rgba(245,158,11,0.5)]">{t('home.heroTitleMark')}</span>.
            </h1>
            <p
              className="hero-rise mt-[26px] max-w-[52ch] text-[17px] leading-[1.65] text-ink/70 sm:text-[19px]"
              style={{ animationDelay: '0.12s' }}
            >
              {t('home.heroSubtitle')}
            </p>
            <div className="hero-rise mt-9 flex flex-wrap items-center gap-3.5" style={{ animationDelay: '0.18s' }}>
              <Cta onFallback={openDemo} className={primaryBtn}>
                {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-[18px] w-[18px]" />
              </Cta>
              <a
                href="#features"
                className={`inline-flex items-center gap-2.5 rounded-full border-[1.5px] border-ink/20 px-[26px] py-4 text-[17px] font-semibold text-ink transition-colors hover:border-ink ${focusRing}`}
              >
                {t('mkt.heroCta2')}
              </a>
            </div>
            <ul className="hero-rise mt-8 flex flex-wrap gap-x-5 gap-y-2.5 text-[15px] text-ink/70" style={{ animationDelay: '0.24s' }}>
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {t(`mkt.heroTrust${n}`)}
                </li>
              ))}
            </ul>
          </div>
          <HeroVisual />
        </div>
      </header>

      {/* ═══ Proof: real numbers only ═══ */}
      <section aria-label={t('mkt.statsLabel')} className="border-y border-ink/10 bg-paper-deep/60">
        <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-y-8 px-5 py-10 sm:px-8 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={i} className={`px-2 sm:px-5 ${i % 2 ? 'border-l border-ink/10' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
              <p className="font-marketing-display text-[clamp(24px,2.6vw,34px)] font-bold text-ink">{s.num}</p>
              <p className="mt-1.5 text-sm leading-snug text-ink/65">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Features bento ═══ */}
      <section id="features" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pt-16 sm:px-8 sm:pt-[104px]">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className={eyebrowCls}>{t('landing.navFeatures')}</p>
              <h2 className={`${h2Cls} max-w-[24ch]`}>{t('mkt.featTitle')}</h2>
            </div>
            <Link
              to="/features"
              className={`group inline-flex items-center gap-2 rounded-full text-[15px] font-semibold text-primary-600 dark:text-primary-400 ${focusRing}`}
            >
              {t('mkt.featAll')}
              <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
          {FEATURES.map(({ n, icon: Icon, wide }, i) => (
            <Reveal key={n} delay={(i % 4) * 60} className={wide ? 'lg:col-span-2' : ''}>
              <article className="group h-full rounded-3xl border border-ink/[0.06] bg-card p-6 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(22,20,31,0.25)] sm:p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-600/10 text-primary-600 dark:text-primary-300">
                  <Icon aria-hidden className="h-[22px] w-[22px]" />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold">{t(`mkt.f${n}Title`)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/65">{t(`mkt.f${n}Desc`)}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ One day with SabakHub ═══ */}
      <section id="day" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-16 pt-16 sm:px-8 sm:pt-[104px]">
        <Reveal>
          <p className={eyebrowCls}>{t('home.dayEyebrow')}</p>
          <h2 className={`${h2Cls} max-w-[22ch]`}>{t('home.dayTitle')}</h2>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 xl:grid-cols-4">
          {days.map((d, i) => (
            <Reveal key={d.time} delay={i * 70}>
              <article
                className={`h-full rounded-3xl p-7 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5 ${
                  d.dark
                    ? 'bg-night text-cream hover:shadow-[0_20px_40px_-20px_rgba(22,20,31,0.45)]'
                    : 'border border-ink/5 bg-card hover:shadow-[0_20px_40px_-20px_rgba(22,20,31,0.25)]'
                }`}
              >
                <p className={`font-marketing-display text-[26px] font-bold ${d.dark ? 'text-amber-500' : 'text-primary-600 dark:text-primary-400'}`}>
                  {d.time}
                </p>
                <h3 className="mt-3.5 text-[17px] font-semibold">{d.title}</h3>
                <p className={`mt-2.5 text-[15px] leading-relaxed ${d.dark ? 'text-cream/70' : 'text-ink/65'}`}>{d.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ Institution switcher ═══ */}
      <section id="fit" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-16 sm:px-8 sm:pb-[104px]">
        <Reveal>
          <div className="rounded-[28px] border border-ink/5 bg-card p-6 sm:rounded-[32px] sm:p-10 lg:p-14">
            <div className="grid items-start gap-9 lg:grid-cols-2 lg:gap-14">
              <div>
                <p className={eyebrowCls}>{t('home.fitEyebrow')}</p>
                <h2 className="mt-[18px] text-balance font-marketing-display text-[clamp(24px,2.6vw,36px)] font-bold leading-[1.18]">
                  {t('home.fitTitle')}
                </h2>
                <p className="mt-[18px] leading-[1.65] text-ink/70">{t('home.fitDesc')}</p>
                <div className="mt-7 flex flex-col gap-2.5" role="group" aria-label={t('home.fitEyebrow')}>
                  {INSTITUTIONS.map(({ id, suffix: sfx }) => {
                    const selected = inst === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setInst(id)}
                        className={`flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl border-[1.5px] px-5 py-4 text-left text-base font-semibold transition-colors ${focusRing} ${
                          selected ? 'border-primary-600 bg-primary-600/10' : 'border-ink/10 bg-card hover:border-ink/30'
                        }`}
                      >
                        {t(`inst.${id}`)}
                        <span className="text-[13px] font-medium text-ink/60">{t(`home.fitDesc${sfx}`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="lg:sticky lg:top-24">
                <div className="rounded-3xl bg-paper p-6 sm:p-8">
                  <p className="text-[13px] uppercase tracking-[0.1em] text-ink/60">{t('home.fitPreviewLabel')}</p>
                  <div className="mt-[22px] flex flex-col gap-3.5">
                    {[
                      { label: t('home.fitRowPeople'), value: t(`terms.${inst}.students`) },
                      { label: t('home.fitRowGroups'), value: t(`terms.${inst}.groups`) },
                      { label: t('home.fitRowScale'), value: t(`home.fitScale${suffix}`) },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-4">
                        <span className="text-[15px] text-ink/65">{row.label}</span>
                        <span className="text-right font-bold">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-[22px] text-sm leading-[1.55] text-ink/65">{t(`home.fitNote${suffix}`)}</p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══ How we start ═══ */}
      <section id="start" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-16 sm:px-8 sm:pb-[104px]">
        <Reveal>
          <p className={eyebrowCls}>{t('mkt.startEyebrow')}</p>
          <h2 className={`${h2Cls} max-w-[22ch]`}>{t('mkt.startTitle')}</h2>
        </Reveal>
        <ol className="mt-10 grid gap-5 md:grid-cols-3 lg:mt-14">
          {steps.map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <li className="relative h-full rounded-3xl border border-ink/[0.06] bg-card p-7">
                <span className="font-marketing-display text-[44px] font-bold leading-none text-primary-600/25 dark:text-primary-400/40">
                  0{i + 1}
                </span>
                <h3 className="mt-4 text-[17px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/65">{s.desc}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ═══ Pricing ═══ */}
      <section id="pricing" className="scroll-mt-0 bg-night px-5 py-16 text-cream sm:px-8 sm:py-[104px]">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-500">{t('home.priceEyebrow')}</p>
            <div className="flex flex-wrap items-end justify-between gap-8">
              <h2 className={`${h2Cls} max-w-[20ch]`}>{t('home.priceTitle')}</h2>
              <p className="max-w-[36ch] text-[15px] text-cream/60">{t('home.priceDesc')}</p>
            </div>
          </Reveal>
          <div className="mt-10 grid items-stretch gap-5 min-[900px]:grid-cols-3 lg:mt-14">
            {[
              { name: t('home.plan1Name'), price: t('home.plan1Price'), desc: t('home.plan1Desc') },
              { name: t('home.plan2Name'), price: t('home.plan2Price'), desc: t('home.plan2Desc'), popular: true },
              { name: t('home.plan3Name'), price: t('home.plan3Price'), desc: t('home.plan3Desc') },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-[28px] p-7 sm:p-9 ${
                  plan.popular
                    ? 'bg-[#f7f5f0] text-[#16141f] shadow-[0_30px_60px_-24px_rgba(0,0,0,0.5)] min-[900px]:-translate-y-3.5'
                    : 'border border-cream/15'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-[13px] left-9 rounded-full bg-amber-500 px-3.5 py-[5px] text-xs font-bold text-[#16141f]">
                    {t('home.planPopular')}
                  </span>
                )}
                <h3 className="text-[17px] font-semibold">{plan.name}</h3>
                <p className="mt-[22px] font-marketing-display text-[40px] font-bold leading-none">
                  {plan.price}{' '}
                  <span className={`text-[15px] font-normal ${plan.popular ? 'text-[#16141f]/60' : 'text-cream/60'}`}>
                    {t('home.pricePer')}
                  </span>
                </p>
                <p className={`mt-[18px] text-[15px] leading-relaxed ${plan.popular ? 'text-[#16141f]/70' : 'text-cream/70'}`}>
                  {plan.desc}
                </p>
                <div className="mt-auto pt-7">
                  <Cta
                    onFallback={openDemo}
                    className={`block w-full rounded-full py-3.5 text-center text-[15px] font-semibold transition-colors ${
                      plan.popular
                        ? `bg-primary-600 text-white shadow-[0_12px_24px_-8px_rgba(79,70,229,0.5)] hover:bg-primary-700 ${focusRing}`
                        : `border-[1.5px] border-cream/35 text-cream hover:border-cream ${focusRingNight}`
                    }`}
                  >
                    {t('home.ctaPrimary')}
                  </Cta>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 flex items-start gap-2.5 text-[15px] text-cream/70">
            <Check aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-500" />
            {t('mkt.priceIncluded')}
          </p>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="mx-auto max-w-[860px] scroll-mt-24 px-5 py-16 sm:px-8 sm:py-[104px]">
        <h2 className="font-marketing-display text-[clamp(24px,2.6vw,36px)] font-bold">{t('home.faqTitle')}</h2>
        <div className="mt-10 border-t border-ink/10">
          {faqs.map((faq, i) => {
            const open = openFaq === i;
            return (
              <div key={i} className="border-b border-ink/10">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpenFaq(open ? null : i)}
                  className={`flex w-full items-center justify-between gap-5 py-6 text-left text-[17px] font-semibold sm:text-lg ${focusRing}`}
                >
                  {faq.q}
                  <span aria-hidden className="font-marketing-display text-xl text-primary-600 dark:text-primary-400">
                    {open ? '−' : '+'}
                  </span>
                </button>
                <div id={`faq-${i}`} className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <p className={`overflow-hidden pr-10 leading-[1.65] text-ink/70 ${open ? 'pb-6' : ''}`}>{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section id="cta" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-16 sm:px-8 sm:pb-[104px]">
        <Reveal>
          <div className="relative overflow-hidden rounded-[28px] bg-primary-600 p-7 text-white sm:rounded-[36px] sm:px-16 sm:py-[72px]">
            <div aria-hidden className="absolute -right-20 -top-20 h-[340px] w-[340px] rounded-full bg-white/[0.08]" />
            <div aria-hidden className="absolute -bottom-[120px] right-[60px] h-[260px] w-[260px] rounded-full bg-amber-500/25" />
            <div className="relative max-w-[60ch]">
              <h2 className="text-balance font-marketing-display text-[clamp(26px,3.2vw,44px)] font-bold leading-[1.12]">
                {t('home.ctaTitle')}
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-white/80">{t('home.ctaDesc')}</p>
              <div className="mt-[34px] flex flex-wrap gap-3.5">
                <Cta
                  onFallback={openDemo}
                  className="inline-flex items-center gap-2.5 rounded-full bg-white px-[30px] py-4 text-base font-bold text-[#16141f] transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
                >
                  {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-[18px] w-[18px]" />
                </Cta>
                <a
                  href="https://t.me/sabakhub_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 rounded-full border-[1.5px] border-white/40 px-[26px] py-4 text-base font-semibold text-white transition-colors hover:border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
                >
                  {t('home.ctaTg')}
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <MktFooter />

      {/* Phone-only sticky CTA */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-paper/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl transition-transform duration-300 sm:hidden ${
          pastHero && !demoOpen ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
        aria-hidden={!pastHero}
      >
        <Cta onFallback={openDemo} className={`${primaryBtn} w-full !py-3.5 !text-base`}>
          {t('home.ctaPrimary')}
        </Cta>
      </div>

      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

/* ── Hero visual: product mock + Telegram card + sticker (decorative) ── */
const HeroVisual: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="hero-rise pointer-events-none relative mx-auto w-full max-w-[560px] select-none pb-32 sm:pb-24 lg:max-w-none" style={{ animationDelay: '0.2s' }}>
      <div className="absolute -right-2.5 left-[30px] top-[26px] bottom-16 rotate-3 rounded-[28px] bg-paper-deep" />
      <div className="relative -rotate-[1deg]">
        <ProductMock />
      </div>
      {/* telegram card */}
      <div className="absolute bottom-0 right-0 max-w-[280px] rotate-2 rounded-[22px] bg-night px-6 py-5 text-cream shadow-[0_24px_48px_-20px_rgba(22,20,31,0.5)] [animation:mkt-float_6s_ease-in-out_infinite] sm:-right-3">
        <p className="text-xs uppercase tracking-[0.1em] text-cream/60">{t('home.visTgLabel')}</p>
        <p className="mt-2.5 text-sm leading-normal">{t('home.visTgMsg')}</p>
      </div>
      {/* amber sticker */}
      <div className="absolute -top-6 right-4 max-w-[200px] rotate-[4deg] sm:right-8 rounded-[18px] bg-amber-500 px-5 py-3.5 text-[#16141f] shadow-[0_16px_32px_-14px_rgba(245,158,11,0.6)]">
        <p className="font-marketing-display text-[15px] font-bold leading-[1.3]">{t('home.visDirSticker')}</p>
      </div>
    </div>
  );
};

export default LandingPage;
