import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Wallet, ClipboardCheck, CalendarDays, Coins, Send, Sparkles, Network, Trophy, ArrowRight, Check, ChevronDown,
  Building2, Users, GraduationCap, HeartHandshake,
} from 'lucide-react';
import RequestDemoModal from '../../components/landing/RequestDemoModal';
import FolderCard, { type ArtRecipe } from '../../components/ui/FolderCard';
import TeamLanyardRail, { type LanyardMember } from '../../components/ui/TeamLanyardRail';
import { useTheme } from '../../contexts/ThemeContext';
import {
  Cta, MktNav, MktFooter, Reveal, focusRing, h2Cls, leadCls, primaryBtn, secondaryBtn, useScrolledPast,
} from '../../components/landing/LandingKit';
import {
  CountUp, DayStory, FitSwitcher, HeroChat, Struck, useInView, type InstId,
} from '../../components/landing/HomeScenes';

/* ──────────────────────────────────────────────────────────────
   SabakHub home page, in the app shell's language (Inter, slate
   neutrals, violet primary). Sections are grouped by whitespace and
   soft shadows rather than outlined boxes, and each idea is shown
   moving: the bot's morning chat, the day told by scrolling, the
   screen that re-labels itself for each kind of institution.
   ────────────────────────────────────────────────────────────── */

const FEATURES = [
  { n: 1, icon: Wallet },
  { n: 2, icon: ClipboardCheck },
  { n: 3, icon: CalendarDays },
  { n: 4, icon: Coins },
  { n: 5, icon: Send },
  { n: 6, icon: Sparkles },
  { n: 7, icon: Network },
  { n: 8, icon: Trophy },
];

const section = 'mx-auto max-w-[1200px] scroll-mt-20 px-4 sm:px-8';
const hairline = 'border-slate-200 dark:border-slate-700';

