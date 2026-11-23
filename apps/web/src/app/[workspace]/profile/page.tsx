import { notFound } from "next/navigation";
import {
  OperatorPhotoPage,
  StaffPhotoReview,
} from "@/features/profiles/operator-photo-pages";
import { DashboardShell } from "@/features/auth/dashboard-shell";
import {
  CustomerProfile,
  ProfileReview,
} from "@/features/profiles/profile-pages";

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { workspace } = await params;
  if (workspace === "customer")
    return (
      <DashboardShell role="CUSTOMER">
        <CustomerProfile />
      </DashboardShell>
    );
  const { view } = await searchParams;
  if (workspace === "admin" || workspace === "staff")
    return (
      <DashboardShell role={workspace === "admin" ? "ADMIN" : "STAFF"}>
        {view === "photo" ? (
          <OperatorPhotoPage />
        ) : workspace === "admin" && view === "staff-photos" ? (
          <StaffPhotoReview />
        ) : (
          <ProfileReview workspace={workspace} />
        )}
      </DashboardShell>
    );
  notFound();
}
