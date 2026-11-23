"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ComboboxProps = {
  label: string;
  options: Option[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
};

export function Combobox({
  label,
  options,
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select an option",
  required,
  disabled,
  className,
  "aria-describedby": describedBy,
}: ComboboxProps) {
  const dialog = useRef<HTMLElement | null>(null);
  const errorId = useId();
  const [missing, setMissing] = useState(false);
  const selected =
    value === undefined
      ? undefined
      : (options.find((option) => option.value === value) ?? null);
  const initial =
    defaultValue === undefined
      ? (options.find((option) => !option.disabled) ?? null)
      : (options.find((option) => option.value === defaultValue) ?? null);

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2", className)}
      ref={(element) => {
        dialog.current =
          element?.closest<HTMLElement>(
            '[role="dialog"], [role="alertdialog"]',
          ) ?? null;
      }}
      onInvalidCapture={(event) => {
        if (
          required &&
          event.target instanceof HTMLInputElement &&
          event.target.validity.valueMissing
        )
          setMissing(true);
      }}
    >
      <ComboboxPrimitive.Root
        items={options}
        name={name}
        value={selected}
        defaultValue={value === undefined ? initial : undefined}
        isItemEqualToValue={(item, selectedItem) =>
          item.value === selectedItem.value
        }
        onValueChange={(item) => {
          if (item) setMissing(false);
          onValueChange?.(item?.value ?? "");
        }}
        required={required}
        disabled={disabled}
        modal={false}
      >
        <ComboboxPrimitive.Label className="text-sm font-medium">
          {label}
        </ComboboxPrimitive.Label>
        <ComboboxPrimitive.Trigger
          data-slot="combobox-trigger"
          aria-describedby={
            missing
              ? [describedBy, errorId].filter(Boolean).join(" ")
              : describedBy
          }
          aria-invalid={missing || undefined}
          className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md bg-muted px-3 text-start text-base text-foreground ring-1 ring-input ring-inset hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:ring-destructive data-popup-open:ring-ring"
        >
          <span className="min-w-0 truncate">
            <ComboboxPrimitive.Value placeholder={placeholder} />
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </ComboboxPrimitive.Trigger>
        <ComboboxPrimitive.Portal container={dialog}>
          <ComboboxPrimitive.Positioner
            align="start"
            sideOffset={6}
            collisionPadding={8}
            className="z-[65] w-[var(--anchor-width)] min-w-[min(15rem,var(--available-width))] max-w-[var(--available-width)]"
          >
            <ComboboxPrimitive.Popup
              data-slot="combobox-popup"
              aria-label={label}
              className="flex max-h-[min(20rem,var(--available-height))] min-h-0 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
            >
              <div className="relative shrink-0 border-b p-2">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <ComboboxPrimitive.Input
                  aria-label={`Search ${label.toLowerCase()}`}
                  placeholder="Search options"
                  className="h-11 w-full rounded-md bg-muted pr-3 pl-9 text-base placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                />
              </div>
              <ComboboxPrimitive.Empty className="px-3 py-2 text-sm text-muted-foreground empty:hidden">
                No matching options.
              </ComboboxPrimitive.Empty>
              <ComboboxPrimitive.List className="min-h-0 overflow-y-auto overscroll-contain p-1 empty:hidden">
                {(option: Option) => (
                  <ComboboxPrimitive.Item
                    key={option.value}
                    value={option}
                    disabled={option.disabled}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm data-highlighted:bg-muted data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-ring data-disabled:cursor-not-allowed data-disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {option.label}
                    </span>
                    <ComboboxPrimitive.ItemIndicator className="shrink-0 text-primary">
                      <Check aria-hidden="true" className="size-4" />
                    </ComboboxPrimitive.ItemIndicator>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
      </ComboboxPrimitive.Root>
      {missing && (
        <p id={errorId} className="text-sm text-danger-ink">
          Select a value for {label.toLowerCase()}.
        </p>
      )}
    </div>
  );
}
