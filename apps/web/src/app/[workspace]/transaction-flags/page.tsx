import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { TransactionFlagsQueue } from "@/features/transactions/transaction-flags";

export default async function TransactionFlagsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "admin" && workspace !== "staff") notFound();
  return (
    <DashboardShell role={workspace === "admin" ? "ADMIN" : "STAFF"}>
      <TransactionFlagsQueue workspace={workspace} />
    </DashboardShell>
  );
}
