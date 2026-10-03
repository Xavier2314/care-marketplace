# For hosts other than Render (Railway, Fly.io, a VPS). Needs DATABASE_URL and JWT_SECRET at runtime.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
RUN npm ci --include=dev --prefix backend && npm ci --include=dev --prefix frontend
COPY . .
RUN npm run build --prefix frontend && npm run build --prefix backend
ENV NODE_ENV=production STATIC_DIR=../frontend/dist TRUST_PROXY=true PORT=8080
EXPOSE 8080
WORKDIR /app/backend
CMD ["sh", "-c", "npm run start:prod"]
