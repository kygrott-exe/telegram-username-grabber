import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function AppShell({
  email,
  children,
}: {
  email: string | null;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const nav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/accounts", label: "Accounts", icon: Users },
  ] as const;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[image:var(--gradient-brand)] shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden />
            </span>
            <span className="hidden font-heading text-sm font-semibold tracking-tight sm:inline">
              Claimer
            </span>
          </Link>

          <nav aria-label="Primary" className="ml-2 flex items-center gap-1">
            {nav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Button
                  key={item.to}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className="h-9 rounded-full px-3"
                >
                  <Link to={item.to} aria-current={active ? "page" : undefined}>
                    <Icon className="h-4 w-4 sm:mr-2" aria-hidden />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {email && (
              <span
                className="hidden max-w-[180px] truncate rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground md:inline"
                title={email}
              >
                {email.replace("@claimer.local", "")}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full"
              onClick={() => supabase.auth.signOut()}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4 sm:mr-2" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
