"use client";

import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

function ThemeToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-right"
    />
  );
}

export function AppTheme({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      defaultTheme="system"
      enableColorScheme={false}
      disableTransitionOnChange
      storageKey="bankbolt-theme"
    >
      {children}
      <ThemeToaster />
    </ThemeProvider>
  );
}
