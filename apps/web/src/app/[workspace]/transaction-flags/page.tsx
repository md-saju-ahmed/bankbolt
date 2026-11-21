import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { TransactionFlagsQueue } from "@/features/transactions/transaction-flags";

export default async function TransactionFlagsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "admin") notFound();
  return (
    <DashboardShell role="ADMIN">
      <TransactionFlagsQueue />
    </DashboardShell>
  );
}
