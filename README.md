Live app here: https://cgis-app.fly.dev/

# Citizen Grievance Intelligence System (CGIS)

CGIS is a full-stack web application that lets citizens submit unstructured grievance text in any Indian language, extracts structured fields using an LLM (Groq / OpenRouter), stores records in a Supabase PostgreSQL database, and provides a visual analytics dashboard and a natural-language chatbot interface for querying the data. An admin panel lets operators review, update, and manage submissions.

---

## Architecture

```
Browser (Vite/TypeScript)
    │
    ├── Dashboard (/)        – KPI cards, Chart.js charts, grievance table, chatbot bubble
    ├── Chatbot (/chat.html) – Full-page text-to-SQL conversational interface
    └── Admin (/admin.html)  – Password-protected panel: review, update, delete grievances
         │
         └──► FastAPI (Python 3.12 / uv)
                   │
                   ├── /api/grievances/*  – Submit, list, get, update, delete
                   ├── /api/dashboard/*   – Aggregated KPI + chart data
                   ├── /api/chat/*        – Chatbot sessions and messages
                   └── /admin/*           – Login / logout
                         │
                         ├── Groq LLM (llama-3.3-70b-versatile)
                         │     ├── Mode 1: Field extraction (JSON response)
                         │     └── Mode 2: Text-to-SQL + answer synthesis
                         └── Supabase (PostgreSQL)
                               ├── grievances table
                               ├── query_sessions table
                               └── query_messages table
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.12+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| uv | latest | `pip install uv` or [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Docker | latest | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Supabase account | — | [supabase.com](https://supabase.com) |
| Groq account | — | [console.groq.com](https://console.groq.com) |

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd cgis
```

### 2. Create `.env`

Copy the example and fill in your secrets:

```bash
cp .env.example .env
```

Edit `.env`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=sb_secret_your_key_here
GROQ_API_KEY=gsk_your_groq_key_here
MODEL=llama-3.3-70b-versatile
ADMIN_PASSWORD=your-chosen-password
SESSION_SECRET=run-openssl-rand-hex-32
COOKIE_SECURE=0
```

> Generate `SESSION_SECRET` with: `openssl rand -hex 32`

### 3. Create Supabase tables and RPC function

Go to your Supabase project → **SQL Editor** → **New Query**, paste and run the following:

```sql
-- Table: grievances
create table public.grievances (
  grievance_id     uuid primary key,
  username         text,
  age              integer,
  gender           text check (gender in ('male', 'female', 'other') or gender is null),
  pin_code         text,
  district         text,
  state            text,
  govt_department  text,
  problem_summary  text not null,
  proof_reference  text,
  original_text    text not null,
  internal_notes   text,
  submitted_at     timestamptz not null default now(),
  status           text not null default 'open'
    check (status in ('open', 'under_review', 'resolved', 'rejected'))
);

create index grievances_state_idx      on public.grievances (state);
create index grievances_district_idx   on public.grievances (district);
create index grievances_dept_idx       on public.grievances (govt_department);
create index grievances_status_idx     on public.grievances (status);
create index grievances_submitted_idx  on public.grievances (submitted_at desc);

grant select, insert, update, delete on public.grievances to service_role;

-- Table: query_sessions
create table public.query_sessions (
  session_id    uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  last_active   timestamptz not null default now()
);

-- Table: query_messages
create table public.query_messages (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.query_sessions(session_id) on delete cascade,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  sql_query     text,
  created_at    timestamptz not null default now()
);

grant select, insert, update, delete on public.query_sessions to service_role;
grant select, insert, update, delete on public.query_messages to service_role;

-- RPC: execute_query (used by the chatbot agent)
create or replace function execute_query(query_text text)
returns json language plpgsql security definer as $$
declare result json;
begin
  if upper(trim(query_text)) not like 'SELECT%' then
    raise exception 'Only SELECT queries are permitted';
  end if;
  execute 'select json_agg(t) from (' || query_text || ') t' into result;
  return coalesce(result, '[]'::json);
