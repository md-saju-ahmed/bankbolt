import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { LoanApplicationHistory } from "@/features/loans/loan-application-history";

export default async function LoansPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "customer") notFound();
  return (
    <DashboardShell role="CUSTOMER">
      <LoanApplicationHistory />
    </DashboardShell>
  );
}
