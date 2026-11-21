import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { workspaceRole } from "@/features/auth/identity";
import { AdminOverview } from "@/features/reports/admin-overview";
import { CustomerOverview } from "@/features/reports/customer-overview";
import { StaffOverview } from "@/features/reports/staff-overview";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const role = workspaceRole(workspace);
  if (!role) notFound();
  return (
    <DashboardShell role={role}>
      {role === "ADMIN" ? (
        <AdminOverview />
      ) : role === "CUSTOMER" ? (
        <CustomerOverview />
      ) : (
        <StaffOverview />
      )}
    </DashboardShell>
  );
}
