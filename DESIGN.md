# MedBrains — UI/UX Design Brief

> **Purpose of this document.** It is a complete, self-contained description of the MedBrains web
> product: what it is, who uses it, every screen, the current design system, the real data each view
> renders, and an honest assessment of what is weak today. It is written to be handed to another
> model so it can author a precise implementation prompt for redesigning and improving the entire UI.
>
> Everything here describes the **current shipped state** (verified against the codebase), not
> aspiration. Sections marked **WEAKNESS** or **DECISION NEEDED** are where the redesign should act.

---

## 1. The product

**MedBrains** is an AI clinical-training web app for medical and nursing education.

A student walks into a virtual exam room and has a **real-time spoken conversation with an AI patient
avatar** (video + voice). The AI plays *the patient* — not a tutor, not an assistant. The student
practises history-taking, breaking bad news, and counseling. Afterwards the conversation transcript
is scored against a communication rubric, and the student gets per-criterion feedback with the exact
moments quoted back to them.

**One-line positioning:** *"A thousand patients before the first one."*
**Safety line that appears throughout the product:** *"Training, not diagnosis."*

### Who uses it

| Role | What they do | Primary needs |
|---|---|---|
| **Student** (med/nursing student) | Practises encounters, reviews feedback, tracks improvement | Low-friction entry into an encounter; unambiguous feedback; a sense of progress; no anxiety-inducing framing |
| **Educator** (faculty) | Authors cases, assigns to cohorts, monitors cohort performance | See who's struggling and *on which specific skill*; author a case without writing prompts; act in one click |
| **Admin / Owner** | Same as educator plus org management | (Currently treated identically to educator in the UI) |

### Domain constraints that shape the design — these are not decoration

1. **Formative, never summative.** No pass/fail, no grades, no leaderboards, no ranking students
   against each other publicly. Scores exist to guide practice. Unlimited retries are a *feature* and
   should feel encouraged, not remedial.
2. **The product is never a clinician.** It never diagnoses, never advises. The patient avatar is
   architecturally scope-guarded. UI copy must never imply diagnostic capability.
3. **Emotionally serious content.** Cases include breaking bad news, terminal diagnoses, distressed
   patients. The tone must be calm and respectful — never playful, gamified, or celebratory in a way
   that trivialises the subject. No confetti. No "streaks." No cartoon mascots.
4. **Accessibility is a hard requirement**, not a nice-to-have. Educational institutions procure
   against it. Target WCAG 2.1 AA minimum (AAA for body text contrast where feasible).
5. **Trust signalling matters.** Institutional buyers need the product to look clinical-grade and
   credible, not like a consumer app.

---

## 2. Technical constraints (the redesign must work within these)

| Concern | Constraint |
|---|---|
| Framework | **Next.js 14 App Router**, all screens are `"use client"` components |
| Language | **TypeScript**, strict |
| Styling | **Tailwind CSS** + CSS custom properties. No CSS-in-JS |
| Components | **shadcn/ui** primitives present: `button`, `dialog`, `tabs`, `tooltip`, `skeleton` |
| Icons | **lucide-react** only. **No emoji as icons — ever** |
| Fonts | **Geist Sans** + **Geist Mono** (loaded via the `geist` package as CSS vars) |
| Motion | **framer-motion v11** available and used |
| Theming | **next-themes**, class strategy (`.dark`), user-toggleable |
| Charts | **Hand-rolled SVG** (see §6). No chart library is installed — adding one is allowed but must be justified |
| Data | Real REST API (Django). Every screen renders live data — see §7 for exact shapes |
| Images | **No stock photography anywhere.** This was a deliberate reversal after an earlier attempt looked templated |

---

## 3. Current design tokens (exact values, both themes)

Defined in `app/globals.css` as CSS custom properties; Tailwind maps them in `tailwind.config.ts`.
The palette is internally called **"Aqua Noir"** and is inherited from the sibling product
TalentBrains so the company portfolio feels related.

### Light theme (`:root`)
```
--bg:#F4F8F7        --surface:#FFFFFF     --elevated:#EEF4F2    --border:#DCE7E4
--text:#0C1413      --muted:#4F5E5A
--primary:#00B89C   --primary-hover:#00A98C   --on-primary:#04110F
--link:#078573      --accent:#02716D      --accent-soft:#E2F2EE
--success:#059669   --warn:#D97706        --error:#DC2626
--ink:#0C1413       --on-ink:#F4F8F7      --on-ink-muted:rgba(244,248,247,0.62)
--hairline: rgba(2,23,21,0.04)            --shadow-color: rgba(2,23,21,0.18)
--radius: 0.75rem
```

