"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DetailFields, Status } from "@/features/management/management-ui";
import {
  ErrorMessage,
  Field,
  onboardingError,
  primaryStyle,
} from "@/features/onboarding/form-ui";
import { formatDhakaTimestamp } from "@/lib/dhaka-date";
import {
  useRequestProfileChangeMutation,
  useUpdateProfileMutation,
  type ContactChanges,
  type Profile,
  type ProfileRequest,
} from "./profile-api";

const contactFields = [
  { name: "fullName", label: "Legal name", type: "text", maxLength: 120 },
  { name: "email", label: "Email address", type: "email", maxLength: 254 },
  { name: "phone", label: "Phone number", type: "tel", maxLength: 24 },
  { name: "address", label: "Address", type: "text", maxLength: 300 },
] as const;

const statuses = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function ProposedChanges({ request }: { request: ProfileRequest }) {
  return (
    <DetailFields
      fields={contactFields.flatMap(({ name, label }) =>
        request[name] === null ? [] : [[label, request[name]]],
      )}
    />
  );
}

function PersonalForm({
  profile,
  customerId,
}: {
  profile: Profile;
  customerId?: string;
}) {
  const [update, { isLoading }] = useUpdateProfileMutation();
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const occupation = String(data.get("occupation") ?? "").trim() || null;
    const photoUrl = String(data.get("photoUrl") ?? "").trim() || null;
    const changes = {
      occupation: occupation === profile.occupation ? undefined : occupation,
      photoUrl: photoUrl === (profile.photoUrl ?? null) ? undefined : photoUrl,
    };
    if (changes.occupation === undefined && changes.photoUrl === undefined) {
      setMessage("Change a detail before saving.");
      return;
    }
    setMessage("");
    try {
      await update({ customerId, changes }).unwrap();
      toast.success("Profile details saved.");
    } catch (error) {
      setMessage(onboardingError(error, "Could not save profile details."));
    }
  }

  return (
    <form method="post" onSubmit={save} className="space-y-3">
      <h3 className="text-base font-semibold">Photo and occupation</h3>
      <fieldset
        disabled={isLoading}
        className="grid min-w-0 gap-4 sm:grid-cols-2"
      >
        <Field
          placeholder="For example, designer"
          label="Occupation (optional)"
          name="occupation"
          defaultValue={profile.occupation ?? ""}
          maxLength={100}
        />
        <Field
          label="Photo URL (optional)"
          name="photoUrl"
          type="url"
          pattern="[Hh][Tt][Tt][Pp][Ss]://.+"
          title="Enter a public HTTPS image URL"
          maxLength={2048}
          defaultValue={profile.photoUrl ?? ""}
          placeholder="https://example.com/avatar.jpg"
        />
      </fieldset>
      <ErrorMessage message={message} />
      <Button type="submit" disabled={isLoading} className={primaryStyle}>
        {isLoading ? "Saving…" : "Save photo and occupation"}
      </Button>
    </form>
  );
}

function ContactForm({
  profile,
  customerId,
}: {
  profile: Profile;
  customerId?: string;
}) {
  const [submit, { isLoading }] = useRequestProfileChangeMutation();
  const [message, setMessage] = useState("");

  async function requestChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const changes: ContactChanges = {};
    for (const { name } of contactFields) {
      const value = String(data.get(name) ?? "").trim();
      if (value !== profile[name]) changes[name] = value;
    }
    if (!Object.keys(changes).length) {
      setMessage("Change at least one detail before submitting.");
      return;
    }
    setMessage("");
    try {
      await submit({
        customerId,
        changes,
        reason: String(data.get("reason") ?? "").trim(),
      }).unwrap();
      toast.success("Profile change submitted for review.");
    } catch (error) {
      setMessage(
        onboardingError(error, "Could not submit the profile change."),
      );
    }
  }

  return (
    <form method="post" onSubmit={requestChange} className="space-y-3">
      <h3 className="text-base font-semibold">Identity and contact details</h3>
      <p className="text-sm text-muted-foreground">
        The current details stay in effect until an administrator who did not
        submit the request approves it.
      </p>
      <fieldset
        disabled={isLoading}
        className="grid min-w-0 gap-4 sm:grid-cols-2"
      >
        {contactFields.map(({ label, name, ...input }) => (
          <Field
            key={name}
            label={label}
            name={name}
            {...input}
            defaultValue={profile[name]}
            required
          />
        ))}
        <div className="sm:col-span-2">
          <Field
            label="Reason for the change"
            name="reason"
            maxLength={300}
            minLength={3}
            placeholder="For example, I moved to a new address"
            required
          />
        </div>
      </fieldset>
      <ErrorMessage message={message} />
      <Button type="submit" disabled={isLoading} className={primaryStyle}>
        {isLoading ? "Submitting…" : "Submit for review"}
      </Button>
    </form>
  );
}

export function ProfileEditor({
  profile,
  requests,
  customerId,
  editable = true,
}: {
  profile: Profile;
  requests: ProfileRequest[];
  customerId?: string;
  editable?: boolean;
}) {
  const pending = requests.some(({ status }) => status === "PENDING");

  return (
    <div className="space-y-6">
      {editable && (
        <PersonalForm
          key={JSON.stringify([profile.occupation, profile.photoUrl])}
          profile={profile}
          customerId={customerId}
        />
      )}
      {editable && !pending && (
        <ContactForm
          key={JSON.stringify(contactFields.map(({ name }) => profile[name]))}
          profile={profile}
          customerId={customerId}
        />
      )}
      {(!editable || pending) && (
        <p className="text-sm text-muted-foreground">
          {editable
            ? "A profile change is awaiting review. You can request another after it is decided."
            : "Restore customer access before editing this profile."}
        </p>
      )}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">
          Recent profile change requests
        </h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {formatDhakaTimestamp(request.createdAt)} Dhaka
                  </p>
                  <Status value={request.status} labels={statuses} />
                </div>
                <ProposedChanges request={request} />
                <p className="break-words text-sm text-muted-foreground">
                  Request reason: {request.reason}
                </p>
                {request.reviewReason && (
                  <p className="break-words text-sm text-muted-foreground">
                    Review reason: {request.reviewReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
