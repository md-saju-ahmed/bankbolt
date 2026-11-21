import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { CustomerLoanDetail } from "@/features/loans/customer-loan-detail";

export default async function LoanDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace, id } = await params;
  if (workspace !== "customer") notFound();
  return (
    <DashboardShell role="CUSTOMER">
      <CustomerLoanDetail id={id} />
    </DashboardShell>
  );
}
