# Multi-stage build: compile TypeScript with dev deps, then ship only dist/, data/ and prod deps.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# data.ts resolves JSON relative to dist/../data, so it sits next to dist.
COPY data ./data

USER node
# Run node directly (not `npm start`) so Railway's SIGTERM on redeploy reaches the bot.
CMD ["node", "dist/index.js"]
