import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
