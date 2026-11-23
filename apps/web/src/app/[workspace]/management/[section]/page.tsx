import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import { Directory } from "@/features/management/directory";

export default async function DirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; section: string }>;
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const { workspace, section } = await params;
  if (
    (workspace !== "staff" && workspace !== "admin") ||
    (section !== "customers" && section !== "accounts")
  )
    notFound();
  const admin = workspace === "admin";
  const { id } = await searchParams;
  const initialCustomerId =
    section === "customers" && typeof id === "string" ? id : undefined;
  return (
    <DashboardShell role={admin ? "ADMIN" : "STAFF"}>
      <Directory
        key={initialCustomerId ?? section}
        section={section}
        admin={admin}
        initialCustomerId={initialCustomerId}
      />
    </DashboardShell>
  );
}
