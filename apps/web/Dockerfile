FROM node:24-bookworm-slim

WORKDIR /workspace
RUN npm install --global pnpm@12.18.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/web apps/web

WORKDIR /workspace/apps/web
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
