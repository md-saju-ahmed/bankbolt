import { notFound } from "next/navigation";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import {
  CustomerProfile,
  ProfileReview,
} from "@/features/profiles/profile-pages";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (workspace === "customer")
    return (
      <DashboardShell role="CUSTOMER">
        <CustomerProfile />
      </DashboardShell>
    );
  if (workspace === "admin" || workspace === "staff")
    return (
      <DashboardShell role={workspace === "admin" ? "ADMIN" : "STAFF"}>
        <ProfileReview workspace={workspace} />
      </DashboardShell>
    );
  notFound();
}
