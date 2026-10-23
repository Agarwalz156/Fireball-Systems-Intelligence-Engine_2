# Production Dockerfile for Fireball — Systems Intelligence Engine
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build production artifacts
COPY . .
RUN npm run build

# Stage 2: Minimal Production Image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled bundles and agent scripts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/agent ./agent
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

EXPOSE 3000

USER node

CMD ["node", "server.js"]
