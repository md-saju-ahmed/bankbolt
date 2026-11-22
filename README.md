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

Customers can set their transaction PIN and send money from **Transfer funds**. The review dialog shows the server-quoted fee and total debit. **Transactions** is available in each workspace, with reference search, Dhaka date filters, and printable receipts for completed transactions. Customers see transfers involving their own accounts, while Staff and Admin can review the bank's transaction history.

- `PUT /api/v1/auth/transaction-pin` sets a six-digit PIN for a signed-in customer. Send `password` and `newPin`, plus `currentPin` if the customer already has a PIN. The same flow applies to fictional demo customers.
- `POST /api/v1/transfers` accepts `sourceAccountId`, `recipientAccountNumber`, a positive `amountPoisha` decimal string, `description`, `pin`, and a client-generated UUID `idempotencyKey`. The server calculates the fee and returns a receipt with HTTP 201. The PIN and transfer mutations require the configured web origin.
- Keep the same key and payment details until the result is known. `GET /api/v1/transfers/by-key/{idempotencyKey}` returns the submitting customer's committed receipt. A 404 means no receipt is visible yet. Resubmit the same request with the same key if needed. A committed replay returns the same receipt with HTTP 200, and changing the source, recipient, amount, or description under a committed key returns HTTP 409.

Admins can reverse a completed transfer once from its transaction details. The reversal requires a reason, debits the recipient's available principal, and credits the original sender with the principal and original fee. Both records remain linked in transaction history. Reversed transfers still count toward the original day's transfer limit.

### Simulated cash requests API

Customers can use **Cash requests** to submit a simulated deposit or withdrawal and track its review status. Approved requests link to the posted transaction in the customer workspace.

Staff and Admin use **Cash request review** to filter the queue, inspect requests, and confirm decisions. Finalized requests show the reviewer, decision time, and any rejection reason.

Staff can flag a transaction for Admin from its detail page with a reason. The Admin **Transaction flags** queue shows open and resolved flags. Resolving a flag records the reviewer, time, and optional note.

- Customers submit a deposit or withdrawal through `POST /api/v1/cash-requests` with `accountId`, `type` (`DEPOSIT` or `WITHDRAWAL`), `amountPoisha` as a positive decimal string, and `description`. The server records the request date. New pending withdrawals reserve funds. Available balance is posted balance minus holds. Approval posts the withdrawal and consumes the hold. Rejection releases it. Requests created before reservations were introduced are checked against available funds at approval.
- `GET /api/v1/cash-requests` lists requests with optional `status`, `type`, and `page` filters, and `GET /api/v1/cash-requests/{id}` returns one request. Customers can view only their own requests. Staff and Admin can view the review queue.
- Customers can POST to `/api/v1/cash-requests/{id}/cancel` to cancel their own pending request. Cancellation releases any hold and creates no transaction.
- Staff and Admin can POST to `/api/v1/cash-requests/{id}/approve` or `/api/v1/cash-requests/{id}/reject`. Reject requires a `reason`. Approval returns the reference for one posted transaction. Rejection leaves the balance intact. Repeated decisions return HTTP 409. Read the request detail to recover the recorded decision if a response is lost.

### Loan catalog and schedules API

The authenticated loan catalog at `GET /api/v1/loans/catalog` lists Personal, Education, and Business loan limits and terms. Each product uses 12% annual interest on the remaining principal. Monthly installments use the 1% monthly rate, rounded to poisha, with a final principal adjustment. Due dates follow the disbursement day in Asia/Dhaka and use the month's last day when that day is unavailable.

`GET /api/v1/loans` lists loan records, and `GET /api/v1/loans/{id}` includes the stored schedule. Customers can read their own loans. Staff and Admin can also read internal review notes.

Customers can review an installment estimate and submit an application from **Loans**. The application appears as **Pending** in their loan history. `GET /api/v1/loans/estimate` uses the requested type, principal in poisha, and term. `POST /api/v1/loans` accepts those terms with the customer's active disbursement account, declared monthly income, employment status, and description.

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

Copy the root `.env.example` to `.env`. Set `DATABASE_URL` to the pooled URL for your dedicated development database and set `SESSION_SECRET` to a generated secret. For a fresh database, configure `apps/api/.env.local` for that same database, then run the [migration](#postgresql-development-setup) and [demo sign-in setup](#authentication-and-demo-access) commands from the host.

Run `docker compose up --build`. Compose exposes the web app on port `3000` and the API on port `4000`. Open <http://localhost:3000/login> and use one of the seeded role emails with the password you configured. Check the API through <http://localhost:3000/api/v1/health>.

Set `WEB_PORT` or `API_PORT` in the root `.env` if host ports are occupied. Compose derives the allowed web origin from `WEB_PORT` unless you set `WEB_ORIGIN` explicitly. Update the browser URL and any explicit `WEB_ORIGIN` to match. The web container forwards requests to `http://api:4000` over the Compose network. Run `docker compose down` to stop the services.

## Tests

Run `pnpm test` for the unit and API suites, or use `pnpm test:unit` and `pnpm test:api` individually.

For the PostgreSQL integration suite, start the disposable test service with `docker compose --profile test-db up -d --wait test-db`. Copy `apps/api/.env.test.example` to `apps/api/.env.test` and set `TEST_DATABASE_URL` to `postgresql://bankbolt_test:bankbolt_test@127.0.0.1:55433/bankbolt_test`. Those credentials are only for the local Compose test database. To change the host port, set `TEST_DB_PORT` in both the root `.env` and `apps/api/.env.test`, and update the URL to match. Run `pnpm test:integration` to verify migrations and transaction rollback against PostgreSQL.
