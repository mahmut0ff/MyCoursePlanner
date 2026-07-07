# Product

## Register

brand

## Users

**Primary — the buyer.** Directors, owners, and academic managers of schools, training centers, and language academies, mostly in Russian-speaking Central Asia (Kyrgyz locale is shipped, so Kyrgyzstan is a core market). They reach the landing from ads, referrals, or search — skeptical, comparison-shopping, and frequently on a phone. They are not technical. What they actually want to know: *will this save my teachers time, keep parents informed, and make my institution look modern and organized?* They read in Russian first (Kyrgyz and English secondary).

**Secondary — the influencer.** Teachers and tutors who try the product and push for adoption. They want proof that grading, lessons, and exams get genuinely easier.

**Job to be done on the landing:** in under a minute, understand what SabakHub is, believe it is real and capable, and take one clear next step — start a trial, book a demo, or message on Telegram.

## Product Purpose

SabakHub is a multi-tenant education-management platform for schools, training centers, language academies, and online cohorts: lesson planning, exams (including live Kahoot-style quizzes), gradebooks and attendance, analytics, gamification, AI assistance, and Telegram bots — with terminology that adapts per institution type.

The landing page's job is narrower and specific: **turn a skeptical director's first visit into a trial signup or demo request.** It must communicate the value plainly, prove the product is real and polished, and build trust — Russian-first and excellent on mobile. Success is measured in signups and demo requests, not raw traffic.

**Scope note:** Impeccable is scoped to the public marketing/landing surface — `src/pages/LandingPage.tsx`, `FeaturesPage`, `AboutPage`, and pricing/contact. The authenticated app (dashboards, gradebook, live exams) is a separate *product*-register surface and is intentionally out of scope for these design commands.

## Brand Personality

**Warm, human, and credibly capable.** People-first: lead with real teachers and students thriving, not abstract feature grids. The voice is friendly, plain-spoken, and reassuring — a knowledgeable colleague, not a corporate vendor and not a hype machine. Confident without shouting; approachable without being childish.

Emotions to evoke, in order: **relief** ("this will make my school easier to run"), **pride** ("this makes us look modern"), and **trust** ("these people understand education"). Three words: *warm, human, trustworthy.*

## Anti-references

- **The generic AI-SaaS template.** Inter for everything, purple→blue/indigo gradients, glassmorphism, cards nested inside cards, a rounded-square icon tile above every heading, three-feature-columns-of-lucide-icons. SabakHub's landing must not look like every other SaaS starter — every choice should be one a default template wouldn't make.
- **Sterile enterprise.** Dense, gray, corporate-dashboard energy bolted onto a marketing page.
- **Faceless stock-photo B2B.** Cold, generic, no real people, no warmth — the opposite of the intended feel.

## Design Principles

1. **Show real people, not feature grids.** Lead with teachers, students, and directors in context. The landing should feel like education, not generic software.
2. **Earn trust in seconds.** A skeptical director decides fast. Prove it's real and capable — concrete outcomes, real product UI, social proof — before asking for anything in return.
3. **Speak Russian-first, plainly.** The primary audience reads Russian (plus Kyrgyz and English). Use plain, human language; localize rather than translate marketing-speak. Layouts must tolerate longer RU/KG strings.
4. **Distinctive, never template.** Deliberately reject the AI-SaaS default look. If a choice feels like the obvious starter-kit default, reconsider it.
5. **Mobile-first and inclusive.** Directors browse on phones. The landing must be excellent on small screens and meet the accessibility bar below.

## Accessibility & Inclusion

Target **WCAG 2.1 AA** for the landing: sufficient color contrast (watch gray-on-tint), visible keyboard focus states, semantic landmarks and correct heading order, meaningful alt text on imagery, and touch targets of at least 44px. Respect `prefers-reduced-motion` for any hero or scroll-driven animation. Never rely on color alone to convey meaning. Content is multilingual (Russian default, Kyrgyz, English) — verify layouts hold with the longest translations.
