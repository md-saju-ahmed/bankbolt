import { notFound } from "next/navigation";
import { MyAccounts } from "@/features/accounts/my-accounts";
import { DashboardShell } from "@/features/auth/dashboard-shell";

export default async function MyAccountsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace !== "customer") notFound();
  return (
    <DashboardShell role="CUSTOMER">
      <MyAccounts />
    </DashboardShell>
  );
}
