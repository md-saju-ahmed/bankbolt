const wholeTaka = new Intl.NumberFormat("en-IN");
const poishaPerTaka = BigInt(100);

export function takaInput(poisha: string) {
  const amount = BigInt(poisha);
  return `${amount / poishaPerTaka}.${(amount % poishaPerTaka).toString().padStart(2, "0")}`;
}

export function formatTaka(poisha: string) {
  const [whole, fraction] = takaInput(poisha).split(".");
  return `৳${wholeTaka.format(BigInt(whole))}.${fraction}`;
}

export function parseTakaInput(value: string) {
  const result = /^(\d{1,17})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!result)
    throw new Error("Enter BDT amounts with up to two decimal places.");
  return (
    BigInt(result[1]) * poishaPerTaka +
    BigInt((result[2] ?? "").padEnd(2, "0"))
  ).toString();
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
