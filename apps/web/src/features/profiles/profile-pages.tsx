"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailSkeleton, ListSkeleton } from "@/components/ui/skeleton";
import { errorCode } from "@/features/auth/auth-api";
import {
  ConfirmAction,
  DetailFields,
  Pager,
} from "@/features/management/management-ui";
import {
  ErrorMessage,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import {
  useDecideProfileChangeMutation,
  useOwnProfileQuery,
  useProfileReviewQuery,
} from "./profile-api";
import { ProfileEditor, ProposedChanges } from "./profile-editor";

export function ProfileLoadError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <Card className="space-y-2 p-4">
      <ErrorMessage
        message={onboardingError(
          error,
          "Could not load the profile information.",
        )}
      />
      <Button className={secondaryStyle} onClick={retry}>
        Try again
      </Button>
    </Card>
  );
}

export function ProfileReviewNavigation({
  staffPhotos,
}: {
  staffPhotos: boolean;
}) {
  return (
    <nav
      aria-label="Profile review categories"
      className="flex flex-wrap gap-2"
    >
      <Link
        href="/admin/profile"
        aria-current={!staffPhotos ? "page" : undefined}
        className={
          "inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold " +
          (!staffPhotos ? primaryStyle : secondaryStyle)
        }
      >
        Customer profiles
      </Link>
      <Link
        href="/admin/profile?view=staff-photos"
        aria-current={staffPhotos ? "page" : undefined}
        className={
          "inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold " +
          (staffPhotos ? primaryStyle : secondaryStyle)
        }
      >
        Staff photos
      </Link>
    </nav>
  );
}

export function CustomerProfile() {
  const query = useOwnProfileQuery(undefined, { refetchOnFocus: true });
  const data = query.currentData;
  return (
    <section className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold sm:text-3xl">My profile</h1>
      {query.isError ? (
        <ProfileLoadError
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : data ? (
        <Card className="space-y-6 p-4 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              name={data.profile.fullName}
              photoUrl={data.profile.photoUrl}
              className="size-12"
            />
            <h2 className="min-w-0 break-words text-xl font-semibold">
              {data.profile.fullName}
            </h2>
          </div>
          <DetailFields
            fields={[
              ["Current email", data.profile.email],
              ["Current phone", data.profile.phone],
              ["Current address", data.profile.address],
              ["Current occupation", data.profile.occupation],
            ]}
          />
          <ProfileEditor profile={data.profile} requests={data.requests} />
        </Card>
      ) : (
        <DetailSkeleton label="Loading your profile" />
      )}
    </section>
  );
}

export function ProfileReview({ workspace }: { workspace: "admin" | "staff" }) {
  const [page, setPage] = useState(1);
  const query = useProfileReviewQuery(page, { refetchOnFocus: true });
  const [decide] = useDecideProfileChangeMutation();
  const data = query.currentData;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          Profile change review
        </h1>
        <Button
          className={secondaryStyle}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
        </Button>
      </header>
      {workspace === "admin" && <ProfileReviewNavigation staffPhotos={false} />}
      {query.isError ? (
        <ProfileLoadError
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          {data.requests.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground sm:p-5">
              No pending profile changes on this page.
            </p>
          ) : (
            <ul className="divide-y">
              {data.requests.map((request) => (
                <li key={request.id} className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="min-w-0 break-words text-base font-semibold">
                      {request.customerName}
                    </h2>
                    <Link
                      href={`/${workspace}/management/customers?id=${request.customerId}`}
                      className="text-sm font-medium text-primary underline underline-offset-4"
                    >
                      Open customer
                    </Link>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDhakaTimestamp(request.createdAt)} Dhaka
                  </p>
                  <ProposedChanges
                    request={request}
                    current={request.currentProfile}
                  />
                  <p className="break-words text-sm text-muted-foreground">
                    Request reason: {request.reason}
                  </p>
                  {request.canReview ? (
                    <div className="flex flex-wrap gap-2">
                      {(["APPROVED", "REJECTED"] as const).map((status) => (
                        <ConfirmAction
                          key={status}
                          title={
                            status === "APPROVED"
                              ? "Approve profile change"
                              : "Reject profile change"
                          }
                          description={
                            status === "APPROVED"
                              ? "Confirm you have verified the customer's identity and the proposed details. The customer can read your reason."
                              : "The customer's details will stay as they are. The customer can read your reason."
                          }
                          dangerous={status === "REJECTED"}
                          onConfirm={async (fields) => {
                            try {
                              await decide({
                                id: request.id,
                                status,
                                reason: String(fields.get("reason") ?? ""),
                              }).unwrap();
                            } catch (error) {
                              if (errorCode(error) === "EMAIL_IN_USE")
                                throw new Error(
                                  "The proposed email is already registered.",
                                );
                              throw error;
                            }
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      A different staff member or administrator must review the
                      request you submitted.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(page > 1 || data.hasNextPage) && (
            <div className="border-t p-4">
              <Pager page={page} next={data.hasNextPage} onPage={setPage} />
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <ListSkeleton label="Loading profile changes" />
        </Card>
      )}
    </section>
  );
}
