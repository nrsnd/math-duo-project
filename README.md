# MathDuo Project
### Bambang Nursandi Aug 2025

This document maps the delivered solution to the brief, point by point, and lists time spent, trade‑offs, and what was intentionally not built within the time box.

---
## Key Features
- **Lessons & Problems**: MCQ + input answers. No correct answers sent to the frontend.
- **XP & Streak**: +10 XP per correct answer. Streak increments on a new UTC day with activity; resets if a day is missed.
- **Idempotent Submissions**: `attempt_id` enforces idempotency for lesson and adaptive submits.
- **Adaptive Practice**: Prioritizes unsolved problems; returns explanations after submit.
- **Transactions & Integrity**: XP/streak/progress updates within a transaction; proper FKs and indexes.
- **Mobile-first UI**: Optimized for 390px width.

---

## Time Limit (5–7 hours), Time Spent & Trade‑offs

**Total time:** ~6 hours
- Schema & migrations: ~45 min
- Endpoints & idempotency: ~2 hrs
- Streak/XP logic & transactions: ~45 min
- Frontend (list/lesson/results/profile) + loading/error states: ~2 hrs
- Postman + Docker + docs: ~30 min

**Trade‑offs & judgment:**
- Used **raw SQL migrations** instead of an ORM for speed and explicit control.
- Focused on **correctness and reliability** (idempotency, validation, transactional safety) over animations/polish.
- Tracked per‑problem mastery in **`user_progress.correct_map` (JSONB)** for simple, fast delivery; can normalize later for analytics.

**Not built (by design within time box):**
- Rate limiting, observability/metrics, accessibility audit, localization, SSO/auth.
- Gamification extras (badges/leaderboards), advanced animations.
- CI workflows

---

## Identity & Users

- **Demo user only:** `user_id = 1`. No authentication (per brief).
- **Multi‑user ready:** All tables/API operations are keyed by `user_id` with proper FKs and PKs, enabling multi‑tenant expansion later.

---

## XP, Streak & Idempotency Rules

**XP scoring**
- **10 XP per correct problem** (constant defined as `XP_PER_CORRECT` in the server).

**Streak logic (UTC)**
- First activity → `current_streak = 1`.
- Activity on the **same UTC day** as `last_activity_date` → streak unchanged.
- Activity on the **next UTC day** → `current_streak + 1`.
- If a day is missed → **reset to 1**.

**Idempotency**
- **Lessons**: `(user_id, lesson_id, attempt_id)` is **unique** in `submissions`.
  - Re‑submitting the same `attempt_id` returns the **stored result**; XP is **not** double‑counted.
- **Adaptive**: `(user_id, attempt_id)` is **unique** in `practice_submissions` with identical behavior.
- Payload validation ensures answers reference the target lesson and MCQ options are valid for that problem.

---

## Technical Requirements

### Backend (Node.js + Express + PostgreSQL)
**Endpoints**
- `GET /api/lessons` — lessons with progress (solved/total/percent/completed).
- `GET /api/lessons/:id` — lesson + problems (**does not leak** correct answers).
- `POST /api/lessons/:id/submit` — accepts `{ attempt_id, answers[] }`; returns XP gained, total XP, streak, lesson_progress, and per‑question results. **Idempotent**.
- `GET /api/profile` — `{ total_xp, current_streak, best_streak, progress_percentage }`.

**Validation & errors**
- Zod input schema; **400** invalid params, **404** not found, **422** schema/option‑membership errors, **409** duplicate `attempt_id`.

**Transaction safety**
- XP, streak, and progress updates are applied inside a **single transaction** with `FOR UPDATE` row‑locks on `users` and `user_progress` to avoid race conditions.

**Migrations & seed**
- Raw SQL migrations with supportive indexes.
- **Seed** includes the three required lessons; **idempotent** (skips seeding if data exists).

### Frontend (React + Vite)
- **Lesson List:** progress indicator (bar + percent, completed flag).
- **Lesson Interface:** interactive MCQ and numeric input controls; loading/error handling.
- **Results Screen:** XP gained, total XP, streak status (`incremented | reset | no_change`), progress bar; **per‑question explanations** shown post‑submit.
- **Profile/Stats:** total XP, current/best streak, overall progress %.
- **Mobile‑first:** built and verified at **390px** width.

### Tooling to ease review
- **Postman** collection + **local environment** provided.
- **Docker Compose** brings up Postgres + server + web with one command.

