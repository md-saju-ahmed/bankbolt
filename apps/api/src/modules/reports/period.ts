import { z } from "zod";
import { dhakaDate } from "../../lib/dhaka-date.ts";

const date = z.iso.date().refine((value) => value >= "0001-01-01");
const dateFields = { from: date.optional(), to: date.optional() };

function monthIndex(day: string) {
  return Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
}

function monthLabel(index: number) {
  const year = String(Math.floor(index / 12)).padStart(4, "0");
  const month = String((index % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function validRange({ from, to }: { from?: string; to?: string }) {
  if (from === undefined || to === undefined) return from === to;
  return from <= to && monthIndex(to) - monthIndex(from) < 24;
}

export const adminReportQuery = z.strictObject(dateFields).refine(validRange);
export const customerReportQuery = z
  .strictObject({ ...dateFields, accountId: z.uuid().optional() })
  .refine(validRange);
export const staffReportQuery = z.strictObject({});

export function reportPeriod({ from, to }: z.infer<typeof adminReportQuery>) {
  const end = to ?? dhakaDate(new Date());
  const start = from ?? `${monthLabel(monthIndex(end) - 5)}-01`;
  const firstMonth = monthIndex(start);
  return {
    from: start,
    to: end,
    timeZone: "Asia/Dhaka" as const,
    months: Array.from(
      { length: monthIndex(end) - firstMonth + 1 },
      (_, index) => monthLabel(firstMonth + index),
    ),
  };
}
