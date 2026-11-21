"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/55" />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-auto bg-navy text-white shadow-lg focus:outline-none"
      >
        <header className="flex min-h-20 items-center justify-between border-b border-white/10 px-4">
          <Dialog.Title className="font-semibold">{title}</Dialog.Title>
          <Dialog.Close asChild>
            <Button
              aria-label="Close navigation"
              className="min-w-11 px-0 hover:bg-white/10 focus-visible:outline-brand-accent"
            >
              <X aria-hidden size={20} />
            </Button>
          </Dialog.Close>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
