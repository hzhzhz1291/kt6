FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma

FROM base AS development
RUN npm ci && npm run db:generate
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && exec node src/server.js"]

FROM base AS production
RUN npm ci --omit=dev && npm run db:generate && npm cache clean --force
COPY --chown=node:node src ./src
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && exec node src/server.js"]
