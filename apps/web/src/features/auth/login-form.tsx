"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/store/provider";
import { errorCode, useLoginMutation, useMeQuery } from "./auth-api";
import { workspaces } from "./identity";

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  TOO_MANY_ATTEMPTS: "Too many sign-in attempts. Try again in 15 minutes.",
  VALIDATION_ERROR: "Check your email address and password.",
  INVALID_ORIGIN: "Use the configured BankBolt web address to sign in.",
};

export function LoginForm() {
  const router = useRouter();
  const role = useAppSelector((state) => state.auth.role);
  const session = useMeQuery(undefined, { refetchOnMountOrArgChange: true });
  const [login, { isLoading }] = useLoginMutation();
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (role && !session.isFetching && !session.isError && session.data) {
      router.replace(workspaces[role].path);
    }
  }, [role, router, session.data, session.isError, session.isFetching]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setFeedback("");
    try {
      const { user } = await login({
        email: String(fields.get("email") ?? ""),
        password: String(fields.get("password") ?? ""),
      }).unwrap();
      form.reset();
      router.replace(workspaces[user.role].path);
    } catch (error) {
      setFeedback(
        messages[errorCode(error) ?? ""] ?? "Unable to sign in. Try again.",
      );
    }
  }

  if (session.isLoading || (role && session.data && !session.isError)) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking your session…
      </p>
    );
  }

  const fieldClass =
    "min-h-12 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-primary";
  const blocked = errorCode(session.error) === "ACCOUNT_BLOCKED";
  return (
    <form method="post" onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold">
          Email address
        </label>
        <input
          className={fieldClass}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-semibold">
          Password
        </label>
        <div className="relative">
          <input
            className={`${fieldClass} pr-13`}
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            maxLength={128}
            required
          />
          <Button
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute top-0.5 right-0.5 min-w-11 px-0 text-muted-foreground hover:bg-muted"
          >
            {visible ? (
              <EyeOff aria-hidden size={18} />
            ) : (
              <Eye aria-hidden size={18} />
            )}
          </Button>
        </div>
      </div>
      {(feedback || blocked) && (
        <p
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-danger-ink"
        >
          {feedback ||
            "This account is blocked. Contact your BankBolt administrator."}
        </p>
      )}
      <Button
        className="min-h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90"
        type="submit"
        disabled={isLoading}
      >
        {isLoading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
