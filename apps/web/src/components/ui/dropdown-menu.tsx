"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function MenuContent({
  className,
  ...props
}: ComponentProps<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        align="end"
        sideOffset={8}
        collisionPadding={8}
        className={cn(
          "z-30 max-h-[var(--radix-dropdown-menu-content-available-height)] max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg",
          className,
        )}
        {...props}
      />
    </Dropdown.Portal>
  );
}

export const menuLabel = "px-3 py-2 text-xs font-medium text-muted-foreground";
export const menuItem =
  "min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium outline-none data-highlighted:bg-muted data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-primary data-disabled:cursor-not-allowed data-disabled:opacity-60";
