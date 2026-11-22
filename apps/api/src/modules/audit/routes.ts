import { sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../../db/client.ts";
import { dhakaDayEnd, dhakaDayStart } from "../../lib/dhaka-date.ts";
import { requireAuth, requireRole } from "../auth/guards.ts";
import { pages } from "../onboarding/validation.ts";

const categories = [
  "MANAGEMENT",
  "CASH_REQUEST",
  "LOAN",
  "TRANSFER",
  "FLAG",
] as const;
const filters = pages
  .extend({
    category: z.enum(categories).optional(),
    search: z
      .string()
      .trim()
      .max(120)
      .refine((value) => !value.includes("\0"))
      .optional(),
    from: z.iso
      .date()
      .refine((date) => date >= "0001-01-01")
      .optional(),
    to: z.iso
      .date()
      .refine((date) => date >= "0001-01-01")
      .optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to);

type Event = {
  category: (typeof categories)[number];
  eventId: string;
  action: string;
  subjectId: string;
  actorId: string | null;
  actorName: string | null;
  occurredAt: Date;
};

export const auditRouter = Router();
auditRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
auditRouter.use(requireAuth, requireRole("ADMIN"));
auditRouter.get("/", async (request, response) => {
  const { page, category, search, from, to } = filters.parse(request.query);
  const size = 20;
  // Materialize the recorded lifecycle actions without duplicating writes or inventing historical actors.
  const result = await getDatabase().execute<Event>(sql`
    with events(category, event_id, action, subject_id, actor_id, occurred_at) as (
      select 'MANAGEMENT', m.id, m.action::text, coalesce(m.account_id, m.customer_id), m.actor_id, m.created_at
      from management_events m
      union all
      select 'CASH_REQUEST', c.id, c.status::text, c.id,
        case when c.status = 'CANCELLED' then p.user_id else c.reviewed_by end,
        coalesce(c.reviewed_at, c.cancelled_at)
      from cash_requests c join customer_profiles p on p.id = c.customer_id
      where c.status <> 'PENDING'
      union all
      select 'LOAN', l.id, phase.action, l.id, phase.actor_id, phase.occurred_at
      from loans l
      cross join lateral (values
        ('UNDER_REVIEW', l.review_started_by, l.review_started_at),
        ('FORWARDED', l.forwarded_by, l.forwarded_at),
        (case when l.rejection_reason is not null then 'REJECTED' else 'APPROVED' end, l.decided_by, l.decided_at)
      ) phase(action, actor_id, occurred_at)
      where phase.occurred_at is not null
      union all
      select 'LOAN', t.id, case when t.type = 'LOAN_DISBURSEMENT' then 'DISBURSED'
        when settlement.loan_id is not null then 'SETTLED' else 'COMPLETED' end,
        t.loan_id, t.initiated_by, t.created_at
      from transactions t join loans l on l.id = t.loan_id
      left join loan_settlements settlement on settlement.transaction_id = t.id
      where t.status = 'COMPLETED' and (t.type = 'LOAN_DISBURSEMENT'
        or (t.type = 'LOAN_REPAYMENT' and t.created_at = l.completed_at))
      union all
      select 'TRANSFER', t.id, 'REVERSED', original.reference, t.initiated_by, t.created_at
      from transactions t join transactions original on original.id = t.reverses_transaction_id
      where t.type = 'TRANSFER_REVERSAL'
      union all
      select 'FLAG', f.id, phase.action, t.reference, phase.actor_id, phase.occurred_at
      from transaction_flags f join transactions t on t.id = f.transaction_id
      cross join lateral (values
        ('FLAGGED', f.flagged_by, f.created_at),
        ('RESOLVED', f.resolved_by, f.resolved_at)
      ) phase(action, actor_id, occurred_at)
      where phase.occurred_at is not null
    )
    select e.category, e.event_id as "eventId", e.action, e.subject_id as "subjectId",
      e.actor_id as "actorId", u.full_name as "actorName", e.occurred_at as "occurredAt"
    from events e left join users u on u.id = e.actor_id
    where true
      ${category ? sql`and e.category = ${category}` : sql``}
      ${from ? sql`and e.occurred_at >= ${dhakaDayStart(from)}` : sql``}
      ${to ? sql`and e.occurred_at < ${dhakaDayEnd(to)}` : sql``}
      ${search ? sql`and strpos(lower(concat_ws(' ', e.subject_id::text, e.actor_id::text, replace(e.action, '_', ' '), u.full_name)), lower(${search})) > 0` : sql``}
    order by e.occurred_at desc, e.category, e.event_id desc, e.action
    limit ${size + 1} offset ${(page - 1) * size}
  `);
  response.json({
    events: result.rows.slice(0, size),
    hasNextPage: result.rows.length > size,
  });
});
