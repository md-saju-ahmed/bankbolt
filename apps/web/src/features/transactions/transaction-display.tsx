import { formatTaka } from "@/features/accounts/account-display";
import { cn } from "@/lib/utils";
import { transactionStatuses, type Transaction } from "./transactions-api";

const statusStyles = {
  COMPLETED: "bg-success-surface text-success-ink",
  PENDING: "bg-warning-surface text-warning-ink",
  FAILED: "bg-danger-surface text-danger-ink",
  REVERSED: "bg-muted text-muted-foreground",
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
  transaction: Pick<
    Transaction,
    "amountPoisha" | "direction" | "status" | "type"
  >;
}) {
  const { amountPoisha, direction, status, type } = transaction;
  const posted = status === "COMPLETED" || status === "REVERSED";
  const oneSidedDirection =
    type === "DEPOSIT" || type === "LOAN_DISBURSEMENT"
      ? "INCOMING"
      : type === "WITHDRAWAL" || type === "LOAN_REPAYMENT"
        ? "OUTGOING"
        : null;
  return (
    <PostingAmount
      amountPoisha={amountPoisha}
      direction={posted ? (direction ?? oneSidedDirection) : null}
    />
  );
}

export function PostingAmount({
  amountPoisha,
  direction,
}: {
  amountPoisha: string;
  direction: Transaction["direction"];
}) {
  const amount = BigInt(amountPoisha);
  const positive = amount > BigInt(0);
  const debit = amount < BigInt(0) || (positive && direction === "OUTGOING");
  const credit = positive && direction === "INCOMING";
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        debit && "text-danger-ink",
        credit && "text-success-ink",
      )}
    >
      {credit ? "+" : ""}
      {formatTaka((debit && positive ? -amount : amount).toString())}
    </span>
  );
}

export const historyLink =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
