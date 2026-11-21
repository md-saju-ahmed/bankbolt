import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { workspaceRole } from "@/features/auth/identity";
import { TransactionHistory } from "@/features/transactions/history";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const role = workspaceRole(workspace);
  if (!role) notFound();
  return (
    <DashboardShell role={role}>
      <TransactionHistory root={`/${workspace}/transactions`} />
    </DashboardShell>
  );
}