### Dark theme (`.dark`)
```
--bg:#060B0B        --surface:#0E1717     --elevated:#15201F    --border:#21302E
--text:#E8EDEC      --muted:#9DB0AD
--primary:#00E6C3   --primary-hover:#2FF0D4   --on-primary:#04110F
--link:#7CF5E0      --accent:#14B8A6      --accent-soft:#0E2422
--success:#34D399   --warn:#FBBF24        --error:#F87171
--ink:#101B1A       --on-ink:#E8EDEC      --on-ink-muted:rgba(232,237,236,0.6)
--hairline: rgba(255,255,255,0.06)        --shadow-color: rgba(0,0,0,0.6)
```

### Important token semantics
- `--accent` is the **deep readable teal for text**. `--accent-soft` is a **pale background tint**.
  Using `--accent-soft` for text produces unreadable text — this bug happened once already.
- `--ink` / `--on-ink` exist because inverted "dark card on light page" surfaces (featured pricing
  card, CTA bands, primary buttons) must **stay dark in both themes**. Using `foreground`/`background`
  for these causes them to flip to blinding white in dark mode — this bug also happened already.

### Type, shape, elevation
- **Sans:** Geist Sans. **Mono:** Geist Mono — used for labels, metrics, timestamps, and
  eyebrow/kicker text, always `uppercase` with `tracking-[0.15em]` at 9–11px.
- **Headings:** tight tracking (`-0.02em` to `-0.03em`), semibold (600), leading 1.05–1.1.
- **Radii:** cards `1rem`–`1.5rem` (`rounded-2xl`), section shells `2rem`, pills/buttons full.
- **Shadows:** only two — `shadow-soft` (resting) and `shadow-lift` (hover/elevated). Both include a
  1px inset hairline highlight.
- **Container:** `max-w-[1240px]` for marketing, `max-w-6xl` for app screens.

### Motion conventions currently in use
- Easing `cubic-bezier(0.22, 1, 0.36, 1)` for entrances; springs (`stiffness ~320, damping ~22`) for
  hover lift.
- Scroll-triggered reveals via `useInView` (once), staggered ~60ms per card.
- `prefers-reduced-motion` is respected everywhere — **this must be preserved**.

---

## 4. Complete screen inventory

### Public
| Route | Purpose |
|---|---|
| `/` | Marketing landing page |
| `/login` | Sign in |
| `/signup` | Create an organisation workspace |

### Authenticated app (shared shell at `/app/*`)
| Route | Role | Purpose |
|---|---|---|
| `/app` | both | Role-routed dashboard (educator vs student) |
| `/app/practice` | student | Full case library with category filters + search |
| `/app/progress` | student | Score history and per-domain averages |
| `/app/cases` | educator | Case list, review status, publish action |
| `/app/cases/new` | educator | Create a case (structured editor) |
| `/app/cases/[id]/edit` | educator | Edit a case |
| `/app/rubrics` | educator | Read-only rubric viewer |
| `/app/cohorts` | educator | Cohorts + create assignment |
| `/app/analytics` | educator | Summary + student×criterion heatmap |
| `/app/cases/[id]/prebrief` | student | Objectives + door note before entering |
| `/app/encounters/[id]/room` | student | **The live voice/video encounter** |
| `/app/encounters/[id]` | student | Debrief → feedback |

---

## 5. Screen-by-screen detail

### 5.1 Landing (`/`)
Sections in order: sticky nav that condenses into a floating glass pill on scroll → hero → bento
feature grid (3 modules) → "how it works" 3 steps → evidence stats + marquee → platform capability
fan-out → pricing (3 tiers, monthly/annual toggle) → dark closing CTA band → footer.

Hero contains a **crafted product mock** (a fake encounter card with patient identity, dialogue
bubbles, an animated voice waveform, plus floating "Empathy 4/5" and "4.7/6 authenticity" chips).

**WEAKNESS:** It reads as competent-but-generic modern SaaS. It doesn't yet feel like a *medical
education* product — nothing about the visual language says clinical credibility. The bento and steps
sections are the weakest. Went through three iterations; user feedback across them: *"not looking
like a real product"*, *"the hero section is soo bad"*, *"still not as good as TalentBrains."*

