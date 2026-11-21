import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { workspaces, type Role } from "@/features/auth/identity";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const role = (Object.keys(workspaces) as Role[]).find(
    (key) => workspaces[key].path === `/${workspace}`,
  );
  if (!role) notFound();
  return <DashboardShell role={role} />;
}
