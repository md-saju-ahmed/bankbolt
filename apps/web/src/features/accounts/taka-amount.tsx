import { formatTaka } from "@/features/accounts/account-display";
import { BangladeshiTaka } from "lucide-react";

export function TakaAmount({
  poisha,
  credit,
}: {
  poisha: string;
  credit?: boolean;
}) {
  const [sign, amount] = formatTaka(poisha).split("৳");

  return (
    <>
      {credit ? "+" : sign}
      <BangladeshiTaka
        aria-hidden="true"
        className="mr-0.5 inline size-[0.9em] align-[-0.1em]"
      />
      <span className="sr-only">BDT </span>
      {amount}
    </>
  );
}
