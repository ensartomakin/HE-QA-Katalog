# Railway bu Dockerfile'ı repo KÖKÜNDEN build eder (context = repo root) —
# npm workspaces'in packages/db'yi çözebilmesi için root package-lock.json gerekli.
#
# Alpine YERİNE Debian (bookworm-slim) kullanılıyor: Playwright'ın Chromium'u musl libc
# (Alpine) ile resmi olarak desteklenmiyor, glibc tabanlı bir imaj gerekiyor.

# --- Build aşaması ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/db/package*.json packages/db/
COPY apps/worker/package*.json apps/worker/
RUN npm install

COPY packages/db packages/db
COPY apps/worker apps/worker

RUN npm run db:generate
RUN npm run build --workspace packages/db
RUN npm run build --workspace apps/worker

# --- Runtime aşaması ---
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# apt-get'in (playwright install --with-deps içinde çağrılıyor) tzdata gibi paketlerde
# görünmez bir onay isteminde sonsuza kadar beklemesini önler — bu olmadan build donuyordu.
ENV DEBIAN_FRONTEND=noninteractive

COPY package*.json ./
COPY packages/db/package*.json packages/db/
COPY apps/worker/package*.json apps/worker/
RUN npm install --omit=dev

COPY --from=builder /app/packages/db/prisma packages/db/prisma
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma node_modules/@prisma
COPY --from=builder /app/apps/worker/dist apps/worker/dist

# PDF üretimi için headless Chromium + gerekli sistem kütüphaneleri
RUN npx playwright install --with-deps chromium

EXPOSE 3001
CMD ["node", "apps/worker/dist/index.js"]
