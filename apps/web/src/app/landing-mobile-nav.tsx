"use client";

import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import styles from "./landing.module.css";

type SectionLink = { label: string; href: string };

export function LandingMobileNav({ links }: { links: SectionLink[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const destination = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 44rem)");
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div className={styles.mobileMenu}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            ref={trigger}
            aria-label="Open navigation"
            className="min-w-11 px-0 hover:bg-muted"
          >
            <Menu size={22} aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent
          title="Main navigation"
          onCloseAutoFocus={(event) => {
            const target =
              destination.current ??
              (trigger.current?.getClientRects().length
                ? null
                : trigger.current?.closest("header")?.querySelector("nav a"));
            destination.current = null;
            if (target instanceof HTMLElement) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
        >
          <nav aria-label="Main navigation" className={styles.mobileMenuLinks}>
            {links.map(({ label, href }) => (
              <SheetClose key={href} asChild>
                <a
                  href={href}
                  onClick={() => {
                    destination.current = document.getElementById(
                      href.slice(1),
                    );
                  }}
                >
                  {label}
                </a>
              </SheetClose>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