end;
$$;
grant execute on function execute_query(text) to service_role;
```

### 4. Install backend dependencies

```bash
cd backend
uv sync
```

### 5. Install frontend dependencies

```bash
cd frontend
npm install
```

### 6. Validate Supabase connectivity

```bash
cd backend
uv run pytest ../tests/test_supabase_connection.py -v
```

All 6 tests must pass before proceeding.

### 7. Seed test data (optional)

Inserts 20 sample grievances for visual testing:

```bash
cd backend
uv run python -c "from app.database import seed_test_data; seed_test_data()"
```

---

## Running Locally — Docker (Recommended)

### macOS / Linux

```bash
./scripts/start_mac.sh
```

### Windows (PowerShell)

```powershell
.\scripts\start_pc.ps1
```

Then visit **http://localhost:8000**.

To stop:

```bash
./scripts/stop_mac.sh    # macOS/Linux
.\scripts\stop_pc.ps1    # Windows
```

---

## Running Locally — Dev Mode (Hot Reload)

**Terminal 1 — Backend:**
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Frontend dev server runs at **http://localhost:5173** and proxies `/api` and `/admin` to the backend on port 8000.

---

## Running Tests

### Backend (pytest)

```bash
cd backend
uv run pytest ../tests/ -v
```

Tests that require Supabase / Groq credentials are skipped automatically if the env vars are not set.

### Frontend (Playwright)

```bash
cd frontend
npm install
npx playwright install chromium
cd tests/playwright
TEST_BASE_URL=http://localhost:5173 npx playwright test --config=playwright.config.ts
```

Or against the Docker container:

```bash
TEST_BASE_URL=http://localhost:8000 npx playwright test --config=tests/playwright/playwright.config.ts
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Your Supabase project URL (`https://xxx.supabase.co`) |
| `SUPABASE_KEY` | Yes | Supabase `service_role` secret key |
| `GROQ_API_KEY` | Yes* | Groq API key — get one at console.groq.com |
| `MODEL` | No | LLM model name (default: `llama-3.3-70b-versatile`) |
| `ADMIN_PASSWORD` | Yes | Password for the `/admin` panel |
| `SESSION_SECRET` | No | JWT signing secret (defaults to `cgis::{ADMIN_PASSWORD}` — set explicitly in production) |
| `COOKIE_SECURE` | No | Set `1` in production (HTTPS only). Default: `0` |

*If `GROQ_API_KEY` is not set, the app falls back to OpenRouter (`openai/gpt-4o-mini`). An `OPENROUTER_API_KEY` must be provided separately in that case.

---

## API Reference

All endpoints return JSON. Admin-only routes require the `cgis_session` cookie set by `POST /admin/login`.

### Grievances

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/grievances/submit` | None | Extract + store a new grievance |
| `GET` | `/api/grievances/` | None | List grievances (paginated, filterable) |
| `GET` | `/api/grievances/{id}` | None | Get single grievance |
| `PATCH` | `/api/grievances/{id}` | Admin | Update status / internal notes |
| `DELETE` | `/api/grievances/{id}` | Admin | Delete a grievance |

**Submit request body:**
```json
{ "text": "Grievance text in any language..." }
```

**List query params:** `state`, `department`, `status`, `search`, `page` (default 1), `page_size` (default 20), `sort_by`, `sort_desc`

### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/stats` | None | All KPI + chart data (cached 60s) |

### Chatbot

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat/message` | None | Send a question, get answer + SQL |
| `POST` | `/api/chat/session` | None | Create a new chat session |
| `GET` | `/api/chat/session/{id}` | None | Load session history |
| `GET` | `/api/chat/sessions` | Admin | List all sessions |

**Chat message request body:**
```json
{ "question": "How many open grievances are from Karnataka?", "session_id": "uuid-or-null" }
```

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/admin/login` | None | Login, sets `cgis_session` cookie |
| `POST` | `/admin/logout` | None | Clears cookie |
| `GET` | `/admin/check` | Admin | Verify session is valid |

---

## Deployment (fly.io)

See [DEPLOY.md](DEPLOY.md) for full instructions.

Quick deploy:

```bash
fly auth login
./scripts/deploy.sh
```

---

## Project Structure

```
cgis/
├── README.md
├── SPEC.md
├── Dockerfile
├── .env.example
├── .gitignore
├── scripts/
│   ├── start_mac.sh / stop_mac.sh
│   ├── start_pc.ps1 / stop_pc.ps1
│   ├── fly.toml
│   └── deploy.sh
├── backend/
│   ├── pyproject.toml
│   └── app/
│       ├── main.py          – FastAPI app, mounts frontend dist
│       ├── config.py        – Settings from .env
│       ├── database.py      – Supabase client, all DB operations
│       ├── extraction.py    – LLM extraction pipeline
│       ├── chatbot.py       – Text-to-SQL query agent
│       ├── auth.py          – Admin session JWT handling
│       ├── rate_limit.py    – IP + session rate limiting
│       ├── llm.py           – LLM client factory (Groq / OpenRouter)
│       └── routers/
│           ├── grievances.py
│           ├── dashboard.py
│           ├── chat.py
│           └── admin.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html           – Dashboard
│   ├── chat.html            – Chatbot page
│   ├── admin.html           – Admin panel
│   └── src/
│       ├── styles/
│       │   ├── tokens.css
│       │   ├── components.css
│       │   └── charts.css
│       ├── types.ts
│       ├── api.ts
│       ├── dashboard.ts
│       ├── bubble.ts
│       ├── chat.ts
│       └── admin.ts
└── tests/
    ├── test_plan_backend.md
    ├── test_plan_frontend.md
    ├── test_plan_e2e.md
    ├── conftest.py
    ├── test_supabase_connection.py
    ├── test_extraction.py
    ├── test_chatbot.py
    ├── test_grievances_api.py
    ├── test_dashboard_api.py
    ├── test_admin_auth.py
    └── playwright/
        ├── playwright.config.ts
        └── test_ui.spec.ts
```
