import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { Directory } from "@/features/management/directory";

export default async function DirectoryPage({
  params,
}: {
  params: Promise<{ workspace: string; section: string }>;
}) {
  const { workspace, section } = await params;
  if (
    (workspace !== "staff" && workspace !== "admin") ||
    (section !== "customers" && section !== "accounts")
  )
    notFound();
  const admin = workspace === "admin";
  return (
    <DashboardShell role={admin ? "ADMIN" : "STAFF"}>
      <Directory section={section} admin={admin} />
    </DashboardShell>
  );
}
