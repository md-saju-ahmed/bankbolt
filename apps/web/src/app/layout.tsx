import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppTheme } from "@/components/app-theme";
import { AuthenticatorPrompt } from "@/features/auth/authenticator-prompt";
import { StoreProvider } from "@/lib/store/provider";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "BankBolt",
  description: "A simulated digital banking platform.",
  icons: { icon: "/brand/bankbolt-icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppTheme>
          <StoreProvider>
            {children}
            <AuthenticatorPrompt />
          </StoreProvider>
        </AppTheme>
      </body>
    </html>
  );
}
