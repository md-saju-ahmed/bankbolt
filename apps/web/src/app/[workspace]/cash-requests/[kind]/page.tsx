import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { CashRequestForm } from "@/features/cash-requests/cash-request-form";

export default async function CashRequestEntryPage({
  params,
}: {
  params: Promise<{ workspace: string; kind: string }>;
}) {
  const { workspace, kind } = await params;
  if (workspace !== "customer" || (kind !== "deposit" && kind !== "withdrawal"))
    notFound();
  return (
    <DashboardShell role="CUSTOMER">
      <CashRequestForm
        key={kind}
        type={kind === "deposit" ? "DEPOSIT" : "WITHDRAWAL"}
      />
    </DashboardShell>
  );
}