### 5.2 Auth (`/login`, `/signup`)
Currently a **single centred card on an empty background**. Functional, plain.
**WEAKNESS:** No brand presence, no reassurance, no context. `globals.css` contains unused
`.auth-card` / `.auth-log-line` animation classes implying a two-panel layout (form + animated brand
panel) that **was never built**. Strong candidate for redesign.

### 5.3 App shell (`/app/*`)
Sticky 240px sidebar (logo, role-specific nav, user identity, sign out) + sticky top bar (blurred,
carries the persistent `TRAINING SIMULATION · NOT MEDICAL ADVICE` disclaimer + theme toggle). Mobile
collapses to a hamburger drawer.

**Nav differs by role:**
- Student: Home · Practice library · My progress
- Educator: Dashboard · Cases · Rubrics · Cohorts · Analytics

**WEAKNESS:** Nav is flat and unlabelled by group. There is no breadcrumb, no page-title region, no
global search, no notifications, no command palette. The top bar wastes its width on a static
disclaimer.

### 5.4 Educator dashboard
4 KPI tiles (scored encounters, avg score with delta badge, active students, publish backlog — the
last turns amber when cases await publishing) · cohort **score-trend area chart** with hover
crosshair · 4 **radial rings** for per-domain averages · recent-encounter list with initials avatars,
relative timestamps, score, status chip · **weakest-criteria panel** with sparklines and animated
bars · case-library and cohort snapshot cards.

