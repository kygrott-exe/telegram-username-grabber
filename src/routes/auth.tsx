import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AtSign, KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Username Claimer" },
      { name: "description", content: "Sign in to queue Telegram username claim jobs." },
    ],
  }),
  component: AuthPage,
});

const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@claimer.local`;

function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (error) throw error;
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="mx-auto grid min-h-dvh max-w-6xl grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        {/* Brand panel */}
        <section className="hidden flex-col justify-between lg:flex">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[image:var(--gradient-brand)] shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden />
            </span>
            <span>Claimer</span>
          </Link>
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Admin console
            </p>
            <h1 className="text-balance font-heading text-5xl font-bold leading-[1.05]">
              Claim Telegram <span className="text-gradient">usernames</span> on autopilot.
            </h1>
            <p className="max-w-md text-base text-muted-foreground">
              Queue batches, save templates, and let your worker sweep drops with a 10–15s cadence — all from a single dashboard.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Claimer</p>
        </section>

        {/* Form panel */}
        <section className="flex items-center justify-center">
          <div className="glass w-full max-w-md rounded-3xl p-8 shadow-[var(--shadow-elegant)]">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[image:var(--gradient-brand)]">
                <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden />
              </span>
              <span className="font-heading text-lg font-semibold">Claimer</span>
            </div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">Admin access only.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4" aria-label="Sign in form">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="username"
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pl-9"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="h-11 w-full bg-[image:var(--gradient-brand)] font-medium text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-95"
                disabled={busy}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <div className="text-center">
                <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back home</Link>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