---

## Database Schema, Integrity & Starter Data

**Tables (as required):**
- `users` — id, username, total_xp, current_streak, best_streak, last_activity_date, timestamps.
- `lessons` — id, title, description, order_index.
- `problems` — id, lesson_id (FK), type `('mcq'|'input')`, prompt, answer_text, **explanation_text**.
- `problem_options` — id, problem_id (FK), label, is_correct (**partial unique** per problem to ensure a single correct MCQ option).
- `user_progress` — PK `(user_id, lesson_id)`, `correct_map` (JSONB), solved_count, total_count, updated_at.
- `submissions` — unique `(user_id, lesson_id, attempt_id)`, answers/result JSONB, xp_awarded, correct_count, submitted_at.
- `practice_submissions` — unique `(user_id, attempt_id)` for adaptive mode.

**Indexes & constraints:**
- FKs on all relations, supportive indexes (`idx_lessons_order`, `idx_problems_lesson`, `idx_options_problem`).
- Partial unique index on `problem_options(problem_id) WHERE is_correct` to enforce exactly one correct option per MCQ.

**Starter data (seeded):**
1. **Basic Arithmetic** — Addition/Subtraction (4 questions; MCQ + input)
2. **Multiplication Mastery** — Times tables (4 questions)
3. **Division Basics** — Simple division (4 questions)

---

## Run & Test

**Local (no Docker)**
```bash
# DB
cd server && cp .env.example .env   # adjust DATABASE_URL if needed

# API
npm install
npm run migrate
npm run seed
npm run dev    # http://localhost:3000

# Web
cd ../web
npm install
npm run dev    # http://localhost:5173
```

**Docker (one command)**
```bash
docker compose up --build
```
- Web: http://localhost:8080
- API: http://localhost:3000

**Postman / Newman**
- Collection: `postman/MathDuo.postman_collection.json`
- Environment: `postman/MathDuo-local.postman_environment.json`
- CLI tests:
```bash
cd server
npm install
npm run test:api
# override base url:
# npm run test:api -- --env-var baseUrl=http://localhost:3001
```

**Idempotency sanity check (cURL)**
```bash
curl http://localhost:3000/api/lessons
curl -X POST http://localhost:3000/api/lessons/1/submit   -H "Content-Type: application/json"   -d '{"attempt_id":"00000000-0000-4000-8000-000000000123","answers":[{"problem_id":103,"value":"45"},{"problem_id":104,"value":"23"}]}'
curl -X POST http://localhost:3000/api/lessons/1/submit   -H "Content-Type: application/json"   -d '{"attempt_id":"00000000-0000-4000-8000-000000000123","answers":[{"problem_id":103,"value":"45"},{"problem_id":104,"value":"23"}]}'
```

---


## API (Implemented)

- `GET /api/lessons` → list lessons with progress
- `GET /api/lessons/:id` → lesson detail + problems (no answers leaked)
- `POST /api/lessons/:id/submit` → submit answers (idempotent via `(user, lesson, attempt_id)`); returns:
  - `xp_gained`, `total_xp`
  - `streak { current, best, change }`
  - `lesson_progress { solved_count, total_count, percent, completed }`
  - `results[]` with `correct`, `your_answer`, and `explanation`
- `GET /api/profile` → overall stats
- `GET /api/practice/adaptive` → up to 5 prioritized problems
- `POST /api/practice/submit` → idempotent via `(user, attempt_id)`; merges progress per lesson

**Scoring**: 10 XP per correct answer (change `XP_PER_CORRECT` in `server/src/index.js` if needed).

**Streak (UTC)**:
- First-ever activity: streak = 1
- Activity on same UTC day: no change
- Activity on day after last activity: +1
- Gap ≥1 day: reset to 1

---



### 1) Team Development Strategy

**Codebase structure for 2–3 devs (parallel work):**

- Monorepo with `server/` and `web/` packages. Clear ownership: one dev leads API, one leads web UI, one rotates on infra/QA.
- Contracts-first: stabilize API shapes via a lightweight OpenAPI spec (or TypeScript types shared to `web` via a small `api-types` package). This enables parallel work.

**Git workflow**
- Trunk-based with short-lived branches: `feat/<area>-<slug>`, `fix/<slug>`, `chore/<slug>`.
- Required PR review (1 reviewer), small diffs (<300 lines), draft PRs early for async feedback.
- Protected `main` with CI gates: lint (ESLint/Prettier), type-check, build.

