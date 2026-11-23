"use client";

import { cn } from "@/lib/utils";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";

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
      : (options.find((option) => option.value === value)?.value ?? null);
  const initial =
    defaultValue === undefined
      ? (options.find((option) => !option.disabled)?.value ?? null)
      : (options.find((option) => option.value === defaultValue)?.value ??
        null);

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
      <SelectPrimitive.Root
        items={options}
        name={name}
        value={selected}
        defaultValue={value === undefined ? initial : undefined}
        onValueChange={(item) => {
          if (item !== null) setMissing(false);
          onValueChange?.(item ?? "");
        }}
        required={required}
        disabled={disabled}
        modal={false}
      >
        <SelectPrimitive.Label className="text-sm font-medium">
          {label}
        </SelectPrimitive.Label>
        <SelectPrimitive.Trigger
          data-slot="combobox-trigger"
          aria-describedby={
            missing
              ? [describedBy, errorId].filter(Boolean).join(" ")
              : describedBy
          }
          aria-invalid={missing || undefined}
          className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-start text-base text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive data-popup-open:border-ring aria-invalid:data-popup-open:border-destructive"
        >
          <span className="min-w-0 truncate">
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal container={dialog}>
          <SelectPrimitive.Positioner
            align="start"
            alignItemWithTrigger={false}
            sideOffset={6}
            collisionPadding={8}
            className="z-[65] w-[var(--anchor-width)] min-w-[min(15rem,var(--available-width))] max-w-[var(--available-width)]"
          >
            <SelectPrimitive.Popup
              data-slot="combobox-popup"
              aria-label={label}
              className="flex max-h-[min(20rem,var(--available-height))] min-h-0 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
            >
              {options.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  No options available.
                </p>
              )}
              <SelectPrimitive.List className="min-h-0 overflow-y-auto overscroll-contain p-1 empty:hidden">
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm data-highlighted:bg-muted data-disabled:cursor-not-allowed data-disabled:opacity-60"
                  >
                    <SelectPrimitive.ItemText className="min-w-0 flex-1 break-words">
                      {option.label}
                    </SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="shrink-0 text-primary">
                      <Check aria-hidden="true" className="size-4" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.List>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {missing && (
        <p id={errorId} className="text-sm text-danger-ink">
          Select a value for {label.toLowerCase()}.
        </p>
      )}
    </div>
  );
}
