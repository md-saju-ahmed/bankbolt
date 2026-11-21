"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { errorCode, useLogoutMutation, useWorkspaceQuery } from "./auth-api";
import { workspaces, type Role, type SessionUser } from "./identity";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Image
        src="/brand/bankbolt-icon.svg"
        width={35}
        height={35}
        alt={compact ? "BankBolt" : ""}
      />
      {!compact && (
        <span className="text-xl font-semibold tracking-tight">BankBolt</span>
      )}
    </div>
  );
}

function WorkspaceLinks({
  role,
  compact,
  inSheet,
  pathname,
}: {
  role: Role;
  compact?: boolean;
  inSheet?: boolean;
  pathname: string;
}) {
  const root = workspaces[role].path;
  const links: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    active: boolean;
  }[] = [
    {
      href: root,
      label: "Overview",
      icon: LayoutDashboard,
      active: pathname === root,
    },
  ];
  if (role !== "CUSTOMER") {
    links.push({
      href: `${root}/onboarding`,
      label: "Customer onboarding",
      icon: UserRoundPlus,
      active: pathname === `${root}/onboarding`,
    });
  }
  if (role === "CUSTOMER") {
    links.push({
      href: `${root}/accounts`,
      label: "My accounts",
      icon: CreditCard,
      active: pathname === `${root}/accounts`,
    });
  } else {
    links.push(
      {
        href: `${root}/management/customers`,
        label: "Customers",
        icon: UsersRound,
        active: pathname === `${root}/management/customers`,
      },
      {
        href: `${root}/management/accounts`,
        label: "Bank accounts",
        icon: CreditCard,
        active: pathname === `${root}/management/accounts`,
      },
    );
  }
  return (
    <div className="space-y-2">
      {links.map(({ href, label, icon: Icon, active }) => {
        const link = (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent",
              active && "bg-white/12",
              compact && "justify-center px-0",
            )}
          >
            <Icon aria-hidden size={18} />
            {!compact && label}
          </Link>
        );
        return inSheet ? (
          <SheetClose key={href} asChild>
            {link}
          </SheetClose>
        ) : (
          link
        );
      })}
    </div>
  );
}

function AccountMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [logout, { isLoading }] = useLogoutMutation();
  const initials = user.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  async function signOut() {
    try {
      await logout().unwrap();
    } catch (error) {
      if (
        !["AUTH_REQUIRED", "ACCOUNT_BLOCKED"].includes(errorCode(error) ?? "")
      ) {
        toast.error("Could not sign out. Try again.");
        return;
      }
    }
    toast.success("You signed out.");
    router.replace("/login");
  }

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button
          aria-label="Account menu"
          className="min-w-11 gap-2 px-1 hover:bg-muted sm:px-2"
        >
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          >
            {initials}
          </span>
          <span className="hidden max-w-40 truncate sm:inline">
            {user.fullName}
          </span>
          <ChevronDown
            aria-hidden
            size={15}
            className="text-muted-foreground"
          />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={8}
          className="z-30 w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <Dropdown.Label className="px-3 py-2 text-xs font-medium text-muted-foreground">
            {workspaces[user.role].label} account
          </Dropdown.Label>
          <Dropdown.Item
            disabled={isLoading}
            onSelect={() => void signOut()}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium outline-none data-highlighted:bg-muted data-disabled:opacity-60"
          >
            <LogOut aria-hidden size={16} />{" "}
            {isLoading ? "Signing out…" : "Sign out"}
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function Workspace({
  user,
  children,
}: {
  user: SessionUser;
  children?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const { role } = user;
  return (
    <div className="flex min-h-svh">
      <a
        href="#workspace-content"
        className="sr-only z-50 rounded-md bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          "hidden shrink-0 flex-col bg-navy text-white md:flex",
          collapsed ? "w-[4.5rem]" : "w-[4.5rem] lg:w-60",
        )}
      >
        <div className="flex min-h-20 items-center justify-center border-b border-white/10 lg:px-4">
          <div className={cn(!collapsed && "lg:hidden")}>
            <Brand compact />
          </div>
          {!collapsed && (
            <div className="hidden w-full lg:block">
              <Brand />
            </div>
          )}
        </div>
        <nav
          aria-label={`${workspaces[role].label} navigation`}
          className="p-3"
        >
          <div className={cn(!collapsed && "lg:hidden")}>
            <WorkspaceLinks role={role} compact pathname={pathname} />
          </div>
          {!collapsed && (
            <div className="hidden lg:block">
              <WorkspaceLinks role={role} pathname={pathname} />
            </div>
          )}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-20 items-center justify-between gap-2 border-b bg-card px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="md:hidden">
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetTrigger asChild>
                  <Button
                    aria-label="Open navigation"
                    className="min-w-11 px-0 hover:bg-muted"
                  >
                    <Menu aria-hidden size={22} />
                  </Button>
                </SheetTrigger>
                <SheetContent title={`${workspaces[role].label} navigation`}>
                  <nav className="p-3" aria-label="Workspace">
                    <WorkspaceLinks role={role} inSheet pathname={pathname} />
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
            <Button
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
              className="hidden min-w-11 px-0 hover:bg-muted lg:inline-flex"
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden size={20} />
              ) : (
                <PanelLeftClose aria-hidden size={20} />
              )}
            </Button>
            <div className="md:hidden">
              <Brand compact />
            </div>
            <span className="truncate text-sm font-semibold">
              {workspaces[role].label} workspace
            </span>
          </div>
          <AccountMenu user={user} />
        </header>
        <main
          id="workspace-content"
          tabIndex={-1}
          className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6 lg:px-8"
        >
          {children ?? (
            <>
              <div className="mb-6">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Overview
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Welcome, {user.fullName}.
                </p>
              </div>
              <Card className="max-w-xl space-y-4 p-5 sm:p-6">
                <h2 className="text-base font-semibold">Your account</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-muted-foreground">
                      Email address
                    </dt>
                    <dd className="mt-1 break-all text-sm font-medium">
                      {user.email}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">
                      Access role
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {workspaces[role].label}
                    </dd>
                  </div>
                </dl>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({
  role,
  children,
}: {
  role: Role;
  children?: ReactNode;
}) {
  const router = useRouter();
  const session = useWorkspaceQuery(role, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const code = errorCode(session.error);

  useEffect(() => {
    if (!session.isFetching && code === "AUTH_REQUIRED")
      router.replace("/login");
  }, [code, router, session.isFetching]);

  if (
    (session.isFetching && !session.currentData) ||
    code === "AUTH_REQUIRED"
  ) {
    return (
      <main role="status" className="p-6 text-sm text-muted-foreground">
        Checking your session…
      </main>
    );
  }
  if (code === "ACCOUNT_BLOCKED") {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Account blocked</h1>
        <p className="text-muted-foreground">
          Contact your BankBolt administrator.
        </p>
        <Link
          href="/login"
          className="text-sm font-semibold text-primary underline"
        >
          Back to sign in
        </Link>
      </main>
    );
  }
  if (code === "FORBIDDEN") {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground">
          Your account cannot open this workspace.
        </p>
        <Link
          href="/login"
          className="text-sm font-semibold text-primary underline"
        >
          Go to your workspace
        </Link>
      </main>
    );
  }
  if (session.isError || !session.currentData) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Unable to check your session</h1>
        <Button
          className="bg-primary text-primary-foreground"
          onClick={() => void session.refetch()}
          disabled={session.isFetching}
        >
          Try again
        </Button>
      </main>
    );
  }
  return <Workspace user={session.currentData.user}>{children}</Workspace>;
}
