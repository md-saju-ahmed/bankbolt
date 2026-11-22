"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  ErrorMessage,
  Field,
  primaryStyle,
  secondaryStyle,
} from "@/features/onboarding/form-ui";
import {
  authenticatorPrompt,
  noAuthenticatorPrompt,
  subscribeAuthenticator,
} from "@/lib/authenticator-prompt";

type Prompt = NonNullable<ReturnType<typeof authenticatorPrompt>>;

function CodeDialog({ prompt }: { prompt: Prompt }) {
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !input.current) return;
    const code = input.current.value;
    input.current.value = "";
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (await prompt.verify(code)) {
        prompt.finish(true);
        return;
      }
      setError("That code is incorrect or already used. Enter a fresh code.");
    } catch {
      prompt.finish(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }

  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !inFlight.current) prompt.finish(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-scrim/60" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-[70] max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border bg-card p-5 shadow-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
        >
          <AlertDialog.Title className="text-lg font-semibold">
            Verify this action
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            Enter a fresh six-digit code from your authenticator app.
          </AlertDialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => void submit(event)}
          >
            <Field
              ref={input}
              label="Authenticator code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              disabled={busy}
            />
            {error && <ErrorMessage message={error} />}
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button
                  type="button"
                  className={secondaryStyle}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <Button type="submit" className={primaryStyle} disabled={busy}>
                {busy ? "Verifying…" : "Verify and continue"}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function AuthenticatorPrompt() {
  const prompt = useSyncExternalStore(
    subscribeAuthenticator,
    authenticatorPrompt,
    noAuthenticatorPrompt,
  );
  return prompt ? <CodeDialog prompt={prompt} /> : null;
}
