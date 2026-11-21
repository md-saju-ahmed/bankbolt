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

## Local development

Run `pnpm dev` from the repository root and open <http://localhost:3000>.
Use `pnpm build` for a production build and `pnpm typecheck` to check types.

- `apps/web` contains the Next.js App Router frontend with Tailwind CSS and local shadcn/ui components.
- `apps/api` is planned for the Express API and will own all PostgreSQL access.
