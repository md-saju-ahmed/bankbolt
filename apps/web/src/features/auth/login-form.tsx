"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/store/provider";
import { errorCode, useLoginMutation, useMeQuery } from "./auth-api";
import { workspaces, type Role } from "./identity";

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  TOO_MANY_ATTEMPTS: "Too many sign-in attempts. Try again in 15 minutes.",
  VALIDATION_ERROR: "Check your email address and password.",
  INVALID_ORIGIN: "Use the configured BankBolt web address to sign in.",
};

const demoAccounts = [
  { role: "ADMIN", email: "admin@bankbolt.example" },
  { role: "STAFF", email: "staff@bankbolt.example" },
  { role: "CUSTOMER", email: "customer@bankbolt.example" },
] as const;

export function LoginForm({ demoPassword }: { demoPassword?: string }) {
  const router = useRouter();
  const role = useAppSelector((state) => state.auth.role);
  const session = useMeQuery(undefined, { refetchOnMountOrArgChange: true });
  const [login, { isLoading }] = useLoginMutation();
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [demoFeedback, setDemoFeedback] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (role && !session.isFetching && !session.isError && session.data) {
      router.replace(workspaces[role].path);
    }
  }, [role, router, session.data, session.isError, session.isFetching]);

  function fillDemoCredentials(role: Role, email: string) {
    if (!demoPassword || !emailInput.current || !passwordInput.current) return;

    emailInput.current.value = email;
    passwordInput.current.value = demoPassword;
    setVisible(false);
    setFeedback("");
    setDemoFeedback(`${workspaces[role].label} demo credentials filled.`);
    emailInput.current.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setFeedback("");
    setDemoFeedback("");
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
      <LoadingRegion label="Checking your session">
        <div className="space-y-5">
          {demoPassword && (
            <div className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-72 max-w-full" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-11 w-[4.75rem]" />
                <Skeleton className="h-11 w-16" />
                <Skeleton className="h-11 w-24" />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-12 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-12 w-full" />
          </div>
          <Skeleton className="h-12 w-full" />
        </div>
      </LoadingRegion>
    );
  }

  const fieldClass =
    "min-h-12 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-primary";
  const blocked = errorCode(session.error) === "ACCOUNT_BLOCKED";
  return (
    <form method="post" onSubmit={submit} className="space-y-5">
      {demoPassword && (
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-sm font-semibold">Demo accounts</legend>
          <p className="text-sm text-muted-foreground">
            Choose a role to fill the form, then select Sign in.
          </p>
          <div className="flex flex-wrap gap-2">
            {demoAccounts.map(({ role, email }) => (
              <Button
                key={role}
                onClick={() => fillDemoCredentials(role, email)}
                className="border border-input bg-card hover:bg-muted"
                disabled={isLoading}
              >
                {workspaces[role].label}
              </Button>
            ))}
          </div>
          <p role="status" className="sr-only">
            {demoFeedback}
          </p>
        </fieldset>
      )}
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold">
          Email address
        </label>
        <input
          ref={emailInput}
          className={fieldClass}
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
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
            ref={passwordInput}
            className={`${fieldClass} pr-13`}
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            placeholder="Enter your password"
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
