const timestamps = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Dhaka",
});
const dates = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeZone: "Asia/Dhaka",
});
const fullTimestamps = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Asia/Dhaka",
});

// API timestamps are ISO 8601 instants with an explicit offset.
export function formatDhakaTimestamp(timestamp: string): string {
  return timestamps.format(new Date(timestamp));
}

export function formatDhakaDay(timestamp: string): string {
  return dates.format(new Date(timestamp));
}

export function formatDhakaFullTimestamp(timestamp: string): string {
  return `${fullTimestamps.format(new Date(timestamp))} (Asia/Dhaka)`;
}
