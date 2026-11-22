import { notFound } from "next/navigation";
import { AuthenticatorSettings } from "@/features/auth/authenticator-settings";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { workspaceRole } from "@/features/auth/identity";

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const role = workspaceRole((await params).workspace);
  if (!role) notFound();
  return (
    <DashboardShell role={role}>
      <AuthenticatorSettings />
    </DashboardShell>
  );
}
