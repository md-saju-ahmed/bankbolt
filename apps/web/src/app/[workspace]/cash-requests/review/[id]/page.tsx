import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { workspaceRole } from "@/features/auth/identity";
import { CashReviewDetail } from "@/features/cash-requests/cash-review-detail";

export default async function CashReviewPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace, id } = await params;
  const role = workspaceRole(workspace);
  if (role !== "STAFF" && role !== "ADMIN") notFound();
  return (
    <DashboardShell role={role}>
      <CashReviewDetail key={id} id={id} workspace={workspace} />
    </DashboardShell>
  );
}