const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const [demoOpen, setDemoOpen] = useState(false);
  const [inst, setInst] = useState<InstId>('center');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  // Phone-only sticky CTA shows up once the hero's own button has scrolled away.
  const pastHero = useScrolledPast(640);

  const openDemo = () => setDemoOpen(true);
  // Terminology of the currently selected institution type flows into the
  // day-timeline copy and the switcher preview, mirroring the real product.
  const terms = {
    students: t(`terms.${inst}.students`),
    group: t(`terms.${inst}.group`),
  };

  const faqs = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ q: t(`home.faq${n}Q`), a: t(`home.faq${n}A`) }));

  // The director's morning opens the day: money first, then the teaching hours.
  const days = [
    { time: '07:30', title: t('home.day1Title'), desc: t('home.day1Desc') },
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
    <div className="min-h-screen overflow-x-clip bg-white text-slate-900 antialiased selection:bg-primary-600 selection:text-white dark:bg-slate-900 dark:text-slate-100">
      <MktNav anchors={anchors} onDemo={openDemo} />

      {/* ═══ Hero: the promise beside the bot's live morning chat ═══ */}
      <header className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 text-slate-300 dark:text-slate-700"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1.3px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(60% 70% at 78% 45%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(60% 70% at 78% 45%, black 20%, transparent 75%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 top-0 h-[620px] w-[620px] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgb(var(--color-primary-500, 139 92 246) / 0.14), transparent)' }}
        />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-4 pb-16 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:pb-24 lg:pt-20">
        <div>
          <p className="hero-rise mb-4 text-[14px] font-medium text-primary-600 dark:text-primary-400">{t('home.heroEyebrow')}</p>
          <HeroTitle />
          <p className={`hero-rise mt-5 max-w-[56ch] ${leadCls} sm:!text-[18px]`} style={{ animationDelay: '0.35s' }}>
            {t('home.heroSubtitle')}
          </p>
          <div className="hero-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '0.45s' }}>
            <Cta onFallback={openDemo} className={primaryBtn}>
              {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-4 w-4" />
            </Cta>
            <a href="#features" className={secondaryBtn}>
              {t('mkt.heroCta2')}
            </a>
          </div>
          <ul className="hero-rise mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-slate-600 dark:text-slate-400" style={{ animationDelay: '0.55s' }}>
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex items-center gap-1.5">
                <Check aria-hidden className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
                {t(`mkt.heroTrust${n}`)}
              </li>
            ))}
          </ul>
        </div>
        <div className="hero-rise" style={{ animationDelay: '0.3s' }}>
          <HeroChat />
        </div>
        </div>
      </header>

      {/* ═══ Proof: real numbers, counted up as they scroll in ═══ */}
      <section aria-label={t('mkt.statsLabel')} className={`${section} pt-2 sm:pt-6`}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4 lg:gap-x-10">
          {stats.map((s, i) => (
            <div key={i} className="flex flex-col-reverse justify-end gap-1.5">
              <dt className="max-w-[26ch] text-[14px] leading-snug text-slate-600 dark:text-slate-400">{s.label}</dt>
              <dd className="text-[clamp(28px,3vw,40px)] font-semibold leading-none tabular-nums tracking-[-0.03em]">
                <CountUp value={s.num} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ═══ Features: open columns, no boxes ═══ */}
      <section id="features" className={`${section} pt-20 sm:pt-28`}>
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <h2 className={`${h2Cls} max-w-[22ch]`}>{t('mkt.featTitle')}</h2>
            <Link
              to="/features"
              className={`group inline-flex items-center gap-1.5 rounded-md text-[14px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 ${focusRing}`}
            >
              {t('mkt.featAll')}
              <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
          {FEATURES.map(({ n, icon: Icon }, i) => (
            <Reveal key={n} delay={(i % 4) * 70}>
              <article>
                <Struck delay={(i % 4) * 90 + 250}>{t(`mkt.f${n}Old`)}</Struck>
                <h3 className="mt-1.5 flex items-center gap-2.5 text-[15px] font-semibold">
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
                  {t(`mkt.f${n}Title`)}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{t(`mkt.f${n}Desc`)}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ One day with SabakHub: scrolling moves the sun through a Tuesday ═══ */}
      <DayStory title={t('home.dayTitle')} days={days} />

      {/* ═══ Roles: one badge per person in the center, flip for what they see ═══ */}
      <RolesRail />

      {/* ═══ Institution switcher: one control re-labels the whole screen ═══ */}
      <FitSwitcher inst={inst} onChange={setInst} />

      {/* ═══ How we start: a real three-step sequence; the folder is step 2 ═══ */}
      <section id="start" className={`${section} py-16 sm:py-24`}>
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-20">
          <div>
            <Reveal>
              <h2 className={`${h2Cls} max-w-[22ch]`}>{t('mkt.startTitle')}</h2>
            </Reveal>
            <ol className={`mt-8 divide-y border-y ${hairline} divide-slate-200 dark:divide-slate-700`}>
              {steps.map((s, i) => (
                <li key={i}>
                  <Reveal delay={i * 80}>
                    <div className="grid grid-cols-[24px_1fr] gap-4 py-5">
                      <span
                        className={`mt-px flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
                          i === 1 ? 'bg-primary-600 text-white dark:bg-primary-500' : 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <h3 className="text-[16px] font-semibold">{s.title}</h3>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{s.desc}</p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
          <SheetsFolder />
        </div>
      </section>

      {/* ═══ Pricing ═══ */}
      <section id="pricing" className={`border-y bg-slate-50 px-4 py-16 sm:px-8 sm:py-24 dark:bg-slate-800/40 ${hairline}`}>
        <div className="mx-auto max-w-[1200px]">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <h2 className={`${h2Cls} max-w-[20ch]`}>{t('home.priceTitle')}</h2>
              <p className="max-w-[40ch] text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{t('home.priceDesc')}</p>
            </div>
          </Reveal>
          <div className="mt-8 grid items-stretch gap-4 sm:mt-10 min-[900px]:grid-cols-3">
            {[
              { name: t('home.plan1Name'), price: t('home.plan1Price'), desc: t('home.plan1Desc') },
              { name: t('home.plan2Name'), price: t('home.plan2Price'), desc: t('home.plan2Desc'), popular: true },
              { name: t('home.plan3Name'), price: t('home.plan3Price'), desc: t('home.plan3Desc') },
            ].map((plan, i) => (
              <Reveal key={plan.name} delay={i * 60} className="h-full">
                <div
                  className={`flex h-full flex-col rounded-lg border bg-white p-6 sm:p-7 dark:bg-slate-900 ${
                    plan.popular ? 'border-primary-600 ring-1 ring-primary-600 dark:border-primary-500 dark:ring-primary-500' : hairline
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold">{plan.name}</h3>
                    {plan.popular && (
                      <span className="inline-flex h-5 items-center rounded bg-primary-100 px-1.5 text-[12px] font-medium text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                        {t('home.planPopular')}
                      </span>
                    )}
                  </div>
                  <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-[36px] font-semibold leading-none tabular-nums tracking-[-0.03em]">{plan.price}</span>
                    <span className="text-[14px] text-slate-500 dark:text-slate-400">{t('home.pricePer')}</span>
                  </p>
                  <p className="mt-4 text-[14px] leading-relaxed text-slate-600 dark:text-slate-400">{plan.desc}</p>
                  <div className="mt-auto pt-6">
                    <Cta onFallback={openDemo} className={`${plan.popular ? primaryBtn : secondaryBtn} w-full`}>
                      {t('home.ctaPrimary')}
                    </Cta>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 flex items-start gap-2 text-[14px] text-slate-600 dark:text-slate-400">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {t('mkt.priceIncluded')}
          </p>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="mx-auto max-w-[840px] scroll-mt-20 px-4 py-16 sm:px-8 sm:py-24">
        <h2 className={h2Cls}>{t('home.faqTitle')}</h2>
        <div className={`mt-8 divide-y border-y ${hairline} divide-slate-200 dark:divide-slate-700`}>
          {faqs.map((faq, i) => {
            const open = openFaq === i;
            return (
              <div key={i}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpenFaq(open ? null : i)}
                  className={`flex w-full items-center justify-between gap-5 rounded-sm py-5 text-left text-[16px] font-medium ${focusRing}`}
                >
                  {faq.q}
                  <ChevronDown
                    aria-hidden
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                <div id={`faq-${i}`} className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <p className={`overflow-hidden pe-9 text-[15px] leading-[1.65] text-slate-600 dark:text-slate-400 ${open ? 'pb-5' : ''}`}>{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ CTA: the one place the brand colour carries the surface ═══ */}
      <section id="cta" className={`${section} pb-16 sm:pb-24`}>
        <Reveal>
          <div className="grid gap-8 rounded-3xl bg-primary-600 p-7 text-white sm:p-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12 lg:p-14 dark:bg-primary-700">
            <div className="max-w-[56ch]">
              <h2 className="text-balance text-[clamp(26px,3vw,40px)] font-semibold leading-[1.12] tracking-[-0.03em]">
                {t('home.ctaTitle')}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-white/85">{t('home.ctaDesc')}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Cta
                onFallback={openDemo}
                className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-md bg-white px-5 text-[15px] font-medium text-primary-700 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
              >
                {t('home.ctaPrimary')} <ArrowRight aria-hidden className="h-4 w-4" />
              </Cta>
              <a
                href="https://t.me/sabakhub_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center whitespace-nowrap rounded-md border border-white/40 px-5 text-[15px] font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
              >
                {t('home.ctaTg')}
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      <MktFooter />

      {/* Phone-only sticky CTA */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(17,18,20,0.25)] transition-transform duration-300 sm:hidden dark:bg-slate-900 ${
          pastHero && !demoOpen ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
        aria-hidden={!pastHero}
      >
        <Cta onFallback={openDemo} className={`${primaryBtn} w-full`}>
          {t('home.ctaPrimary')}
        </Cta>
      </div>

      <RequestDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
};

/* ── Hero headline: two sentences (the second in brand colour), each word rising
   out of its own mask. Punctuation lives in the strings. ── */
const HeroTitle: React.FC = () => {
  const { t } = useTranslation();
  const plain = t('home.heroTitle1').split(' ');
  const mark = t('home.heroTitleMark').split(' ');
  const words = [...plain.map((w) => ({ w, mark: false })), ...mark.map((w) => ({ w, mark: true }))];
  return (
    <h1 className="text-balance text-[clamp(34px,4.3vw,54px)] font-semibold leading-[1.06] tracking-[-0.035em]">
      {/* Real words, not an sr-only copy: crawlers and screen readers read the H1 once. */}
      <span>
        {words.map(({ w, mark: m }, i) => (
          <React.Fragment key={i}>
            <span className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
              <span
                className={`inline-block animate-[word-rise_0.9s_cubic-bezier(0.22,1,0.36,1)_both] ${m ? 'text-primary-600 dark:text-primary-400' : ''}`}
                style={{ animationDelay: `${0.08 + i * 0.08}s` }}
              >
                {w}
              </span>
            </span>{' '}
          </React.Fragment>
        ))}
      </span>
    </h1>
  );
};

/* The center's people as badges — real access roles (the cashier is a custom role
   without the finance overview), never invented staff. `anchor` is the /features section. */
const ROLES: { id: string; tone: LanyardMember['tone']; icon: React.ReactNode; anchor: string }[] = [
  { id: 'director', tone: 1, icon: <Building2 />, anchor: 'money' },
  { id: 'manager', tone: 3, icon: <Users />, anchor: 'schedule' },
  { id: 'cashier', tone: 2, icon: <Wallet />, anchor: 'money' },
  { id: 'teacher', tone: 4, icon: <ClipboardCheck />, anchor: 'study' },
  { id: 'student', tone: 5, icon: <GraduationCap />, anchor: 'study' },
  { id: 'parent', tone: 1, icon: <HeartHandshake />, anchor: 'parents' },
];

const RolesRail: React.FC = () => {
  const { t, i18n } = useTranslation();
  // Autoplay only while the rail is on screen, so its physics never runs in the background.
  const [ref, inView] = useInView<HTMLElement>(0.35);

  const items = useMemo<LanyardMember[]>(
    () =>
      ROLES.map(({ id, tone, icon, anchor }) => ({
        id,
        tone,
        icon,
        name: t(`mkt.roleCards.${id}.name`),
        role: t(`mkt.roleCards.${id}.role`),
        team: t(`mkt.roleCards.${id}.team`),
        bio: t(`mkt.roleCards.${id}.bio`),
        tags: t(`mkt.roleCards.${id}.tags`).split(' · '),
        links: [{ label: t('mkt.rolesMore'), href: `/features#${anchor}` }],
      })),
    [t, i18n.language],
  );

  return (
    <section ref={ref} id="roles" className={`${section} pt-16 sm:pt-24`}>
      <TeamLanyardRail
        items={items}
        heading={t('mkt.rolesTitle')}
        caption={t('mkt.rolesCaption')}
        autoplay={inView}
        labels={{ flip: t('mkt.rolesFlip'), back: t('mkt.rolesBack'), show: t('mkt.rolesShow'), rail: t('mkt.rolesRail') }}
      />
    </section>
  );
};

/* Brand-violet long exposure for the folder's back panel (the shell's primary ramp) */
const FOLDER_ART: ArtRecipe = {
  style: 'streak',
  colors: ['#f5f2fe', '#ddd6fe', '#b197fc', '#6d28d9', '#2b2149', '#8b5cf6', '#efe9fd'],
  scale: 0.7,
  warp: 1.4,
  angle: -0.62,
  gloss: 0.18,
};

/* ── Step 2 as an object: the center's spreadsheets go into SabakHub. «+» drops
   in the next one from the list, then the folder's own "Untitled" sheets. ── */
const SheetsFolder: React.FC = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const sheet = (n: number) => ({ name: t(`mkt.folderF${n}`), meta: t(`mkt.folderF${n}Meta`) });
  return (
    <figure className="mx-auto flex flex-col items-center lg:mx-0">
      <FolderCard
        label={t('mkt.folderLabel')}
        tone={isDark ? 'dark' : 'light'}
        art={FOLDER_ART}
        seed={7}
        width={320}
        files={[1, 2, 3].map(sheet)}
        onAdd={(files) => (files.length < 6 ? sheet(files.length + 1) : undefined)}
      />
      <figcaption className="mt-5 text-center text-[13px] text-slate-500 dark:text-slate-400">{t('mkt.folderHint')}</figcaption>
    </figure>
  );
};

export default LandingPage;
