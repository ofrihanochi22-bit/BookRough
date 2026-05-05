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

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Postgres)
- Node.js ≥ 20
- A Google Cloud OAuth Client ID ([guide](https://developers.google.com/identity/protocols/oauth2))

### 1. Start the database

```bash
docker compose up -d
```

This starts PostgreSQL on `localhost:5432` with two databases:
- `music_app_dev` — used while developing
- `music_app_test` — used by integration tests (never touch the dev data)

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit both `.env` files:
- Set a strong random `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- Fill in your `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`

### 3. Install dependencies and run migrations

```bash
cd backend && npm install && npm run prisma:migrate
cd ../frontend && npm install
```

### 4. Start the dev servers

In two separate terminals:

```bash
# Terminal 1 — API (port 4000)
cd backend && npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Running tests

```bash
# Backend unit + integration tests
cd backend && npm test

# Frontend component tests
cd frontend && npm test

# End-to-end tests (requires both dev servers + Postgres running)
cd e2e && npm test
```

---

## E2E tests

```bash
cd e2e
npm install
npx playwright install chromium
npm test
```

> E2E specs point at `http://localhost:5173`. Start both dev servers before running them.

---

## Project conventions

See [CLAUDE.md](CLAUDE.md) for the full working agreement: architecture layers, error handling, auth patterns, git workflow, and testing rules.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the step-by-step feature roadmap and progress log.
