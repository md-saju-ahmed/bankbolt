import { formatTaka } from "@/features/accounts/account-display";
import { cn } from "@/lib/utils";
import { transactionStatuses, type Transaction } from "./transactions-api";

const statusStyles = {
  COMPLETED: "bg-emerald-50 text-emerald-800",
  PENDING: "bg-amber-50 text-amber-800",
  FAILED: "bg-red-50 text-red-800",
  REVERSED: "bg-slate-100 text-slate-700",
};

export const directions = {
  INTERNAL: "Between your accounts",
  INCOMING: "Incoming",
  OUTGOING: "Outgoing",
};

export function TransactionStatus({
  status,
}: {
  status: Transaction["status"];
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        statusStyles[status],
      )}
    >
      {transactionStatuses[status]}
    </span>
  );
}

export function TransactionAmount({
  transaction,
}: {
  transaction: Pick<Transaction, "amountPoisha" | "direction" | "status">;
}) {
  const { amountPoisha, direction, status } = transaction;
  const signed = status === "COMPLETED";
  const amount =
    direction === "OUTGOING" && signed ? `-${amountPoisha}` : amountPoisha;
  const sign = direction === "INCOMING" && signed ? "+" : "";
  return (
    <span className="font-semibold tabular-nums">
      {sign}
      {formatTaka(amount)}
    </span>
  );
}

export const historyLink =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
