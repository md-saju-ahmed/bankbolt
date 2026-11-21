import { sql } from "drizzle-orm";

const calendarDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Return a YYYY-MM-DD calendar date for an instant in the business timezone.
export function dhakaDate(instant: Date): string {
  return calendarDate.format(instant);
}
export function dhakaDayStart(day: string) {
  return sql`${day}::date::timestamp at time zone 'Asia/Dhaka'`;
}

export function dhakaDayEnd(day: string) {
  return sql`(${day}::date + 1)::timestamp at time zone 'Asia/Dhaka'`;
}
