import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { TransferPageContent } from "@/features/transactions/transfer";

export default async function TransferPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "customer") notFound();
  return (
    <DashboardShell role="CUSTOMER">
      <TransferPageContent />
    </DashboardShell>
  );
}
