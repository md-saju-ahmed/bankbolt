import Link from "next/link";
import { cn } from "@/lib/utils";
import { secondaryStyle } from "@/features/onboarding/form-ui";
import {
  cashRequestStatuses,
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
  PENDING: "bg-amber-50 text-amber-800",
  APPROVED: "bg-emerald-50 text-emerald-800",
  REJECTED: "bg-red-50 text-red-800",
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
