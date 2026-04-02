FROM node:20-bullseye-slim

WORKDIR /app

RUN npm i -g pnpm@9.15.0

# Build args used by Vite at build time.
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @peima/web build

EXPOSE 5173

CMD ["pnpm", "--filter", "@peima/web", "preview", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

