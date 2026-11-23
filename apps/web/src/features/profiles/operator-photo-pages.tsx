"use client";

import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailSkeleton, ListSkeleton } from "@/components/ui/skeleton";
import { errorCode } from "@/features/auth/auth-api";
import { ConfirmAction, Pager } from "@/features/management/management-ui";
import {
  ErrorMessage,
  Field,
  onboardingError,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import {
  useDecideStaffPhotoMutation,
  useOperatorPhotoQuery,
  useSaveOperatorPhotoMutation,
  useStaffPhotoQueueQuery,
} from "./operator-photo-api";
import { ProfileLoadError, ProfileReviewNavigation } from "./profile-pages";

export function OperatorPhotoPage() {
  const query = useOperatorPhotoQuery(undefined, { refetchOnFocus: true });
  const [save, { isLoading }] = useSaveOperatorPhotoMutation();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const data = query.currentData;
  const staff = data?.role === "STAFF";
  const pending = data?.request?.status === "PENDING";

  async function submit(photoUrl: string | null) {
    setError(undefined);
    setNotice(undefined);
    try {
      await save({ staff, photoUrl }).unwrap();
      setPreview(null);
      setNotice(
        staff ? "Request sent for Admin approval." : "Profile picture updated.",
      );
    } catch (failure) {
      const code = errorCode(failure);
      setError(
        code === "PHOTO_PENDING"
          ? "A profile picture request is already pending."
          : code === "PHOTO_UNCHANGED"
            ? "Choose a different profile picture."
            : onboardingError(
                failure,
                "Could not save your profile picture. Check the URL and try again.",
              ),
      );
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(
      new FormData(event.currentTarget).get("photoUrl") ?? "",
    ).trim();
    if (url) void submit(url);
  }

  return (
    <section className="max-w-xl space-y-5">
      <h1 className="text-2xl font-semibold sm:text-3xl">Profile picture</h1>
      {query.isError ? (
        <ProfileLoadError
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : !data ? (
        <DetailSkeleton label="Loading your profile picture" />
      ) : (
        <Card className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap gap-5">
            <PhotoPreview
              name={data.fullName}
              url={data.photoUrl}
              label="Current photo"
            />
            {pending && (
              <PhotoPreview
                name={data.fullName}
                url={data.request?.photoUrl}
                label={
                  data.request?.photoUrl
                    ? "Pending approval"
                    : "Removal pending"
                }
              />
            )}
            {!pending && preview && (
              <PhotoPreview
                name={data.fullName}
                url={preview}
                label="Preview"
              />
            )}
          </div>
          {staff && (
            <p className="text-sm text-muted-foreground">
              An Admin must approve changes before your profile picture updates.
            </p>
          )}
          {data.request?.status === "REJECTED" && (
            <p className="text-sm break-words">
              Last request rejected. {data.request.reviewReason}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {error && <ErrorMessage message={error} />}
          {!pending && (
            <form method="post" className="space-y-3" onSubmit={onSubmit}>
              <Field
                label="Public HTTPS image URL"
                name="photoUrl"
                type="url"
                required
                maxLength={2048}
                pattern="https://.+"
                title="Use a public HTTPS image URL."
                disabled={isLoading}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  className={secondaryStyle}
                  disabled={isLoading}
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (form?.reportValidity()) {
                      setPreview(
                        String(new FormData(form).get("photoUrl")).trim(),
                      );
                    }
                  }}
                >
                  Preview
                </Button>
                <Button
                  type="submit"
                  className={primaryStyle}
                  disabled={isLoading}
                >
                  {staff ? "Submit for approval" : "Save photo"}
                </Button>
                {data.photoUrl && (
                  <Button
                    className={secondaryStyle}
                    disabled={isLoading}
                    onClick={() => void submit(null)}
                  >
                    {staff ? "Request removal" : "Remove photo"}
                  </Button>
                )}
              </div>
            </form>
          )}
        </Card>
      )}
    </section>
  );
}

function PhotoPreview({
  name,
  url,
  label,
}: {
  name: string;
  url?: string | null;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-sm">
      <Avatar className="size-14" name={name} photoUrl={url} />
      <span>{label}</span>
    </div>
  );
}

export function StaffPhotoReview() {
  const [page, setPage] = useState(1);
  const query = useStaffPhotoQueueQuery(page, { refetchOnFocus: true });
  const [decide] = useDecideStaffPhotoMutation();
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
      <ProfileReviewNavigation staffPhotos />
      {query.isError ? (
        <ProfileLoadError
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : !data ? (
        <Card>
          <ListSkeleton label="Loading Staff photo requests" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {data.requests.length ? (
            <ul className="divide-y">
              {data.requests.map((item) => (
                <li key={item.id} className="space-y-3 p-4 sm:p-5">
                  <h2 className="break-words font-semibold">{item.fullName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDhakaTimestamp(item.createdAt)} Dhaka
                  </p>
                  <div className="flex flex-wrap gap-5">
                    <PhotoPreview
                      name={item.fullName}
                      url={item.currentPhotoUrl}
                      label="Current photo"
                    />
                    <PhotoPreview
                      name={item.fullName}
                      url={item.photoUrl}
                      label={item.photoUrl ? "Proposed photo" : "Remove photo"}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["APPROVED", "REJECTED"] as const).map((status) => (
                      <ConfirmAction
                        key={status}
                        title={
                          status === "APPROVED"
                            ? "Approve photo change"
                            : "Reject photo change"
                        }
                        description={
                          status === "APPROVED"
                            ? "The approved change will appear in the Staff member's account menu. They can read your reason."
                            : "The Staff member can read your reason."
                        }
                        dangerous={status === "REJECTED"}
                        onConfirm={async (fields) => {
                          await decide({
                            id: item.id,
                            status,
                            reason: String(fields.get("reason") ?? ""),
                          }).unwrap();
                        }}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              No pending Staff photo requests on this page.
            </p>
          )}
          {(page > 1 || data.hasNextPage) && (
            <div className="border-t p-4">
              <Pager page={page} next={data.hasNextPage} onPage={setPage} />
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
