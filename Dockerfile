FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Backend dependencies
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml ./
COPY .npmrc* ./
RUN pnpm config set approve-builds-by-default true && pnpm install --frozen-lockfile

# Frontend dependencies + build
FROM base AS frontend
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build

# Backend build
FROM deps AS build
COPY . .
RUN pnpm build

# Production
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=frontend /app/web/dist ./web/dist
COPY package.json ./
USER node
CMD ["node", "dist/index.js"]
