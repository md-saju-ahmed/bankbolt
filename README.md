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
and check the API through the web origin at <http://localhost:3000/api/v1/health>.
Use `pnpm build` for a production build and `pnpm typecheck` to check types.

- `apps/web` contains the Next.js App Router frontend with Tailwind CSS and local shadcn/ui components.
- `apps/api` contains the Express API. Run `pnpm --filter @bankbolt/api dev` to start it independently. Set `PORT` in the shell to override its default port of `4000` when running it independently.

The web app forwards `/api/v1/*` to Express. Set the server-side `API_ORIGIN` in `apps/web/.env.local` to override `http://localhost:4000`. For Vercel, use separate projects rooted at `apps/web` and `apps/api`, and set `API_ORIGIN` to the matching HTTPS API origin in each web deployment environment.

## Authentication and demo access

Set a randomly generated `SESSION_SECRET` of at least 32 bytes in the API environment. Set `WEB_ORIGIN` to the exact frontend origin, such as `http://localhost:3000` for local development or the HTTPS web URL for Vercel. Use separate secrets and origins for each environment.

After running the database migrations, set `DEMO_PASSWORD` in `apps/api/.env.local` to a private password of at least 12 characters and run `pnpm --filter @bankbolt/api db:seed:demo` against the intended development database. The command creates these fictional accounts and preserves existing passwords and account state when repeated.

| Role       | Demo email                  |
| ---------- | --------------------------- |
| Admin      | `admin@bankbolt.example`    |
| Bank Staff | `staff@bankbolt.example`    |
| Customer   | `customer@bankbolt.example` |

Visit `/login` and use the configured demo password. The web app restores the session and opens the signed-in account's workspace. Redux Toolkit holds client UI state, and RTK Query manages requests and the session cache.

### Customer onboarding

In the Staff or Admin workspace, open **Customer onboarding**. Register a fictional customer with a temporary password, or reopen an existing record by email. Review the submitted details and save a verification decision. Verified, unblocked customers can receive Savings, Current, or Business accounts. Express assigns each account an immutable number and opens it at ৳0.00. Staff or Admin can activate the pending account after confirmation.

Staff and Admin can search **Customers** and **Bank accounts**. Admin can manage customer access, freeze or deactivate accounts, restore eligible accounts, and update Business details or transfer limits. Confirmed changes record the actor, reason, and time. Deactivating or blocking customer access revokes existing sessions. Customers use **My accounts** to switch between their own accounts and see the balance or restriction for the selected account.

Express verifies salted scrypt password hashes and uses PostgreSQL-backed sessions. Session cookies are HttpOnly and SameSite=Lax with an eight-hour lifetime. Deployed cookies also require HTTPS. Express checks the request origin on sign-in and sign-out, reloads the user's role and block status on protected calls, and limits repeated login and PIN attempts in PostgreSQL.

### Transaction PIN and transfers API

- `PUT /api/v1/auth/transaction-pin` sets a six-digit PIN for a signed-in customer. Send `password` and `newPin`, plus `currentPin` if the customer already has a PIN. The same flow applies to fictional demo customers.
- `POST /api/v1/transfers` accepts `sourceAccountId`, `recipientAccountNumber`, a positive `amountPoisha` decimal string, `description`, `pin`, and a client-generated UUID `idempotencyKey`. The server calculates the fee and returns a receipt with HTTP 201. The PIN and transfer mutations require the configured web origin.
- Keep the same key and payment details until the result is known. `GET /api/v1/transfers/by-key/{idempotencyKey}` returns the submitting customer's committed receipt. A 404 means no receipt is visible yet. Resubmit the same request with the same key if needed. A committed replay returns the same receipt with HTTP 200, and changing the source, recipient, amount, or description under a committed key returns HTTP 409.

## PostgreSQL development setup

Copy `apps/api/.env.example` to `apps/api/.env.local`. Set `DATABASE_URL` to the pooled connection string from a dedicated Neon development database or branch. Set `DATABASE_MIGRATION_URL` to its direct connection string. Keep both URLs in the API environment and retain Neon's TLS settings.

```sh
pnpm --filter @bankbolt/api db:ping
pnpm --filter @bankbolt/api db:generate --name=describe_schema_change
pnpm --filter @bankbolt/api db:check
pnpm --filter @bankbolt/api db:migrate
```

Generate a migration after changing the Drizzle schema. Review its SQL and metadata under `apps/api/drizzle` before applying it to the intended database. The identity migration creates users, customer profiles, sessions, and authentication attempt records. The health route reports API liveness, and `db:ping` checks PostgreSQL separately.

## Docker development

Copy the root `.env.example` to `.env` and set `DATABASE_URL` to the pooled Neon development URL. Set `SESSION_SECRET` to the generated secret before using sign-in. Run `docker compose up --build`. Compose exposes the web app on port `3000` and the API on port `4000`. Set `WEB_PORT` or `API_PORT` in the root `.env` if host ports are occupied. The web container forwards requests to `http://api:4000` over the Compose network. Run `docker compose down` to stop the services.

## Tests

Run `pnpm test` for the unit and API suites, or use `pnpm test:unit` and `pnpm test:api` individually.

For the PostgreSQL integration suite, start the disposable test service with `docker compose --profile test-db up -d --wait test-db`. Copy `apps/api/.env.test.example` to `apps/api/.env.test` and set `TEST_DATABASE_URL` to `postgresql://bankbolt_test:bankbolt_test@127.0.0.1:55433/bankbolt_test`. Those credentials are only for the local Compose test database. To change the host port, set `TEST_DB_PORT` in both the root `.env` and `apps/api/.env.test`, and update the URL to match. Run `pnpm test:integration` to verify migrations and transaction rollback against PostgreSQL.