### 5.5 Student dashboard
4 stat tiles (encounters run, last score + trend vs previous, personal best + average, weakest domain
as "focus area") · **clickable score-journey chart** (clicking a point opens that attempt's feedback)
· resume banner when an encounter is unfinished · assigned cases · practice library (excluding
already-assigned).

**WEAKNESS (both dashboards):** They are *informative* but visually uniform — a grid of same-weight
rounded cards. No strong hierarchy telling the user where to look first. No empty-state art. No
time-range filter. No density/comfort control.

### 5.6 Pre-brief (`/app/cases/[id]/prebrief`)
Learning objectives list + a **door-note card** (dashed border, mimicking the note on a real exam-room
door) + "Enter the encounter" + safety chips.
**This is the strongest screen conceptually** — it borrows a real clinical ritual. Worth extending
that idea elsewhere.

### 5.7 Encounter room (`/app/encounters/[id]/room`) — **the most important screen**
Two-column: 16:9 avatar video (LiveKit) with a status/timer bar, mic toggle, End Encounter · right
column has a live transcript panel and a private notes textarea.

**WEAKNESS — this is the flagship experience and it looks like a generic video-call UI.** It should
feel like *stepping into a room with a person*. Currently: a black rectangle, a plain header, and two
boxes. No sense of presence, no visual indication the patient is listening vs speaking vs upset, no
elegant handling of the pre-connection wait, no framing that reinforces "this is a clinical encounter,
take it seriously."

### 5.8 Debrief → feedback (`/app/encounters/[id]`)
Deliberate two-stage flow: **reflection questions first**, then a "Reveal my feedback" button — the
score is withheld until the student has reflected. Then: global score, per-domain bars, criterion
list with ✓/⚠ and **quoted transcript evidence** plus suggested phrasing for misses, humanistic-care
panel, percentile, **Try Again**.

**The evidence quoting is the single most valuable feature in the product and is currently
under-designed** — quotes are small italic text with a left border. They should be the hero.

### 5.9 Case editor (`/app/cases/new`, `.../edit`)
Structured form (never a free-text prompt — this is a safety property): identity/category/difficulty/
affect · door-note fields · **repeatable history-fact rows** each with a "Freely shared / Only if
asked" toggle · disclosure rules · objectives. Publish is gated server-side on a complete door note
+ ≥3 history facts.
**WEAKNESS:** A long single-column form. No sectioned progress, no preview of how the patient will
behave, no validation feedback before submit.

### 5.10 Analytics
Summary tiles + **student × criterion heatmap** (cohort selector, clickable cells revealing the
underlying encounters).
**WEAKNESS:** The heatmap has no legend, no sorting, no ability to pivot, and small tap targets.

---

## 6. Component inventory

```
components/
  case-form.tsx            structured case editor
  dashboard-educator.tsx   educator dashboard
  dashboard-student.tsx    student dashboard + CaseCard (exported, reused in /app/practice)
  theme-provider.tsx       next-themes wrapper
  ui/
    viz.tsx                ← custom visualisation primitives (below)
    animated-group.tsx     staggered blur-slide entrance container
    button.tsx  dialog.tsx  tabs.tsx  tooltip.tsx  skeleton.tsx   (shadcn/ui)
```

### `ui/viz.tsx` — hand-rolled SVG, no chart dependency
| Export | Behaviour |
|---|---|
| `CountUp` | Spring number count-up when scrolled into view |
| `AreaChart` | Catmull-Rom smoothed area, animated path draw, gridlines, hover crosshair + tooltip, optional per-point click |
| `RadialProgress` | Ring that draws itself in view, warn tone below threshold |
| `Sparkline` | Inline row-level trend, coloured by direction |
| `Stagger` | Staggered card entrance wrapper |

All read colours from CSS vars (`var(--primary)` etc.) so they theme automatically, and all check
`useReducedMotion()`.

---

## 7. Real data available to render

The API is live; these are the actual shapes (`lib/api.ts`). A redesign must render **these** — not
invented fields.

```ts
User        { id, email, name, organization: { id, name, role } }
Role        "owner" | "admin" | "educator" | "student"

Case        { id, title, category: "history_taking"|"breaking_bad_news"|"counseling",
              difficulty: "intro"|"core"|"advanced", affect: string,
              door_note: { name, age, setting, presenting_complaint },
              background, history_facts: [{ topic, fact, reveal_only_if_asked }],
              disclosure_rules, learning_objectives: string[],
              review_status: "draft"|"pending_clinical_review"|"published", distressing }

Rubric      { id, name, domains: [{ id, label, weight, items: [{ id, label, kind:"likert"|"checklist" }] }] }
Cohort      { id, name, memberships: [...] }
Assignment  { id, case, rubric, cohort, due_at }
MyAssignment{ id, case:{ id, title }, rubricId, dueAt, status }     // student view

Encounter   { id, case, case_title, student, student_name,
              status: "created"|"live"|"ended"|"evaluated",
              transcript, started_at, ended_at, duration_seconds, created_at, evaluation }

Evaluation  { id, global_score /*0-100*/, domain_scores: Record<string, number>,
              criterion_results: [{ criterion_id, label, kind, score /*0-4*/, met,
                                    evidence_quotes: string[], recommended_phrasing }],
              humanistic: Record<string,{ analysis, suggestion }>, percentile }

Progress    { encounters: [{ id, createdAt, globalScore, domainScores }] }
Summary     { evaluations, average_global_score, by_domain }
Heatmap     { students:[{id,name}], criteria:[{id,label}], cells:[{student,criterion,avg_score,encounter_ids}] }
LivekitJoin { url, token, room, identity }
```

**Seeded demo content** (`manage.py seed_demo` + `seed_activity`): 3 published cases — *Chest pain
history* (history-taking, core), *Biopsy result* (breaking bad news, advanced), *Starting insulin*
(counseling, core); one 5-domain Calgary-Cambridge rubric; 1 cohort, 3 students, 12 scored encounters
trending upward. Demo logins: `educator@medbrains.demo` / `student1@medbrains.demo`, password
`MedBrains123!`.

---

## 8. Known issues and inconsistencies to resolve

1. **Theme default conflict.** `globals.css` header comment says *"Dark is the brand default
   (next-themes defaultTheme='dark')"* but `app/layout.tsx` sets `defaultTheme="light"`.
   **DECISION NEEDED:** which is the brand default? The comment implies a dark-first "bold dark-tech"
   identity was intended; the implementation is light-first.
2. **Dead CSS.** `.auth-card`, `.auth-log-line`, `@keyframes auth-rise/auth-log-in`, and `.bg-grid`
   exist in `globals.css` but are **unused** — evidence of an intended auth/hero treatment never built.
3. **Print styles** exist for exporting an evaluation (`@media print` hides `aside/header/nav`) but no
   UI exposes an export/print action.
4. **`AnimatedGroup`** is only used on the landing page; dashboards use `Stagger` instead — two
   overlapping entrance systems.
5. **Role handling:** `owner`/`admin` are visually identical to `educator`; no org-management surface
   exists.
6. **No empty-state design.** Empty lists fall back to a plain sentence in a bordered box.
7. **No global loading identity** — each screen improvises its own skeletons.
8. **Marketing and app feel like different products.** The landing is expressive; the app is plain.

---

## 9. What "improve" should mean — the redesign brief

### Goals, in priority order
1. **Make the encounter room feel like a room.** It is the product. It should convey presence,
   listening state, and clinical seriousness — not a video call.
2. **Make feedback feel like coaching, not grading.** The quoted transcript evidence is the crown
   jewel; design around it. Reinforce that retrying is the point.
3. **Give the app screens the same design confidence as the landing page** — one coherent product.
4. **Establish real visual hierarchy on dashboards.** The user should know instantly what needs their
   attention; today every card has equal weight.
5. **Design the states nobody designed:** empty, loading, error, first-run, offline/disconnected,
   permission-denied (microphone!), and long-content overflow.
6. **Make it unmistakably medical-education** — credible to a university procurement committee —
   without resorting to clichés (no stethoscope-on-desk stock photos, no green cross, no ECG-line
   decoration used purely as ornament).

### Explicit anti-goals
- No gamification: no confetti, badges, streaks, leaderboards, XP.
- No emoji as UI icons.
- No stock photography.
- No AI-slop visual clichés: purple/pink gradients, neon glow, glassmorphism everywhere, floating 3D
  blobs, "sparkle" icons on every AI feature.
- Nothing that implies diagnostic capability or clinical authority.
- Do not remove the persistent training/safety disclaimer.
- Do not break `prefers-reduced-motion`, keyboard navigation, or focus visibility.

### Hard requirements for any redesign
- Keep the **teal Aqua Noir palette family** (portfolio consistency with TalentBrains). Refining
  shades is fine; switching to a different hue family is not.
- Keep **Geist Sans/Mono** unless there is a strong, stated typographic argument.
- Both **light and dark themes must be fully designed** — dark is not an afterthought; verify every
  inverted surface (see the `--ink` note in §3).
- **Responsive at 375 / 768 / 1024 / 1440.** Verify zero horizontal overflow at 375.
- Contrast: body text ≥ 4.5:1, large text ≥ 3:1, in **both** themes.
- Every interactive element: `cursor-pointer`, visible focus ring, hover transition 150–300ms.
- Tables/heatmaps/wide content scroll inside their own container — the page body never scrolls
  horizontally.
- Render the **real data shapes in §7**. No invented fields.

### Deliverable expected from the redesign
A full-UI pass covering: landing, auth, app shell, both dashboards, practice library, progress,
pre-brief, **encounter room**, debrief/feedback, case editor, rubrics, cohorts, analytics — as
working Next.js/TypeScript/Tailwind code consistent with §2, with a short rationale for the visual
direction chosen.

---

## 10. Repository map

```
Medbrains/
  medfrontend/                  Next.js 14 app  (github.com/Coding-The-Brains/MedBrains_frontend)
    app/                        routes (§4)
    components/                 §6
    lib/api.ts                  typed API client — authoritative data shapes (§7)
    lib/use-me.tsx              current user + role capabilities
    app/globals.css             design tokens (§3)
    tailwind.config.ts          token → Tailwind mapping
  medbackend/                   Django REST API  (github.com/Farukhthegreat/MedBrians_backend)
  PRODUCT_BLUEPRINT.md          domain research: clinical-sim UX conventions, scoring model, safety
  DESIGN.md                     this file
```

Run locally: backend `python manage.py runserver 8010`, frontend `npm run dev` → `localhost:3000`
(the frontend proxies `/django/*` → `:8010`, so no CORS setup).

---

## 11. Context worth knowing

- MedBrains is the **second product** on an internal platform called **AvatarOS** (real-time voice,
  memory, knowledge, avatar orchestration). The first is **TalentBrains** (AI interviewer), which is
  where the palette comes from. A third-party looking at both should sense a family resemblance.
- The avatar video/voice is real and works — it is not a mock. The patient is played by an LLM
  constrained to a structured case record, which is why the case editor is structured rather than
  prompt-based.
- The product has been through **three landing-page iterations** already. Feedback each time centred
  on it feeling generic/templated rather than on any specific element — so the redesign should aim
  for a distinctive, defensible visual point of view rather than another safe SaaS layout.
