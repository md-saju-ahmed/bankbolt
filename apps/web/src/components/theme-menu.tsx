"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const choices = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button
          aria-label="Appearance"
          title="Appearance"
          className="min-w-11 px-0 hover:bg-muted"
        >
          <SunMoon aria-hidden size={19} />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={8}
          className="z-30 w-36 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <Dropdown.Label className="px-3 py-2 text-xs font-medium text-muted-foreground">
            Appearance
          </Dropdown.Label>
          <Dropdown.RadioGroup
            value={theme ?? "system"}
            onValueChange={setTheme}
          >
            {choices.map(({ value, label }) => (
              <Dropdown.RadioItem
                key={value}
                value={value}
                className="grid min-h-11 cursor-pointer grid-cols-[1fr_1rem] items-center gap-2 rounded-md px-3 text-sm outline-none data-highlighted:bg-muted data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-primary"
              >
                {label}
                <Dropdown.ItemIndicator>
                  <Check aria-hidden size={16} />
                </Dropdown.ItemIndicator>
              </Dropdown.RadioItem>
            ))}
          </Dropdown.RadioGroup>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
