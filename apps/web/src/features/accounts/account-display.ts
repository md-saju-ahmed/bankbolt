const wholeTaka = new Intl.NumberFormat("en-IN");
const poishaPerTaka = BigInt(100);
const zero = BigInt(0);
const maxPoisha = BigInt("9223372036854775807");

export function takaInput(poisha: string) {
  const amount = BigInt(poisha);
  const negative = amount < zero;
  const magnitude = negative ? -amount : amount;
  const fraction = (magnitude % poishaPerTaka).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${magnitude / poishaPerTaka}.${fraction}`;
}

export function formatTaka(poisha: string) {
  const amount = takaInput(poisha);
  const negative = amount.startsWith("-");
  const [whole, fraction] = (negative ? amount.slice(1) : amount).split(".");
  return `${negative ? "−" : ""}৳${wholeTaka.format(BigInt(whole))}.${fraction}`;
}

export function parseTakaInput(value: string) {
  const result = /^(\d{1,17})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!result)
    throw new Error("Enter BDT amounts with up to two decimal places.");
  const amount =
    BigInt(result[1]) * poishaPerTaka +
    BigInt((result[2] ?? "").padEnd(2, "0"));
  if (amount > maxPoisha) throw new Error("Enter a smaller BDT amount.");
  return amount.toString();
}

export const accountTypes = {
  SAVINGS: "Savings",
  CURRENT: "Current",
  BUSINESS: "Business",
};
export const accountStatuses = {
  PENDING: "Pending activation",
  ACTIVE: "Active",
  FROZEN: "Frozen",
  DEACTIVATED: "Deactivated",
};
export const customerStatuses = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  BLOCKED: "Blocked",
};
export const verificationStatuses = {
  VERIFIED: "Verified",
  PENDING: "Pending",
  REJECTED: "Rejected",
};
