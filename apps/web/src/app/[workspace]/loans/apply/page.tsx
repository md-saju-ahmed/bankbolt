import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { LoanApplicationForm } from "@/features/loans/loan-application-form";

export default async function ApplyForLoanPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "customer") notFound();
  return (
    <DashboardShell role="CUSTOMER">
      <LoanApplicationForm />
    </DashboardShell>
  );
}
