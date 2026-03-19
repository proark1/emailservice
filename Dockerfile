FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS development
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY tsconfig.json drizzle.config.ts ./

FROM deps AS build
COPY . .
RUN pnpm tsup

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
CMD ["node", "dist/index.js"]
