<div align="center">

# ScopeForge

**Turn a freelance project brief into a decision-ready report — verdict, price, timeline, hidden scope, risks, client questions, and a ready-to-send proposal.**

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6.svg)](LICENSE)

</div>

<div align="center">
  <a href="video/intro.mp4">
    <img src="docs/assets/intro-preview.gif" alt="ScopeForge — from a pasted brief to a decision-ready report" width="100%">
  </a>
  <p><em><a href="video/intro.mp4">▶ Watch the full intro</a></em></p>
</div>

## Intro

Paste a client brief, and ScopeForge returns a structured report that answers the five questions that decide whether a freelance project is worth taking:

1. Should I take this project?
2. What should I charge?
3. How long will it take?
4. What can go wrong?
5. What should I ask or send the client next?

The clip above is a short walkthrough of the flow. If it does not play inline on your device, open [`video/intro.mp4`](video/intro.mp4) directly.

## Overview

Freelancers lose time and money on the same problem: a client brief is unstructured prose, but the decision to take the job needs structured answers. ScopeForge closes that gap. You paste the brief, optionally add the stated budget and deadline, and get back a single report with a clear verdict, a realistic price and timeline, the scope the client did not spell out, the risks worth flagging, questions to send back, and a proposal you can copy and send.

It is built for a freelancer working alone: no signup is required to run an analysis, results are saved locally so history survives a refresh, and an optional account unlocks higher usage limits and cross-device history. The report page is the product — everything else exists to get you there quickly and let you act on the result.

## Key features

- **Decision-ready verdict.** Every report opens with a take / negotiate / skip verdict, a confidence score, and a one-line reason, so the call is obvious above the fold.
- **Realistic price and timeline.** A recommended budget range and a staged timeline, adjusted to your experience level and the currency you work in.
- **Hidden scope and risk surfacing.** Requirements the brief implies but never states, plus ranked risks with concrete mitigations.
- **Client-ready proposal.** A full proposal you can copy, with Confident and Technical tone variants and an optional block of clarifying questions — your name is filled in from settings.
- **Score breakdown.** A radar across profitability, clarity, portfolio value, complexity, and risk, so you can see at a glance where a project is strong or weak.
- **No-signup by default.** Run an analysis immediately; results persist in the browser. Accounts are opt-in.
- **Accounts, plans, and quotas.** Email and password auth with server-side sessions, three subscription tiers, and monthly usage limits. Billing is a self-contained mock — no real payment processor is involved.
- **Deterministic demo mode.** A built-in demo report and a mock analysis path let you run and develop the whole product without any external key.
- **Responsive by design.** Purpose-built layouts for desktop, tablet, and mobile — not a stacked desktop view.

## User flow

1. **Paste** a client brief on the analyze page; optionally add the stated budget, deadline, experience level, currency, and depth.
2. **Review** the report — verdict, score, price, timeline, hidden scope, risks, and recommended stack.
3. **Act** — copy the proposal (Confident or Technical tone), copy the clarifying questions, or export the report as Markdown.
4. **Return** — every analysis is saved to history, searchable and reopenable later.

## Technology stack

**Frontend**
- Next.js 15 (App Router) with React 19 and TypeScript
- Tailwind CSS 4 for styling
- Radix UI primitives (dialog, dropdown, popover, select, tabs, tooltip)
- Recharts for the score radar, Motion for interaction transitions, lucide-react for icons
- React Hook Form + Zod for form handling and validation

**Backend**
- FastAPI with Pydantic v2 (camelCase wire format, snake_case internals)
- SQLAlchemy 2.0 ORM with Alembic migrations
- Argon2id password hashing and server-side session cookies
- OpenAI-compatible client targeting Groq for the analysis, with a deterministic mock mode

**Data and infrastructure**
- PostgreSQL (JSONB for analysis payloads); SQLite is used for the test suite
- Docker Compose for a local database
- Optional Cloudflare Turnstile (CAPTCHA) and Resend (verification email), both off by default

## Architecture

The web app talks to the API over REST with a session cookie. The API validates every provider response against a strict schema before returning it, persists analyses to PostgreSQL, and falls back to a deterministic mock when mock mode is on or no key is configured.

```mermaid
flowchart LR
    U["Browser (Next.js app)"] -->|"REST + cookie session"| API["FastAPI API"]
    U -. "local cache" .-> LS[("localStorage: history + settings")]
    API -->|"schema-validated completion"| G["Groq completions API"]
    API -->|"analyses, users, sessions, usage"| DB[("PostgreSQL")]
    API -. "optional verification email" .-> R["Resend"]
    U -. "optional CAPTCHA" .-> T["Cloudflare Turnstile"]
```

- **Anonymous first.** A browser installation id scopes local history and usage; an account is only needed for higher limits and cross-device history.
- **Strict output.** The provider is asked for a specific JSON shape; invalid responses get one repair attempt, then return a typed failure rather than broken UI.
- **Best-effort persistence.** A database problem never discards a computed analysis — it is still returned and cached client-side.

## Project structure