**Preventing conflicts & enabling parallelism**
- Vertical slices: each feature touches isolated folders (`web/src/pages/*`, `server/src/routes/*`).
- DB migrations: timestamped files; one owner per migration; no edits to committed migrations.
- Feature flags (env or config) to land code behind toggles.
- PR templates and  CODEOWNERSto route reviews quickly.

**Dev ergonomics**
- Seed data stable across environments.
- Makefile/NPM scripts mirror CI steps (`migrate`, `seed`, `test:api`).
- Pre-commit hooks for lint + format.

---

### 2) AI/ML Integration Strategy

**Where to integrate:**
- Personalized practice: move from rules-based to knowledge tracing to rank next-best problems per learner.
- Smart explanations & hints: generate stepwise hints; restrict with templates/unit tests to avoid hallucinations.

**Data to collect:**
- Problem metadata (skill tags, difficulty), per-attempt correctness, time-on-item, hint usage, retries, sequencing, device.
- Aggregates per user: rolling accuracy per skill, streak, XP, last-active date.
- Use this to: (1) train a lightweight personalization model, (2) do online re-ranking for practice, (3) run A/B tests on guidance and rewards.

**One complex decision (for a non-technical founder):**
- We designed idempotent submissions with a single transaction that updates XP, streak, and progress atomically.
- Why it matters (business): prevents duplicate XP or streak errors when students double-tap or have poor connectivity; protects trust and reduces support load.
- Trade-offs: a bit more backend complexity and careful DB locking; payoff is correctness under real-world network flakiness.
- Timeline: hours, not weeks—fits the take-home window and scales as we grow.

### 3) Product Strategy

**Top 3 technical improvements to prioritize (teen engagement):**
1. Recommends the right next problem by estimating mastery per skill.  
   Impact: higher time-on-task, reduced frustration, faster wins → improves streak retention and NPS.
2. Drills and explanations available with spotty data; prefetch next set.  
   Impact: fewer drop-offs on mobile; “it just works” experience boosts daily active days.
3. Instrumentation + experimentation platform: event schema, feature flags, and A/B framework (e.g., growth experiments on streak boosts, quests).  
   Impact: ship changes quickly, prove what increases teen engagement with data, then scale the winners.

---

## Technical Communication

**Decision:** *Idempotent submissions using `attempt_id` + DB uniqueness inside a transaction.*

**Case explanation:**  
Students often click submit twice (bad Wi‑Fi, double taps). If we added XP every time we *received* a submit, XP and streaks would inflate and feel unfair. By generating a unique `attempt_id` per submission and saving the *first* result as the source of truth, any repeat with the same `attempt_id` simply returns the original result. This keeps XP accurate, prevents support issues, and avoids fraud.  
Trade-offs: Slight extra code + a unique index.
Timeline: Hours, not weeks. Impact: Trustworthy scoring and fewer tickets.

---

## Post‑Lesson Progress Reveals

- Two-stage reveal: (A) *Numbers first* — XP gained, streak status animation, progress bar delta. (B) *Next step* — “Recommended next skill” card with one‑tap continue.
- Streak moments: custom animations at streak milestones (7, 14, 30 days)
- Rate-limit: keep animations under 1.5s, allow skip; prioritize clarity over spectacle.

---

## Scale Plan (1,000+ concurrent students)

- App servers: stateless Node containers; horizontal autoscale; Node cluster mode off (let the orchestrator scale pods).  
- DB: PostgreSQL with pgBouncer, proper indexes, and  background workers for heavy jobs.  
- Caching: HTTP CDN for static assets; API layer cache (e.g., Redis)
- Observability: structured logs, request traces, SLO dashboards
- Deployments: canary, backward‑compatible migrations (additive first, backfill, then remove).  
- Resilience: timeouts, retries with jitter, circuit breakers; idempotency on all write endpoints.

---

## New Team Member Setup (Onboarding)

1. Install Node and Docker.  
2. `cp server/.env.example server/.env` and adjust `DATABASE_URL` if needed.  
3. Local run: `docker compose up --build` (web `:8080`, API `:3000`).  
4. Tests: `cd server && npm install && npm run test:api`.  
5. Open your first PR using the template; run `npm run migrate && npm run seed` locally if not using Docker.

---
