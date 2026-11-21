import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { Onboarding } from "@/features/onboarding/onboarding";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "staff" && workspace !== "admin") notFound();
  return (
    <DashboardShell role={workspace === "staff" ? "STAFF" : "ADMIN"}>
      <Onboarding />
    </DashboardShell>
  );
}
