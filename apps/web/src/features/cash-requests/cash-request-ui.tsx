import Link from "next/link";
import { cn } from "@/lib/utils";
import { secondaryStyle } from "@/features/onboarding/form-ui";
import { PostingAmount } from "@/features/transactions/transaction-display";
import {
  cashRequestStatuses,
  type CashRequest,
  type CashRequestStatus,
} from "./cash-requests-api";

export const cashRequestsPath = "/customer/cash-requests";
export const cashLinkStyle =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function CashRequestHeader({
  section,
}: {
  section: "history" | "deposit" | "withdrawal";
}) {
  const links = [
    { section: "history", path: cashRequestsPath, label: "Request history" },
    {
      section: "deposit",
      path: `${cashRequestsPath}/deposit`,
      label: "Request deposit",
    },
    {
      section: "withdrawal",
      path: `${cashRequestsPath}/withdrawal`,
      label: "Request withdrawal",
    },
  ];
  const titles = {
    history: "Cash requests",
    deposit: "Request a deposit",
    withdrawal: "Request a withdrawal",
  };
  return (
    <header className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {titles[section]}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Simulated cash requests are reviewed by BankBolt staff.
        </p>
      </div>
      <nav aria-label="Cash request pages" className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.path}
            href={link.path}
            aria-current={section === link.section ? "page" : undefined}
            className={cn(
              cashLinkStyle,
              section === link.section
                ? "border border-primary/25 bg-primary/10 text-primary"
                : secondaryStyle,
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

const statusStyles = {
  PENDING: "bg-warning-surface text-warning-ink",
  APPROVED: "bg-success-surface text-success-ink",
  CANCELLED: "bg-muted text-muted-foreground",
  REJECTED: "bg-danger-surface text-danger-ink",
};

export function CashRequestBadge({ status }: { status: CashRequestStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        statusStyles[status],
      )}
    >
      {cashRequestStatuses[status]}
    </span>
  );
}

export function CashRequestAmount({
  request,
}: {
  request: Pick<CashRequest, "amountPoisha" | "status" | "type">;
}) {
  return (
    <PostingAmount
      amountPoisha={request.amountPoisha}
      direction={
        request.status === "APPROVED"
          ? request.type === "DEPOSIT"
            ? "INCOMING"
            : "OUTGOING"
          : null
      }
    />
  );
}
