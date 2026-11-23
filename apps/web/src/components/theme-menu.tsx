"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  MenuContent,
  menuItem,
  menuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const choices = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>
        <Button
          aria-label="Appearance"
          title="Appearance"
          className="min-w-11 px-0 hover:bg-muted"
        >
          <SunMoon aria-hidden size={19} />
        </Button>
      </Dropdown.Trigger>
      <MenuContent className="w-36">
        <Dropdown.Label className={menuLabel}>Appearance</Dropdown.Label>
        <Dropdown.RadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          {choices.map(({ value, label }) => (
            <Dropdown.RadioItem
              key={value}
              value={value}
              className={cn(menuItem, "grid grid-cols-[1fr_1rem]")}
            >
              {label}
              <Dropdown.ItemIndicator>
                <Check aria-hidden size={16} />
              </Dropdown.ItemIndicator>
            </Dropdown.RadioItem>
          ))}
        </Dropdown.RadioGroup>
      </MenuContent>
    </Dropdown.Root>
  );
}
