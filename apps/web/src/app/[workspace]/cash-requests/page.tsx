import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { CashRequestHistory } from "@/features/cash-requests/cash-request-history";

export default async function CashRequestsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "customer") notFound();
  return (
    <DashboardShell role="CUSTOMER">
      <CashRequestHistory />
    </DashboardShell>
  );
}
