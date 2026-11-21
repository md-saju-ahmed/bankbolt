const timestamps = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Dhaka",
});

// API timestamps are ISO 8601 instants with an explicit offset.
export function formatDhakaTimestamp(timestamp: string): string {
  return timestamps.format(new Date(timestamp));
}
