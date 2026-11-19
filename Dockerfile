# ── Estágio 1: gerar o banco SQLite a partir dos scripts oficiais ────────────
# linux/amd64: exigência do Cloudflare Containers (build em Apple Silicon é emulado)
FROM --platform=linux/amd64 node:22-slim AS db
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
# sem --ignore-scripts: better-sqlite3 precisa baixar/compilar o binding nativo.
# packageManager pinado no package.json raiz (corepack entrega o mesmo pnpm do
# host) + allowlist onlyBuiltDependencies no pnpm-workspace.yaml controlam o que roda
RUN pnpm install --filter calculadora-simples-nacional-core
COPY packages/core packages/core
COPY db/sql db/sql
RUN pnpm --filter calculadora-simples-nacional-core exec tsx scripts/build-db.ts --out /app/db/calculadora.db

# ── Estágio 2: build da API ──────────────────────────────────────────────────
FROM --platform=linux/amd64 node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
# package.json do playground (não o app): mantém o workspace pnpm íntegro no install
COPY apps/playground/package.json apps/playground/
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter calculadora-simples-nacional-core build && pnpm --filter @sn/api build

# ── Estágio 3: runtime (API + banco — o front é servido pelo Worker) ─────────
FROM --platform=linux/amd64 node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
# node_modules dos pacotes: no linker isolado do pnpm, @nestjs/* (apps/api) e
# better-sqlite3/decimal.js (packages/core) só resolvem via estes symlinks
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/playground/package.json ./apps/playground/
COPY --from=db /app/db/calculadora.db ./db/calculadora.db
EXPOSE 8080
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
