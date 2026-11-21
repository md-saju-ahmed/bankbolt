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

Run `pnpm dev` from the repository root. Open the web app at <http://localhost:3000>
and check the API directly at <http://localhost:4000/api/v1/health>.
Use `pnpm build` for a production build and `pnpm typecheck` to check types.

- `apps/web` contains the Next.js App Router frontend with Tailwind CSS and local shadcn/ui components.
- `apps/api` contains the Express API. Run `pnpm --filter @bankbolt/api dev` to start it independently. Set `PORT` in the shell to override its default port of `4000` when running it independently.
