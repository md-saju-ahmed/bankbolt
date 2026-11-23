# BankBolt

BankBolt is a simulated digital banking system with separate workspaces for customers, bank staff, and administrators. It uses fictional accounts and balances. No real money moves through the app.

[Live demo](https://bankbolt.vercel.app/) · [Sign in](https://bankbolt.vercel.app/login)

## Demo access

On the sign-in page, choose a role under **Demo accounts** to fill the form, then select **Sign in**. If quick-fill is unavailable, use the shared demo password provided with the submission or configured during local setup.

| Role       | Demo email                  | What to try                                                                                                         |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Customer   | `customer@bankbolt.example` | Switch accounts, transfer funds, request cash, apply for a loan, and export statements.                             |
| Bank Staff | `staff@bankbolt.example`    | Verify customers, open accounts, review cash requests, flag transactions, and forward loan applications.            |
| Admin      | `admin@bankbolt.example`    | Manage customer and account access, set transfer limits, decide loans, reverse transfers, and review audit history. |

## Features

- Manage Savings, Current, and Business accounts with customer verification, balance and status views, and account restrictions.
- Transfer BDT with PIN confirmation, fees, and limits. Filter and page through transaction history, print receipts or download PDFs, and export CSV/PDF statements.
- Staff and Admin review deposit and withdrawal requests. Staff forward loan applications to Admin for a decision. Customers can follow disbursement, schedules, and repayments.
- Customers can request changes to their profile, including their photo, for Staff or Admin review. Staff can request a profile picture change from the account menu and keep their current photo or initials until an Admin approves it. Admins review those requests under **Profile change review → Staff photos** and can update their own photo immediately. Photos use public HTTPS image URLs.
- Explore five Admin charts for transaction volume, deposits vs. withdrawals, account distribution, loan decisions, and monthly activity. Three Customer charts show spending, deposit history, and transaction distribution. All charts use API data.
- Use responsive workspaces with light and dark themes. The app supports optional authenticator verification for sensitive actions and flags unusual posted activity for review.

## Architecture and state

BankBolt is a pnpm and Turborepo monorepo. [`apps/web`](apps/web) uses Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, and Recharts. [`apps/api`](apps/api) uses Express, TypeScript, Zod, Drizzle, and PostgreSQL on Neon. Next.js forwards same-origin `/api/v1/*` requests to Express, which owns database access and banking rules.

[Redux Toolkit](apps/web/src/lib/store/store.ts) stores the authenticated role in `auth`, the selected account in `accounts`, history filters in `transactions`, and loan review selections in `loans`. [RTK Query](apps/web/src/lib/api/base-api.ts) handles API requests, caching, loading and error states, and cache invalidation after mutations. Logout clears the API cache and workspace selections.

## Authentication and financial integrity

Express verifies salted password hashes and stores sessions in PostgreSQL. Clients receive an HttpOnly, SameSite=Lax cookie that requires HTTPS in production. The API validates inputs, request origins, role and account ownership, and limits repeated login and PIN attempts.

Amounts are stored as integer poisha. Express calculates fees and validates the PIN, account status, ownership, limits, and available balance. A transfer locks the affected accounts and commits the debit, credit, and history record together. An identical retry with the same idempotency key returns the original result. Cash approvals, loan disbursements, and repayments commit their balance changes and transaction records together.

## Database

See the [Drizzle schema](apps/api/src/db/schema.ts) and [migrations](apps/api/drizzle).

| Area     | Stored records                                                        |
| -------- | --------------------------------------------------------------------- |
| Identity | Users, customer profiles, sessions, authenticators, and auth attempts |
| Profiles | Customer profile change requests and Staff photo review decisions     |
| Banking  | Accounts, transactions, cash requests, and transaction flags          |
| Lending  | Loan applications, review notes, installments, and settlements        |
| Audit    | Management events and actor references on financial records           |

## Local setup

Use Node.js 24 or newer and pnpm 12.18.0. Copy [the API template](apps/api/.env.example) to `apps/api/.env.local`, point both database URLs at a dedicated development database, set a session secret, and choose a fictional-account password for `DEMO_PASSWORD`.

```sh
pnpm install --frozen-lockfile
pnpm --filter @bankbolt/api db:migrate
pnpm --filter @bankbolt/api db:seed:demo
pnpm dev
```

Open [localhost:3000](http://localhost:3000/). The API listens on port 4000 by default. Check the [proxied health endpoint](http://localhost:3000/api/v1/health) if the web app cannot reach it. For local quick-fill, copy [the web template](apps/web/.env.example) to `apps/web/.env.local` and set `NEXT_PUBLIC_DEMO_PASSWORD` to the password used to seed the local fictional accounts. To enable quick-fill in a local production build, also set `DEMO_LOGIN_ENABLED=true` before building.

After pulling changes that add a migration, run `pnpm --filter @bankbolt/api db:migrate` against your development database before starting the API. The health endpoint can respond successfully while sign-in fails against an outdated schema. If sign-in returns HTTP 403, check that the browser URL matches `WEB_ORIGIN` exactly, including hostname and port. The local default is `http://localhost:3000`.

### Docker

Copy [the Compose template](.env.example) to `.env`. Set the same development `DATABASE_URL` and a `SESSION_SECRET`. Run the migration and demo seed commands above from the host, then run `docker compose up --build`. The default web and API ports are 3000 and 4000. If you change the web port, use the matching `WEB_ORIGIN`.

## Environment variables

| Variable                    | Location          | Purpose                                                                                   |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | API runtime       | Pooled PostgreSQL URL.                                                                    |
| `DATABASE_MIGRATION_URL`    | Migration tooling | Direct PostgreSQL URL for Drizzle migrations.                                             |
| `SESSION_SECRET`            | API runtime       | Random secret of at least 32 bytes.                                                       |
| `WEB_ORIGIN`                | API runtime       | Exact frontend origin, without a trailing slash.                                          |
| `PORT`                      | Local API         | Optional local HTTP port. Defaults to 4000.                                               |
| `TOTP_ENCRYPTION_KEY`       | API runtime       | Optional stable 64-character hex key for authenticator enrollment.                        |
| `DEMO_PASSWORD`             | Seed tooling      | Shared 12–128 character password for fictional users.                                     |
| `DEMO_PIN`                  | Portfolio seed    | Six-digit customer PIN for the portfolio fixtures.                                        |
| `API_ORIGIN`                | Web               | Express origin. Defaults to `http://localhost:4000` locally and requires HTTPS on Vercel. |
| `DEMO_LOGIN_ENABLED`        | Web build         | Set to `true` to enable quick-fill on an isolated demo deployment.                        |
| `NEXT_PUBLIC_DEMO_PASSWORD` | Web build         | Public quick-fill password for the three seeded fictional accounts.                       |
| `TEST_DATABASE_URL`         | Integration tests | Connection URL for a disposable test database.                                            |

## Deployment

1. Create two Vercel projects from this repository. Use `apps/api` for Express and `apps/web` for Next.js.
2. Provision an isolated Neon database. Apply the Drizzle migrations with its direct connection. Use [the portfolio seed template](apps/api/.env.demo.example) for the fictional demo dataset, then run `pnpm --filter @bankbolt/api db:seed:portfolio` explicitly against that database.
3. Set `DATABASE_URL`, `SESSION_SECRET`, and `WEB_ORIGIN` on the API project. Set `API_ORIGIN` to the HTTPS API URL on the web project.
4. In the **web** project's **Settings → Environment Variables**, select **Production** and set `DEMO_LOGIN_ENABLED` to `true` and `NEXT_PUBLIC_DEMO_PASSWORD` to the portfolio seed password for that isolated dataset. All three demo roles share this publicly visible password, so use it exclusively for the fictional accounts. Enable quick-fill in Preview only if it has its own isolated demo dataset.
5. Build a new Production deployment of the web project so it picks up the settings. Check `/api/v1/health` through the deployed web URL, then use each quick-fill button on `/login` and sign in to verify the configured password matches the seeded accounts.

For upgrades, apply pending migrations to the target database before the updated API serves traffic. Migration [0020](apps/api/drizzle/0020_operator_profile_photos.sql) adds the operator photo column used during sign-in and the Staff photo review table. If you use a restricted API role, verify it can read and update `users.photo_url` and read, insert, and update `staff_photo_requests`.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For PostgreSQL integration tests, run `docker compose --profile test-db up -d --wait test-db`. Copy [the test template](apps/api/.env.test.example) to `apps/api/.env.test` and set `TEST_DATABASE_URL` to `postgresql://bankbolt_test:bankbolt_test@127.0.0.1:55433/bankbolt_test`, then run `pnpm test:integration`. Use the disposable test database for this suite.
