FROM node:24-bookworm-slim

WORKDIR /workspace
RUN npm install --global pnpm@12.18.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/api apps/api

WORKDIR /workspace/apps/api
EXPOSE 4000
CMD ["pnpm", "dev"]
