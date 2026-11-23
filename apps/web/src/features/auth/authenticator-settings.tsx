"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { errorCode } from "./auth-api";
import {
  ErrorMessage,
  Field,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";

type Status = { enabled: boolean; available: boolean };
type Setup = { secret: string; ticket: string };
type Recovery = { recoveryCode: string };
const root = "/api/v1/auth/two-factor";
const messages: Record<string, string> = {
  AUTH_REQUIRED: "Your session ended. Sign in again.",
  AUTHENTICATOR_ALREADY_ENABLED:
    "Two-factor verification is already enabled. Reload this page to check its status.",
  AUTHENTICATOR_NOT_ENABLED:
    "Two-factor verification is already off. Reload this page to check its status.",
  AUTHENTICATOR_PASSWORD_INVALID: "Enter your current account password.",
  AUTHENTICATOR_SETUP_EXPIRED:
    "Setup expired. Start again with a new setup key.",
  AUTHENTICATOR_UNAVAILABLE: "Authenticator verification is unavailable.",
  INVALID_AUTHENTICATOR_CODE:
    "The code is incorrect or already used. Try a fresh code.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Try again in 15 minutes.",
};

async function request<T>(
  path: string,
  signal: AbortSignal,
  body?: Record<string, string>,
): Promise<T> {
  const response = await fetch(root + path, {
    cache: "no-store",
    signal,
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (!response.ok)
    throw { data: await response.json().catch(() => undefined) };
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function AuthenticatorSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void request<Status>("", controller.signal)
      .then(setStatus)
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            messages[errorCode(failure) ?? ""] ??
              "Could not load Security settings. Reload this page to retry.",
          );
      });
    return () => {
      controller.abort();
      current.current?.abort();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (current.current || !status) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const value = (name: string) => String(fields.get(name) ?? "");
    form.reset();
    const controller = new AbortController();
    current.current = controller;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (disabling) {
        await request<void>("/disable", controller.signal, {
          password: value("password"),
          code: value("code").trim(),
        });
        setStatus({ ...status, enabled: false });
        setDisabling(false);
        setNotice("Two-factor verification is off.");
      } else if (setup) {
        const result = await request<Recovery>("/enable", controller.signal, {
          ticket: setup.ticket,
          code: value("code"),
        });
        setSetup(null);
        setStatus({ ...status, enabled: true });
        setRecovery(result.recoveryCode);
        setNotice("Two-factor verification is on.");
      } else {
        setSetup(
          await request<Setup>("/setup", controller.signal, {
            password: value("password"),
          }),
        );
      }
    } catch (failure) {
      const code = errorCode(failure);
      if (controller.signal.aborted) return;
      setError(
        messages[code ?? ""] ??
          "Could not confirm the change. Reload this page to check its status.",
      );
      if (code === "AUTHENTICATOR_SETUP_EXPIRED") setSetup(null);
    } finally {
      current.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold sm:text-3xl">Security</h1>
      <Card className="gap-4 p-5 sm:p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Two-factor verification</h2>
          <p className="text-sm text-muted-foreground">
            Use an authenticator app to verify sensitive actions such as
            payments or account changes.
          </p>
        </div>
        {!status && !error && (
          <LoadingRegion label="Loading Security settings">
            <Skeleton className="h-5 w-16" />
          </LoadingRegion>
        )}
        {status && (
          <p className="text-sm font-medium">
            {status.enabled ? "Enabled" : "Off"}
          </p>
        )}
        {status && !status.enabled && !status.available && (
          <p className="text-sm">Authenticator setup is unavailable.</p>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {recovery && (
          <div className="space-y-2 rounded-lg border bg-muted p-4">
            <h3 className="font-semibold">Save your recovery code</h3>
            <p className="text-sm">
              Keep this code offline. If you lose your authenticator, use it
              with your account password to turn off verification and set it up
              again.
            </p>
            <p className="break-all font-mono text-sm">{recovery}</p>
            <Button className={secondaryStyle} onClick={() => setRecovery("")}>
              I saved the code
            </Button>
          </div>
        )}
        {status?.enabled && !disabling && !recovery && (
          <Button
            className={secondaryStyle + " self-start"}
            onClick={() => {
              setError("");
              setDisabling(true);
            }}
          >
            Turn off two-factor verification
          </Button>
        )}
        {status && (disabling || (!status.enabled && status.available)) && (
          <form
            key={setup ? "verify" : disabling ? "disable" : "setup"}
            onSubmit={(event) => void submit(event)}
            className="grid max-w-md gap-4"
          >
            {setup ? (
              <>
                <div className="space-y-2 rounded-lg border bg-muted p-4">
                  <p className="text-sm">
                    Add a time-based account named BankBolt in your
                    authenticator app using this setup key.
                  </p>
                  <p className="break-all font-mono text-sm">{setup.secret}</p>
                </div>
                <Field
                  name="code"
                  label="Authenticator code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                  disabled={busy}
                />
              </>
            ) : (
              <Field
                name="password"
                label="Current password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
                disabled={busy}
              />
            )}
            {disabling && (
              <Field
                name="code"
                label="Authenticator or recovery code"
                autoComplete="one-time-code"
                required
                maxLength={22}
                disabled={busy}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button className={primaryStyle} type="submit" disabled={busy}>
                {busy
                  ? "Submitting…"
                  : setup
                    ? "Enable two-factor verification"
                    : disabling
                      ? "Confirm removal"
                      : "Set up authenticator"}
              </Button>
              {(setup || disabling) && (
                <Button
                  className={secondaryStyle}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSetup(null);
                    setDisabling(false);
                    setError("");
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
        <ErrorMessage message={error} />
      </Card>
    </section>
  );
}
