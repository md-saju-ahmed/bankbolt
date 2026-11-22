import { notFound } from "next/navigation";
import { AuditHistory } from "@/features/audit/audit-history";
import { DashboardShell } from "@/features/auth/dashboard-shell";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "admin") notFound();
  return (
    <DashboardShell role="ADMIN">
      <AuditHistory />
    </DashboardShell>
  );
}
