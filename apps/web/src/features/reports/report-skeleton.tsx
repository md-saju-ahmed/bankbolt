import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export function ReportChartsSkeleton({
  gridClassName,
  customer = false,
}: {
  gridClassName: string;
  customer?: boolean;
}) {
  const heights = customer ? [218, 218, 158] : [218, 218, 158, 158, 218];

  return (
    <LoadingRegion label="Loading charts">
      <Skeleton className="h-7 w-40" />
      {customer && <Skeleton className="mt-1 h-5 w-24" />}
      <Skeleton className="mt-1 mb-3 h-5 w-44" />
      <div className={gridClassName}>
        {heights.map((height, index) => (
          <Card
            key={index}
            className={
              index === heights.length - 1
                ? "col-span-full p-4 sm:p-5"
                : "p-4 sm:p-5"
            }
          >
            <Skeleton className="h-6 w-2/3 max-w-52" />
            <Skeleton className="mt-1 h-5 w-5/6 max-w-72" />
            <div
              className="mt-4 flex items-end gap-3 border-b border-l px-4"
              style={{ height }}
            >
              {[42, 61, 48, 76, 58, 80].map((value) => (
                <Skeleton
                  key={value}
                  className="flex-1 rounded-b-none"
                  style={{ height: `${value}%` }}
                />
              ))}
            </div>
            <Skeleton className="mt-3 h-5 w-24" />
            <Skeleton className="mt-4 h-11 w-32" />
          </Card>
        ))}
      </div>
    </LoadingRegion>
  );
}
