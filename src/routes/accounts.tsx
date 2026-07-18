import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, Plus, Trash2 } from "lucide-react";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
      else setReady(true);
    });
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <AccountsInner />;
}

function AccountsInner() {
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Telegram Accounts</h1>
            <p className="text-xs text-muted-foreground">
              Connect the accounts the worker will use to claim usernames.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium">Your accounts</h2>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Connect account
          </Button>
        </div>

        <Card>
          <CardContent className="p-4">
            {accountsQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {accountsQuery.data && accountsQuery.data.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No Telegram accounts yet. Connect one to start claiming.
              </p>
            )}
            <div className="space-y-2">
              {accountsQuery.data?.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.first_name || "Telegram user"}</span>
                      {a.tg_username && (
                        <span className="text-sm text-muted-foreground">@{a.tg_username}</span>
                      )}
                      <Badge variant={a.status === "active" ? "default" : "outline"}>{a.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.phone} · id {a.tg_user_id ?? "?"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMut.mutate(a.id)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground">
          Make sure the Python worker is running — it drives the Telegram login and stores
          the session encrypted in the database.
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
    </div>
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

  // Poll for status transitions while a request is in flight
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
      // step stays "phone" until poller sees awaiting_code
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
      // wait for worker to advance status
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Telegram account</DialogTitle>
          <DialogDescription>
            The worker will send a login code to your Telegram app. Enter it here.
          </DialogDescription>
        </DialogHeader>

        {step === "phone" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                placeholder="+15551234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy || !!requestId}
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">
                Include country code. Same number you use to sign in to Telegram.
              </p>
            </div>
            {requestId && (
              <p className="text-xs text-muted-foreground">
                Waiting for the worker to send the code…
              </p>
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
              />
            </div>
          </div>
        )}

        {step === "done" && (
          <p className="text-sm text-muted-foreground">Account connected. Closing…</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {step === "phone" && (
            <Button onClick={startFlow} disabled={busy || !phone || !!requestId} className="w-full">
              {busy || requestId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send code
            </Button>
          )}
          {step === "code" && (
            <Button onClick={sendCodeStep} disabled={busy || code.length < 3} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify code
            </Button>
          )}
          {step === "password" && (
            <Button onClick={sendPwdStep} disabled={busy || !password} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign in
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
