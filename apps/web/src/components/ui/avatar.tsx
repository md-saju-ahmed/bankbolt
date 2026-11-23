"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

function AvatarPhoto({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    // Load external avatars in the browser so Next.js never fetches customer URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={cn(
        "absolute inset-0 size-full bg-card object-cover",
        !loaded && "opacity-0",
      )}
    />
  );
}

export function Avatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className,
      )}
    >
      {initials}
      {photoUrl && <AvatarPhoto key={photoUrl} url={photoUrl} />}
    </span>
  );
}
