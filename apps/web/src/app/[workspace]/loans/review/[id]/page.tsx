import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { LoanReviewDetail } from "@/features/loans/loan-review-detail";

export default async function ReviewLoanPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace, id } = await params;
  if (workspace !== "staff") notFound();
  return (
    <DashboardShell role="STAFF">
      <LoanReviewDetail id={id} />
    </DashboardShell>
  );
}
