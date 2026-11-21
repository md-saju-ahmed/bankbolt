import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { workspaceRole } from "@/features/auth/identity";
import { TransactionDetail } from "@/features/transactions/transaction-detail";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ workspace: string; reference: string }>;
}) {
  const { workspace, reference } = await params;
  const role = workspaceRole(workspace);
  if (!role) notFound();
  return (
    <DashboardShell role={role} printable>
      <TransactionDetail
        root={`/${workspace}/transactions`}
        reference={reference}
        receipt
      />
    </DashboardShell>
  );
}
