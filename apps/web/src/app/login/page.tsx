import { ThemeMenu } from "@/components/theme-menu";
import Image from "next/image";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  const configuredPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
  const demoPassword =
    configuredPassword &&
    configuredPassword.length >= 12 &&
    configuredPassword.length <= 128
      ? configuredPassword
      : undefined;

  return (
    <main className="grid min-h-svh bg-card lg:grid-cols-[minmax(22rem,0.9fr)_minmax(25rem,1.1fr)]">
      <aside className="hidden flex-col justify-between bg-navy p-12 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-2.5">
          <Image
            src="/brand/bankbolt-icon.svg"
            width={40}
            height={40}
            alt=""
            priority
          />
          <span className="text-2xl font-semibold tracking-tight">
            BankBolt
          </span>
        </div>
        <h2 className="max-w-sm text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">
          Digital banking <span className="text-brand-accent">workspace</span>
        </h2>
        <p className="text-sm text-slate-300">
          Demo banking platform. No real money.
        </p>
      </aside>
      <section
        className="mx-auto flex w-full max-w-lg flex-col justify-center px-5 pt-4 pb-12 sm:px-10"
        aria-labelledby="login-title"
      >
        <div className="mb-6 flex justify-end">
          <ThemeMenu />
        </div>
        <div className="mb-9 flex items-center gap-2.5 lg:hidden">
          <Image
            src="/brand/bankbolt-icon.svg"
            width={40}
            height={40}
            alt=""
            priority
          />
          <span className="text-2xl font-semibold tracking-tight">
            BankBolt
          </span>
        </div>
        <h1 id="login-title" className="text-3xl font-semibold tracking-tight">
          Sign in to BankBolt
        </h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          Access your banking workspace.
        </p>
        <LoginForm demoPassword={demoPassword} />
        <p className="mt-9 text-sm text-muted-foreground lg:hidden">
          Demo banking platform. No real money.
        </p>
      </section>
    </main>
  );
}
