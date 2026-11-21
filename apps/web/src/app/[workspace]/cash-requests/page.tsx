import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { workspaceRole } from "@/features/auth/identity";
import { CashRequestHistory } from "@/features/cash-requests/cash-request-history";
import { CashReviewQueue } from "@/features/cash-requests/cash-review-queue";

export default async function CashRequestsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const role = workspaceRole(workspace);
  if (!role) notFound();
  return (
    <DashboardShell role={role}>
      {role === "CUSTOMER" ? (
        <CashRequestHistory />
      ) : (
        <CashReviewQueue root={`/${workspace}/cash-requests`} />
      )}
    </DashboardShell>
  );
}
