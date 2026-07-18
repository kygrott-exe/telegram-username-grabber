import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelLogin,
  deleteAccount,
  getLoginStatus,
  listAccounts,
  startLogin,
  submitCode,
  submitPassword,
} from "@/lib/telegram-accounts.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, UserRound } from "lucide-react";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Telegram Accounts — Claimer" },
      { name: "description", content: "Connect your Telegram accounts so the worker can claim usernames on your behalf." },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
      else {
        setEmail(data.session.user.email ?? null);
        setReady(true);
      }
    });
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return <AccountsInner email={email} />;
}

function AccountsInner({ email }: { email: string | null }) {
  const qc = useQueryClient();
  const list = useServerFn(listAccounts);
  const del = useServerFn(deleteAccount);
  const [dialogOpen, setDialogOpen] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["telegram-accounts"],
    queryFn: () => list(),
    refetchInterval: 5000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Account removed");
      qc.invalidateQueries({ queryKey: ["telegram-accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const accounts = accountsQuery.data ?? [];

  return (
    <AppShell email={email}>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <section className="glass mb-6 rounded-3xl p-6 shadow-[var(--shadow-elegant)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Telegram</p>
              <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">
                Connected <span className="text-gradient">accounts</span>
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The worker uses these to claim usernames on your behalf.
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="h-10 shrink-0 rounded-full bg-[image:var(--gradient-brand)] px-4 text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-95"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden /> Connect account
            </Button>
          </div>
        </section>

        <section aria-labelledby="accts-heading" className="glass rounded-3xl p-5 shadow-[var(--shadow-elegant)] sm:p-6">
          <h2 id="accts-heading" className="sr-only">Your accounts</h2>
          {accountsQuery.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
            </div>
          )}
          {!accountsQuery.isLoading && accounts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 py-14 text-center">
              <UserRound className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">
                No Telegram accounts yet. Connect one to start claiming.
              </p>
            </div>
          )}
          <ul className="grid gap-2 sm:grid-cols-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[image:var(--gradient-brand)] font-heading text-sm font-semibold text-primary-foreground">
                    {(a.first_name || "T").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{a.first_name || "Telegram user"}</span>
                      {a.tg_username && (
                        <span className="truncate text-sm text-muted-foreground">@{a.tg_username}</span>
                      )}
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2 py-0 text-[10px] uppercase tracking-widest ${
                          a.status === "active"
                            ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                            : "border-white/15 bg-white/5 text-muted-foreground"
                        }`}
                      >
                        {a.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {a.phone} · id {a.tg_user_id ?? "?"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 opacity-60 hover:opacity-100"
                    onClick={() => deleteMut.mutate(a.id)}
                    disabled={deleteMut.isPending}
                    aria-label={`Remove ${a.first_name || a.phone}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          The Python worker drives the Telegram login and stores the session encrypted.
        </p>
      </main>

      <ConnectDialog
        open={dialogOpen}
        onOpenChange={(v) => setDialogOpen(v)}
        onConnected={() => {
          setDialogOpen(false);
          qc.invalidateQueries({ queryKey: ["telegram-accounts"] });
        }}
      />
    </AppShell>
  );
}

type Step = "phone" | "code" | "password" | "done";

function ConnectDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const start = useServerFn(startLogin);
  const status = useServerFn(getLoginStatus);
  const sendCode = useServerFn(submitCode);
  const sendPwd = useServerFn(submitPassword);
  const cancel = useServerFn(cancelLogin);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const reset = () => {
    stopPolling();
    setStep("phone");
    setPhone("");
    setCode("");
    setPassword("");
    setRequestId(null);
    setError(null);
    setBusy(false);
  };

  useEffect(() => {
    if (!open) reset();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!requestId) return;
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const row = await status({ data: { request_id: requestId } });
        if (!row) return;
        if (row.status === "awaiting_code" && step === "phone") {
          setStep("code");
          setBusy(false);
        } else if (row.status === "awaiting_password" && step !== "password") {
          setStep("password");
          setBusy(false);
        } else if (row.status === "success") {
          setStep("done");
          setBusy(false);
          stopPolling();
          toast.success("Telegram account connected");
          setTimeout(onConnected, 600);
        } else if (row.status === "error") {
          setError(row.error_message || "Login failed");
          setBusy(false);
          stopPolling();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Polling error");
      }
    }, 2000);
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, step]);

  const startFlow = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await start({ data: { phone } });
      setRequestId(res.request_id);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Failed to start");
    }
  };

  const sendCodeStep = async () => {
    if (!requestId) return;
    setError(null);
    setBusy(true);
    try {
      await sendCode({ data: { request_id: requestId, code } });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const sendPwdStep = async () => {
    if (!requestId) return;
    setError(null);
    setBusy(true);
    try {
      await sendPwd({ data: { request_id: requestId, password } });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleClose = async (v: boolean) => {
    if (!v && requestId && step !== "done") {
      try {
        await cancel({ data: { request_id: requestId } });
      } catch {
        /* ignore */
      }
    }
    onOpenChange(v);
  };

  const stepIndex = { phone: 0, code: 1, password: 2, done: 3 }[step];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Connect Telegram account</DialogTitle>
          <DialogDescription>
            The worker will send a login code to your Telegram app. Enter it here.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <ol className="my-2 flex items-center gap-2" aria-label="Progress">
          {["Phone", "Code", "2FA"].map((label, i) => {
            const active = stepIndex === i;
            const done = stepIndex > i;
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                      ? "bg-[image:var(--gradient-brand)] text-primary-foreground"
                      : "bg-white/10 text-muted-foreground"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  {i + 1}
                </span>
                <span className={`text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                {i < 2 && <span className="h-px flex-1 bg-white/10" aria-hidden />}
              </li>
            );
          })}
        </ol>

        {step === "phone" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                placeholder="+1 555 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy || !!requestId}
                autoComplete="tel"
                inputMode="tel"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Include country code. Same number you use to sign in to Telegram.
              </p>
            </div>
            {requestId && (
              <p className="text-xs text-muted-foreground">Waiting for the worker to send the code…</p>
            )}
          </div>
        )}

        {step === "code" && (
          <div className="space-y-3">
            <p className="text-sm">
              Telegram sent a login code to <span className="font-medium">{phone}</span>. Enter it below.
            </p>
            <div className="space-y-2">
              <Label htmlFor="code">Login code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={busy}
                className="h-11 text-center font-mono text-lg tracking-[0.5em]"
              />
            </div>
          </div>
        )}

        {step === "password" && (
          <div className="space-y-3">
            <p className="text-sm">
              This account has two-step verification enabled. Enter your Telegram cloud password.
            </p>
            <div className="space-y-2">
              <Label htmlFor="password">Cloud password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="h-11"
              />
            </div>
          </div>
        )}

        {step === "done" && (
          <p className="text-sm text-muted-foreground">Account connected. Closing…</p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          {step === "phone" && (
            <Button
              onClick={startFlow}
              disabled={busy || !phone || !!requestId}
              className="h-11 w-full bg-[image:var(--gradient-brand)] text-primary-foreground"
            >
              {busy || requestId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Send code
            </Button>
          )}
          {step === "code" && (
            <Button
              onClick={sendCodeStep}
              disabled={busy || code.length < 3}
              className="h-11 w-full bg-[image:var(--gradient-brand)] text-primary-foreground"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Verify code
            </Button>
          )}
          {step === "password" && (
            <Button
              onClick={sendPwdStep}
              disabled={busy || !password}
              className="h-11 w-full bg-[image:var(--gradient-brand)] text-primary-foreground"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Sign in
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
