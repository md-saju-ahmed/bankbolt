import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const linkFocus =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

export default function NotFound() {
  return (
    <main className="relative isolate grid min-h-svh place-items-center bg-background px-4 py-12 text-center text-foreground sm:px-6 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[2.75rem_2.75rem] [mask-image:radial-gradient(ellipse_at_center,var(--foreground),transparent_72%)]"
      />
      <div className="w-full max-w-lg [overflow-wrap:anywhere]">
        <div className="mb-8 inline-flex max-w-full items-center gap-2 text-lg font-semibold tracking-tight">
          <Image src="/brand/bankbolt-icon.svg" width={32} height={32} alt="" />
          <span>BankBolt</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          <span className="mb-3 block text-[clamp(4rem,16vw,8rem)] leading-none font-bold tracking-[-0.075em] text-primary tabular-nums">
            404
          </span>
          Page not found
        </h1>
        <p className="mx-auto mt-4 max-w-[37ch] leading-relaxed text-muted-foreground">
          This address may have changed, or the link may be out of date.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className={`inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 ${linkFocus}`}
          >
            <ArrowLeft size={17} aria-hidden="true" className="shrink-0" />
            Back to home
          </Link>
          <Link
            href="/login"
            className={`inline-flex min-h-11 max-w-full items-center justify-center rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted ${linkFocus}`}
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
