# BankBolt

BankBolt is a simulated digital banking management system that uses fictional banking data.

## Repository setup

Install Node.js 24 or newer and pnpm 12.18.0, then run:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
```

Use `pnpm format` to apply formatting.

## Planned application layout

- `apps/web` will contain the Next.js App Router frontend.
- `apps/api` will contain the Express API and own all PostgreSQL access.

The current repository contains the workspace tooling. As the apps are added, `pnpm dev`, `pnpm build`, and `pnpm typecheck` will run their corresponding scripts through Turborepo. App TypeScript configurations will extend the root `tsconfig.base.json` to inherit strict mode.
