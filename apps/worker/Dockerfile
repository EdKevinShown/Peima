FROM node:20-bullseye-slim
WORKDIR /app
RUN npm i -g pnpm@9.15.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @peima/database build
RUN pnpm --filter @peima/worker build
CMD ["node", "apps/worker/dist/main.js"]