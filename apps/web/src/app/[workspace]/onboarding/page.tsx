import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { Onboarding } from "@/features/onboarding/onboarding";

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { workspace } = await params;
  if (workspace !== "staff" && workspace !== "admin") notFound();
  const { mode } = await searchParams;
  const entryMode = mode === "register" ? "register" : "find";
  return (
    <DashboardShell role={workspace === "staff" ? "STAFF" : "ADMIN"}>
      <Onboarding key={entryMode} entryMode={entryMode} />
    </DashboardShell>
  );
}
