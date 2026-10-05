# The backend's deployment unit — docs/features/backend-docker.md.
#
# The base image carries Chromium and its system libraries for headless
# Playwright (CLAUDE.md §7, §16). Its tag MUST match the `playwright` version in
# package.json: the browser it ships is the one that version expects. Move both
# together.
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble

# --- build: compile TypeScript and generate the Prisma client ---------------
FROM ${PLAYWRIGHT_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall runs `prisma generate`, which needs the schema copied above.
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- runtime: production dependencies, compiled code, migrations ------------
FROM ${PLAYWRIGHT_IMAGE} AS runtime

# tini as PID 1: forwards SIGTERM to Node (which closes the server and Prisma)
# and reaps any orphaned Chromium process. The portable form of `docker --init`,
# which not every host lets us set.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app
RUN chown pwuser:pwuser /app
USER pwuser

COPY --chown=pwuser:pwuser package.json package-lock.json ./
COPY --chown=pwuser:pwuser prisma ./prisma
# Production dependencies only; `prisma` is one, because the start command
# migrates. postinstall generates the client for this stage's node_modules.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=pwuser:pwuser /app/dist ./dist

EXPOSE 4000

# GET /api/health does not touch the database, so a database blip never
# restarts a healthy container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-4000}/api/health" > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# Bring the schema up to date, then serve. A failed migration stops the
# container before it serves anything; `exec` gives Node the signals.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
