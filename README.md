# BookRough

A full-stack social platform that enables friend groups to share, rate, and discuss music recommendations seamlessly across different streaming providers.

Users paste a Spotify link → friends on Apple Music, YouTube, or Tidal see a link for **their** service automatically. Communities are private groups where members share, bookmark, and rate music together.

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS + Zustand + React Router v7 |
| Backend | Node.js + Express 5 + TypeScript + Prisma ORM |
| Database | PostgreSQL 16 |
| Auth | JWT (HttpOnly cookie) + Google OAuth 2.0 |
| Link conversion | Playwright (headless Chromium) scraping squigly.link |
| Tests | Vitest + React Testing Library + Supertest + Playwright E2E |
| CI/CD | GitHub Actions + Docker |

---

## Local setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/), **running** — Postgres lives in it
- Node.js ≥ 24 (see `.nvmrc`)
- A Google Cloud OAuth Client ID ([guide](https://developers.google.com/identity/protocols/oauth2)) — not needed until Step 1.3

### 1. Start the database

```bash
docker compose up -d
```

This starts PostgreSQL 16 on `localhost:5432` with two databases:
- `music_app_dev` — used while developing
- `music_app_test_db` — used by integration tests, so they never touch the dev data

Both are created the first time the data volume is initialised. To rebuild them from scratch: `docker compose down -v && docker compose up -d`.

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit both `.env` files:
- Set a strong random `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- Fill in your `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`

Neither is read by any code yet — authentication arrives in Step 1.3 — but the backend validates its whole environment at boot and refuses to start with a variable missing, so fill them in now.

### 3. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

There are no database migrations yet: the schema is Step 1.1.

### 4. Start the dev servers

In two separate terminals:

```bash
# Terminal 1 — API (port 4000)
cd backend && npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API answers at [http://localhost:4000/api/health](http://localhost:4000/api/health).

---

## Running tests

```bash
# Backend unit tests, with coverage
cd backend && npm run test:unit
```

```bash
# Backend integration tests (Supertest)
cd backend && npm run test:integration
```

```bash
# Frontend unit + component tests
cd frontend && npm test
```

End-to-end tests do not exist yet — the `e2e/` package arrives in Step 0.5 and its first spec in Step 1.7.

---

## Project conventions

See [CLAUDE.md](CLAUDE.md) for the full working agreement: architecture layers, error handling, auth patterns, git workflow, and testing rules.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the step-by-step feature roadmap and progress log.
