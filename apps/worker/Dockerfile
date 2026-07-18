# Railway bu Dockerfile'ı repo KÖKÜNDEN build eder (context = repo root) —
# npm workspaces'in packages/db'yi çözebilmesi için root package-lock.json gerekli.

# --- Build aşaması ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/db/package*.json packages/db/
COPY apps/worker/package*.json apps/worker/
RUN npm install

COPY packages/db packages/db
COPY apps/worker apps/worker

RUN npm run db:generate
RUN npm run build --workspace apps/worker

# --- Runtime aşaması ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/db/package*.json packages/db/
COPY apps/worker/package*.json apps/worker/
RUN npm install --omit=dev

COPY --from=builder /app/packages/db/prisma packages/db/prisma
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma node_modules/@prisma
COPY --from=builder /app/apps/worker/dist apps/worker/dist

EXPOSE 3001
CMD ["node", "apps/worker/dist/index.js"]
