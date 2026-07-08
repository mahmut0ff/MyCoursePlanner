import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import LanguageSwitcher from '../../components/LanguageSwitcher';

/* ──────────────────────────────────────────────────────────────
   SabakHub home page — warm editorial marketing surface.
   Paper/ink palette + Unbounded/Golos Text pairing, deliberately
   distinct from the cool slate of the product app. Subpages keep
   the shared LandingChrome; this page owns its nav and footer.
   ────────────────────────────────────────────────────────────── */

type InstId = 'center' | 'school' | 'language' | 'academy';
const INSTITUTIONS: { id: InstId; suffix: string }[] = [
  { id: 'center', suffix: 'Center' },
  { id: 'school', suffix: 'School' },
  { id: 'language', suffix: 'Language' },
  { id: 'academy', suffix: 'Academy' },
];

const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-paper';
const focusRingDark =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [demoOpen, setDemoOpen] = useState(false);
  const [inst, setInst] = useState<InstId>('center');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const suffix = INSTITUTIONS.find((i) => i.id === inst)!.suffix;
  // Terminology of the currently selected institution type flows into the
  // day-timeline copy and the switcher preview, mirroring the real product.
  const terms = {
    students: t(`terms.${inst}.students`),
    group: t(`terms.${inst}.group`),
    groupsDat: t(`home.fitGroupsDat${suffix}`),
  };

  const faqs = [1, 2, 3, 4].map((n) => ({ q: t(`home.faq${n}Q`), a: t(`home.faq${n}A`) }));
  const marquee = [1, 2, 3, 4, 5].map((n) => t(`home.marq${n}`));

  const days = [
    { time: '07:45', title: t('home.day1Title'), desc: t('home.day1Desc', terms) },
    { time: '12:30', title: t('home.day2Title'), desc: t('home.day2Desc', terms) },
    { time: '17:10', title: t('home.day3Title'), desc: t('home.day3Desc', terms) },
    { time: '21:00', title: t('home.day4Title'), desc: t('home.day4Desc', terms), dark: true },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-paper font-marketing text-ink antialiased selection:bg-primary-600 selection:text-white">
      <HomeNav onDemo={() => setDemoOpen(true)} />

      {/* ═══ Hero ═══ */}
      <header className="mx-auto max-w-[1240px] px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:pb-[72px] lg:pt-[88px]">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">
              {t('home.heroEyebrow')}
            </p>
            <h1 className="mt-[22px] text-balance font-marketing-display text-[clamp(34px,4.6vw,64px)] font-bold leading-[1.08] tracking-[-0.01em]">
              {t('home.heroTitle1')}
              <br />
              {t('home.heroTitle2')}{' '}
              <span className="shadow-[inset_0_-0.32em_0_rgba(245,158,11,0.5)]">{t('home.heroTitleMark')}</span>.
            </h1>
            <p className="mt-[26px] max-w-[52ch] text-[17px] leading-[1.65] text-ink/70 sm:text-[19px]">
              {t('home.heroSubtitle')}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3.5">
              {user ? (
                <Link
                  to="/dashboard"
                  className={`inline-flex items-center gap-2.5 rounded-full bg-primary-600 px-8 py-4 text-[17px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(79,70,229,0.45)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-8px_rgba(79,70,229,0.55)] active:scale-[0.98] ${focusRing}`}
                >
                  {t('nav.dashboard')} <span aria-hidden>→</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className={`inline-flex items-center gap-2.5 rounded-full bg-primary-600 px-8 py-4 text-[17px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(79,70,229,0.45)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-8px_rgba(79,70,229,0.55)] active:scale-[0.98] ${focusRing}`}
                >
                  {t('home.heroCta')} <span aria-hidden>→</span>
                </button>
              )}
              <a
                href="#day"
                className={`inline-flex items-center gap-2.5 rounded-full border-[1.5px] border-ink/20 px-[26px] py-4 text-[17px] font-semibold text-ink transition-colors hover:border-ink ${focusRing}`}
              >
                {t('home.heroCta2')}
              </a>
            </div>
            <p className="mt-[26px] text-[15px] text-ink/65">
              <span className="font-bold text-ink">{t('home.stat1Num')}</span> {t('home.stat1Text')} ·{' '}
              <span className="font-bold text-ink">{t('home.stat2Num')}</span> {t('home.stat2Text')} ·{' '}
              {t('home.stat3')}
            </p>
          </div>
          <HeroVisual />
        </div>
      </header>

      {/* ═══ Marquee ═══ */}
      <div
        aria-hidden
        className="overflow-hidden whitespace-nowrap border-y border-ink/10 bg-ink py-3.5 text-paper"
      >
        <div className="inline-flex gap-12 pr-12 [animation:mkt-marquee_26s_linear_infinite]">
          {[0, 1].map((copy) => (
            <React.Fragment key={copy}>
              {marquee.map((label, i) => (
                <React.Fragment key={i}>
                  <span className="font-marketing-display text-sm font-semibold">{label}</span>
                  <span className="text-amber-500">✳</span>
                </React.Fragment>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ═══ One day with SabakHub ═══ */}
      <section id="day" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-16 pt-16 sm:px-8 sm:pt-[104px]">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">{t('home.dayEyebrow')}</p>
        <h2 className="mt-[18px] max-w-[22ch] text-balance font-marketing-display text-[clamp(26px,3vw,42px)] font-bold leading-[1.15]">
          {t('home.dayTitle')}
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 sm:gap-5 lg:mt-14 xl:grid-cols-4">
          {days.map((d) => (
            <article
              key={d.time}
              className={`rounded-3xl p-7 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5 ${
                d.dark
                  ? 'bg-ink text-paper hover:shadow-[0_20px_40px_-20px_rgba(22,20,31,0.45)]'
                  : 'border border-ink/5 bg-white hover:shadow-[0_20px_40px_-20px_rgba(22,20,31,0.25)]'
              }`}
            >
              <p className={`font-marketing-display text-[26px] font-bold ${d.dark ? 'text-amber-500' : 'text-primary-600'}`}>
                {d.time}
              </p>
              <h3 className="mt-3.5 text-[17px] font-semibold">{d.title}</h3>
              <p className={`mt-2.5 text-[15px] leading-relaxed ${d.dark ? 'text-paper/70' : 'text-ink/65'}`}>
                {d.desc}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ═══ Institution switcher ═══ */}
      <section id="fit" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-16 pt-16 sm:px-8 sm:pb-[104px]">
        <div className="rounded-[28px] border border-ink/5 bg-white p-6 sm:rounded-[32px] sm:p-10 lg:p-14">
          <div className="grid items-start gap-9 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">{t('home.fitEyebrow')}</p>
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
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border-[1.5px] px-5 py-4 text-left text-base font-semibold transition-colors ${focusRing} ${
                        selected
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-ink/10 bg-white hover:border-ink/30'
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
                    <div key={row.label} className="flex items-center justify-between rounded-[14px] bg-white px-5 py-4">
                      <span className="text-[15px] text-ink/65">{row.label}</span>
                      <span className="font-bold">{row.value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-[22px] text-sm leading-[1.55] text-ink/65">{t(`home.fitNote${suffix}`)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Pricing ═══ */}
      <section id="pricing" className="scroll-mt-0 bg-ink px-5 py-16 text-paper sm:px-8 sm:py-[104px]">
        <div className="mx-auto max-w-[1240px]">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-500">{t('home.priceEyebrow')}</p>
          <div className="flex flex-wrap items-end justify-between gap-8">
            <h2 className="mt-[18px] max-w-[20ch] text-balance font-marketing-display text-[clamp(26px,3vw,42px)] font-bold leading-[1.15]">
              {t('home.priceTitle')}
            </h2>
            <p className="max-w-[36ch] text-[15px] text-paper/60">{t('home.priceDesc')}</p>
          </div>
          <div className="mt-10 grid items-stretch gap-5 min-[900px]:grid-cols-3 lg:mt-14">
            {[
              { name: t('home.plan1Name'), price: t('home.plan1Price'), desc: t('home.plan1Desc'), cta: t('home.plan1Cta') },
              { name: t('home.plan2Name'), price: t('home.plan2Price'), desc: t('home.plan2Desc'), cta: t('home.plan2Cta'), popular: true },
              { name: t('home.plan3Name'), price: t('home.plan3Price'), desc: t('home.plan3Desc'), cta: t('home.plan3Cta') },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-[28px] p-7 sm:p-9 ${
                  plan.popular
                    ? 'relative bg-paper text-ink shadow-[0_30px_60px_-24px_rgba(0,0,0,0.5)] min-[900px]:-translate-y-3.5'
                    : 'border border-paper/15'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-[13px] left-9 rounded-full bg-amber-500 px-3.5 py-[5px] text-xs font-bold text-ink">
                    {t('home.planPopular')}
                  </span>
                )}
                <h3 className="text-[17px] font-semibold">{plan.name}</h3>
                <p className="mt-[22px] font-marketing-display text-[40px] font-bold leading-none">
                  {plan.price}{' '}
                  <span className={`text-[15px] font-normal ${plan.popular ? 'text-ink/60' : 'text-paper/60'}`}>
                    {t('home.pricePer')}
                  </span>
                </p>
                <p className={`mt-[18px] text-[15px] leading-relaxed ${plan.popular ? 'text-ink/70' : 'text-paper/70'}`}>
                  {plan.desc}
                </p>
                <div className="mt-auto pt-7">
                  <button
                    type="button"
                    onClick={() => setDemoOpen(true)}
                    className={`block w-full rounded-full py-3.5 text-center text-[15px] font-semibold transition-colors ${
                      plan.popular
                        ? `bg-primary-600 text-white shadow-[0_12px_24px_-8px_rgba(79,70,229,0.5)] hover:bg-primary-700 ${focusRing}`
                        : `border-[1.5px] border-paper/35 text-paper hover:border-paper ${focusRingDark}`
                    }`}
                  >
                    <span className="sr-only">{plan.name}: </span>
                    {plan.cta}
                  </button>
                </div>
              </div>
            ))}
          </div>
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
                  onClick={() => setOpenFaq(open ? null : i)}
                  className={`flex w-full items-center justify-between gap-5 py-6 text-left text-[17px] font-semibold sm:text-lg ${focusRing}`}
                >
                  {faq.q}
                  <span aria-hidden className="font-marketing-display text-xl text-primary-600">
                    {open ? '−' : '+'}
                  </span>
                </button>
                <div className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <p className={`overflow-hidden pr-10 leading-[1.65] text-ink/70 ${open ? 'pb-6' : ''}`}>{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section id="cta" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-16 sm:px-8 sm:pb-[104px]">
        <div className="relative overflow-hidden rounded-[28px] bg-primary-600 p-7 text-white sm:rounded-[36px] sm:px-16 sm:py-[72px]">
          <div aria-hidden className="absolute -right-20 -top-20 h-[340px] w-[340px] rounded-full bg-white/[0.08]" />
          <div aria-hidden className="absolute -bottom-[120px] right-[60px] h-[260px] w-[260px] rounded-full bg-amber-500/25" />
          <div className="relative max-w-[60ch]">
            <h2 className="text-balance font-marketing-display text-[clamp(26px,3.2vw,44px)] font-bold leading-[1.12]">
              {t('home.ctaTitle')}
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-white/80">{t('home.ctaDesc')}</p>
            <div className="mt-[34px] flex flex-wrap gap-3.5">
              {user ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2.5 rounded-full bg-white px-[30px] py-4 text-base font-bold text-ink transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
                >
                  {t('nav.dashboard')} <span aria-hidden>→</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className="inline-flex items-center gap-2.5 rounded-full bg-white px-[30px] py-4 text-base font-bold text-ink transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
                >
                  {t('home.ctaBtn')} <span aria-hidden>→</span>
                </button>
              )}
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
      </section>

      <HomeFooter />

      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

/* ── Nav ── */
const HomeNav: React.FC<{ onDemo: () => void }> = ({ onDemo }) => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [open, setOpen] = useState(false);

  const anchors = [
    { href: '#day', label: t('home.navHow') },
    { href: '#fit', label: t('home.navFit') },
    { href: '#pricing', label: t('home.navPricing') },
    { href: '#faq', label: t('home.navFaq') },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-ink/[0.08] bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <Link to="/" className={`flex items-center gap-3 rounded-lg ${focusRing}`}>
          <img src="/icons/logo.png" alt="SabakHub" className="h-[34px] w-[34px] rounded-[9px]" />
          <span className="hidden font-marketing-display text-[17px] font-semibold min-[400px]:block">SabakHub</span>
        </Link>

        <div className="hidden items-center gap-7 text-[15px] lg:flex">
          {anchors.map((a) => (
            <a key={a.href} href={a.href} className={`rounded-lg text-ink/65 transition-colors hover:text-ink ${focusRing}`}>
              {a.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher compact />
          </div>
          {user ? (
            <Link
              to="/dashboard"
              className={`rounded-full bg-ink px-5 py-3 text-[15px] font-semibold text-paper transition-transform hover:scale-[1.03] ${focusRing}`}
            >
              {t('nav.dashboard')}
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className={`hidden rounded-lg px-3.5 py-2.5 text-[15px] text-ink/70 transition-colors hover:text-ink sm:block ${focusRing}`}
              >
                {t('home.navLogin')}
              </Link>
              <button
                type="button"
                onClick={onDemo}
                className={`rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-transform hover:scale-[1.03] sm:px-[22px] sm:py-3 sm:text-[15px] ${focusRing}`}
              >
                {t('home.navDemo')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Menu"
            className={`-mr-1 rounded-lg p-2 text-ink lg:hidden ${focusRing}`}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink/[0.08] bg-paper px-5 py-4 lg:hidden">
          {anchors.map((a) => (
            <a key={a.href} href={a.href} onClick={() => setOpen(false)} className="block py-2.5 text-[15px] font-medium text-ink/70">
              {a.label}
            </a>
          ))}
          {!user && (
            <Link to="/login" onClick={() => setOpen(false)} className="block py-2.5 text-[15px] font-medium text-ink/70 sm:hidden">
              {t('home.navLogin')}
            </Link>
          )}
          <div className="pt-3 sm:hidden">
            <LanguageSwitcher compact />
          </div>
        </div>
      )}
    </nav>
  );
};

/* ── Hero visual: paper card stack (decorative, fabricated data) ── */
const HeroVisual: React.FC = () => {
  const { t } = useTranslation();
  const students = [
    { init: t('home.visInit1'), name: t('home.visStudent1'), grade: '5', tone: 'bg-primary-50 text-primary-600' },
    { init: t('home.visInit2'), name: t('home.visStudent2'), grade: '4', tone: 'bg-amber-100 text-amber-700' },
    { init: t('home.visInit3'), name: t('home.visStudent3'), grade: null, tone: 'bg-violet-100 text-violet-600' },
  ];
  return (
    <div aria-hidden className="pointer-events-none relative mx-auto h-[420px] w-full max-w-[560px] select-none sm:h-[460px] lg:max-w-none">
      {/* deep paper sheet behind */}
      <div className="absolute -right-2.5 left-[30px] top-[30px] h-[380px] rotate-3 rounded-[28px] bg-paper-deep" />
      {/* group card */}
      <div className="absolute left-0 right-6 top-0 -rotate-[1.5deg] rounded-[28px] bg-white p-7 shadow-[0_30px_60px_-24px_rgba(22,20,31,0.25)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold">{t('home.visGroupTitle')}</span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {t('home.visLessonLive')}
          </span>
        </div>
        <div className="mt-5 flex flex-col gap-3">
          {students.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] font-bold ${s.tone}`}>
                {s.init}
              </span>
              <span className="flex-1 text-sm">{s.name}</span>
              {s.grade ? (
                <span className="text-[13px] font-bold text-emerald-600">{s.grade}</span>
              ) : (
                <span className="text-[13px] text-ink/40">—</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* telegram card */}
      <div className="absolute bottom-10 right-0 max-w-[270px] rotate-2 rounded-[22px] bg-ink p-5 px-6 text-paper shadow-[0_24px_48px_-20px_rgba(22,20,31,0.5)]">
        <p className="text-xs uppercase tracking-[0.1em] text-paper/60">{t('home.visTgLabel')}</p>
        <p className="mt-2.5 text-sm leading-normal">{t('home.visTgMsg')}</p>
      </div>
      {/* amber sticker */}
      <div className="absolute -left-2 bottom-0 -rotate-[4deg] rounded-[18px] bg-amber-500 px-5 py-3.5 text-ink shadow-[0_16px_32px_-14px_rgba(245,158,11,0.6)]">
        <p className="font-marketing-display text-[22px] font-bold">{t('home.visStickerNum')}</p>
        <p className="mt-0.5 text-[13px] font-medium">{t('home.visStickerText')}</p>
      </div>
    </div>
  );
};

/* ── Footer ── */
const HomeFooter: React.FC = () => {
  const { t } = useTranslation();
  const links = [
    { to: '/features', label: t('landing.navFeatures') },
    { to: '/docs', label: t('landing.navDocs') },
    { to: '/about', label: t('landing.navAbout') },
    { to: '/contact', label: t('landing.navContact') },
    { to: '/privacy', label: t('landing.footerPrivacy') },
    { to: '/terms', label: t('landing.footerTerms') },
  ];
  return (
    <footer className="border-t border-ink/10 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <img src="/icons/logo.png" alt="SabakHub" className="h-7 w-7 rounded-[7px]" />
            <span className="font-marketing-display text-[15px] font-semibold">SabakHub</span>
          </div>
          <p className="text-sm text-ink/65">
            <a href="mailto:hello@sabakhub.kg" className="transition-colors hover:text-ink">hello@sabakhub.kg</a>
            {' · '}
            <a href="tel:+996550308078" className="whitespace-nowrap transition-colors hover:text-ink">+996 550 308 078</a>
            {' · '}
            {t('home.footerCity')}
          </p>
          <p className="text-sm text-ink/60">© {new Date().getFullYear()} SabakHub</p>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-ink/[0.06] pt-6">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="text-sm text-ink/65 transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
          <span className="ms-auto">
            <LanguageSwitcher compact />
          </span>
        </div>
      </div>
    </footer>
  );
};

export default LandingPage;