```text
scopeforge/
├── apps/
│   ├── web/                     # Next.js frontend (App Router)
│   │   └── src/
│   │       ├── app/             # routes: /analyze, /analysis/[id], /history,
│   │       │                    #         /settings, /login, /signup, /billing
│   │       ├── components/      # product components + UI primitives
│   │       ├── lib/             # API client, local stores, formatting helpers
│   │       └── fonts/           # self-hosted fonts
│   └── api/                     # FastAPI backend
│       ├── app/                 # routes, schemas, provider adapter, auth,
│       │                        # billing, usage enforcement
│       ├── migrations/          # Alembic migrations
│       └── tests/               # pytest suite
├── scripts/                     # dev orchestrator (dev.mjs) + doctor
├── docs/assets/                 # screenshots and preview
├── video/                       # intro
├── docker-compose.yml           # local PostgreSQL
├── .env.example                 # documented environment template
└── package.json                 # root scripts (orchestrates web + api)
```

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Python 3.11+ (3.10 also works)
- Docker (for a local PostgreSQL), or an existing PostgreSQL instance

### 1. Clone and configure

```bash
git clone https://github.com/tellmemore/scopeforge.git
cd scopeforge
cp .env.example .env
```

The defaults in `.env` run the whole app in mock mode with no external keys. To use the real analysis provider, set `ANALYSIS_MOCK_MODE=false` and provide a Groq API key in `AI_API_KEY` (see [Environment variables](#environment-variables)).

### 2. Start the database

```bash
docker compose up -d postgres
```

### 3. One-command dev

The root dev script installs dependencies for both apps, applies migrations, checks your environment, and starts the API and web servers together:

```bash
npm run dev
```

Open <http://localhost:3000>.

<details>
<summary>Run the API and web app separately</summary>

**API**

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Web**

```bash
cd apps/web
npm install
npm run dev
```

</details>

### 4. Production build

```bash
# Web
npm run build:web
npm --prefix apps/web run start   # serves the production build

# API
cd apps/api
uvicorn app.main:app --port 8000  # behind a process manager / reverse proxy
```

## Environment variables

Copy `.env.example` to `.env` and fill in what you need. Every value has a working default for local, mock-mode development.

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Yes | Base URL of the API, read by the web app | `http://localhost:8000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql+psycopg://scopeforge:scopeforge@localhost:5435/scopeforge` |
| `ANALYSIS_MOCK_MODE` | Yes | `true` uses the deterministic mock; `false` calls the real provider | `true` |
| `AI_PROVIDER` | When live | Analysis provider id | `groq` |
| `AI_BASE_URL` | When live | Provider base URL (OpenAI-compatible) | `https://api.groq.com/openai/v1` |
| `AI_API_KEY` | When live | Provider API key (never commit real keys) | `replace_me` |
| `AI_MODEL` | When live | Model identifier | `openai/gpt-oss-120b` |
| `SESSION_COOKIE_SECURE` | No | `true` only behind HTTPS, or the session cookie is dropped | `false` |
| `TURNSTILE_ENABLED` | No | Enable Cloudflare Turnstile on register/login | `false` |
| `TURNSTILE_SECRET_KEY` | No | Turnstile secret (server side) | *(blank)* |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | Turnstile site key (client side) | *(blank)* |
| `RESEND_API_KEY` | No | Resend key for verification email; blank skips sending | *(blank)* |
| `EMAIL_FROM_ADDRESS` | No | From address for verification email | `ScopeForge <onboarding@resend.dev>` |
| `APP_BASE_URL` | No | Deployed frontend's URL — used to build verification/reset email links *and* as the extra allowed CORS origin | `http://localhost:3000` |

## Available scripts

Run from the repository root:

| Command | Description |
| --- | --- |
| `npm run dev` | Install, migrate, check environment, and start API + web together |
| `npm run dev:web` | Start only the web dev server |
| `npm run build:web` | Production build of the web app |
| `npm run lint:web` | Lint the web app (ESLint) |
| `npm run typecheck:web` | Type-check the web app (`tsc --noEmit`) |
| `npm run doctor` | Report environment and setup problems |

Backend commands (from `apps/api`): `uvicorn app.main:app --reload` to serve, `pytest` to test, `alembic upgrade head` to migrate.

## Quality checks

```bash
# Frontend
npm run lint:web
npm run typecheck:web
npm run build:web

# Backend
cd apps/api
pytest
python -m compileall app
```

The backend test suite runs against in-memory SQLite and does not require PostgreSQL or any provider key.

## Deployment

- **Database:** any managed PostgreSQL; set `DATABASE_URL` and run `alembic upgrade head`.
- **API:** run `uvicorn app.main:app` behind a process manager and reverse proxy. Set `ANALYSIS_MOCK_MODE=false` with a real key to enable live analysis, `SESSION_COOKIE_SECURE=true` behind HTTPS, and `APP_BASE_URL` to the deployed frontend's actual URL (e.g. `https://scopeforge.onrender.com`) — the API rejects browser requests from any origin not in its CORS allowlist, and this is what adds the real frontend to it (on top of the two localhost origins that always work for local dev), so this needs to be set correctly for the deployed frontend to be able to call the API at all.
- **Web:** `next build` then `next start`, or deploy to any Next.js-compatible host. Point `NEXT_PUBLIC_API_URL` at the deployed API.

This repository is not tied to a specific host; the pieces are standard and deploy anywhere that runs Node.js, Python, and PostgreSQL.

## License

Released under the [MIT License](LICENSE).

## Author

Built and maintained by **[@tellmemore](https://github.com/tellmemore)**. Issues and pull requests are welcome.
