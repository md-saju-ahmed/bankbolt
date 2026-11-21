import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { LoanReviewDetail } from "@/features/loans/loan-review-detail";

export default async function ReviewLoanPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace, id } = await params;
  if (workspace !== "staff" && workspace !== "admin") notFound();
  return (
    <DashboardShell role={workspace === "admin" ? "ADMIN" : "STAFF"}>
      <LoanReviewDetail id={id} workspace={workspace} />
    </DashboardShell>
  );
}
