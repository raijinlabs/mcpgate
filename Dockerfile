FROM node:20-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4020
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:4020/health || exit 1
CMD ["npx", "tsx", "apps/mcpgate-api/src/server.ts"]
