import type { ComponentProps, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  style,
}: Pick<ComponentProps<"span">, "className" | "style">) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block rounded-md bg-muted motion-safe:animate-pulse",
        className,
      )}
      style={style}
    />
  );
}

export function LoadingRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true" aria-busy="true">
        {children}
      </div>
    </div>
  );
}

export function ListSkeleton({
  label,
  rowClassName,
  tableAt,
}: {
  label: string;
  rowClassName?: string;
  tableAt?: "lg" | "xl" | "always";
}) {
  const tableClass = {
    lg: "hidden lg:grid",
    xl: "hidden xl:grid",
    always: "grid",
  };
  const rowGrid = cn(
    "grid-cols-5 items-center gap-4 px-4",
    tableAt && tableClass[tableAt],
  );

  return (
    <LoadingRegion label={label}>
      {tableAt && (
        <div className={cn(rowGrid, "border-b bg-muted/50 py-3")}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-3 w-3/4" />
          ))}
        </div>
      )}
      <div className="divide-y">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index}>
            {tableAt && (
              <div className={cn(rowGrid, "min-h-16 py-3")}>
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-6 w-3/4 rounded-full" />
                <Skeleton className="h-4 w-2/3 justify-self-end" />
              </div>
            )}
            {tableAt !== "always" && (
              <div
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)] items-center gap-x-4 gap-y-2 py-4",
                  tableAt === "lg" && "lg:hidden",
                  tableAt === "xl" && "xl:hidden",
                  rowClassName ?? "px-4",
                )}
              >
                <Skeleton className="h-4 w-3/4 max-w-48" />
                <Skeleton className="h-5 w-2/3 max-w-24 justify-self-end rounded-full" />
                <Skeleton className="h-3 w-5/6 max-w-56" />
                <Skeleton className="h-3 w-1/2 max-w-20 justify-self-end" />
              </div>
            )}
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function DetailSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label}>
      <Card className="space-y-5 p-4 sm:p-5">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-2/3 max-w-48" />
            </div>
          ))}
        </div>
      </Card>
    </LoadingRegion>
  );
}

export function FieldSkeleton({ label }: { label: string }) {
  return (
    <span className="block">
      <span role="status" className="sr-only">
        {label}
      </span>
      <Skeleton className="h-11 w-full border border-input/50" />
    </span>
  );
}
