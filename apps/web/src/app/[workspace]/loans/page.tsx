import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { LoanApplicationHistory } from "@/features/loans/loan-application-history";
import { LoanReviewQueue } from "@/features/loans/loan-review-queue";

export default async function LoansPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "customer" && workspace !== "staff") notFound();
  return (
    <DashboardShell role={workspace === "staff" ? "STAFF" : "CUSTOMER"}>
      {workspace === "staff" ? <LoanReviewQueue /> : <LoanApplicationHistory />}
    </DashboardShell>
  );
}
