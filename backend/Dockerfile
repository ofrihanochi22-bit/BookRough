# The backend's deployment unit — docs/features/backend-docker.md.
#
# A slim Node base with only the browser the converter launches: Chromium's
# headless shell and its system libraries (CLAUDE.md §7, §16). The browser comes
# from the `playwright` package in package-lock.json, so its version always
# matches the library — there is no image tag to keep in step. Sized for
# Vercel's 10 GB deployment storage: docs/features/deployment-storage.md.
# The Node version is pinned exactly, like any toolchain change (CLAUDE.md §11).
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

# --- build: compile TypeScript and generate the Prisma client ---------------
FROM ${NODE_IMAGE} AS build

# Prisma detects OpenSSL to choose its query engine; the slim base has none.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall runs `prisma generate`, which needs the schema copied above.
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- runtime: production dependencies, compiled code, migrations ------------
FROM ${NODE_IMAGE} AS runtime

# tini as PID 1: forwards SIGTERM to Node (which closes the server and Prisma)
# and reaps any orphaned Chromium process. The portable form of `docker --init`,
# which not every host lets us set. OpenSSL and the CA bundle are for Prisma's
# engine and its TLS connection to the database.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# Outside any home directory, so the browser installed as root is found by the
# unprivileged user that runs the API.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
# Production dependencies only; `prisma` is one, because the start command
# migrates. postinstall generates the client for this stage's node_modules.
RUN npm ci --omit=dev && npm cache clean --force

# The headless shell only — what `chromium.launch({ headless: true })` runs —
# with its system libraries, which need root to install.
USER root
RUN ./node_modules/.bin/playwright install --with-deps --only-shell chromium \
  && rm -rf /var/lib/apt/lists/*
USER node

COPY --from=build --chown=node:node /app/dist ./dist

EXPOSE 4000

# GET /api/health does not touch the database, so a database blip never
# restarts a healthy container. Node's fetch, because the slim base has no curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
# Bring the schema up to date, then serve. A failed migration stops the
# container before it serves anything; `exec` gives Node the signals.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
