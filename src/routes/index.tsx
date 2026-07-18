import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createJob, deleteJob, listJobs } from "@/lib/jobs.functions";
import { listAccounts } from "@/lib/telegram-accounts.functions";
import { listTemplates, saveTemplate, deleteTemplate } from "@/lib/templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, LogOut, Save, Send, Trash2, Users, X } from "lucide-react";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Telegram Username Claimer" },
      { name: "description", content: "Queue Telegram channel username claims with title, description, and profile photo." },
      { property: "og:title", content: "Telegram Username Claimer" },
      { property: "og:description", content: "Queue Telegram channel username claims with title, description, and profile photo." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        navigate({ to: "/auth" });
      } else {
        setEmail(session.user.email ?? null);
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
      else {
        setEmail(data.session.user.email ?? null);
        setReady(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <Dashboard email={email} />;
}

function Dashboard({ email }: { email: string | null }) {
  const qc = useQueryClient();
  const list = useServerFn(listJobs);
  const create = useServerFn(createJob);
  const del = useServerFn(deleteJob);
  const listAcc = useServerFn(listAccounts);
  const listTpl = useServerFn(listTemplates);
  const saveTpl = useServerFn(saveTemplate);
  const delTpl = useServerFn(deleteTemplate);

  const [accountId, setAccountId] = useState<string>("");
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [form, setForm] = useState({
    channel_title: "",
    channel_description: "",
    pfp_url: "",
    first_post_text: "",
    first_post_media_url: "",
  });
  const usernamesRef = useRef<HTMLTextAreaElement>(null);

  const accountsQuery = useQuery({
    queryKey: ["telegram-accounts"],
    queryFn: () => listAcc(),
    refetchInterval: 10000,
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => listTpl(),
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs"],
    queryFn: () => list(),
    refetchInterval: 4000,
  });

  const createMut = useMutation({
    mutationFn: (data: {
      telegram_account_id: string;
      usernames: string[];
      channel_title: string;
      channel_description: string;
      pfp_url: string;
      first_post_text: string;
      first_post_media_url: string;
    }) => create({ data }),
    onSuccess: (res) => {
      toast.success(`Queued ${res.count} claim${res.count === 1 ? "" : "s"}. Worker paces 10–15s apart.`);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const saveTplMut = useMutation({
    mutationFn: (name: string) =>
      saveTpl({ data: { name, ...form } }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const delTplMut = useMutation({
    mutationFn: (id: string) => delTpl({ data: { id } }),
    onSuccess: () => {
      setSelectedTpl("");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const accounts = accountsQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const hasAccounts = accounts.length > 0;

  const applyTemplate = (id: string) => {
    setSelectedTpl(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setForm({
      channel_title: t.channel_title ?? "",
      channel_description: t.channel_description ?? "",
      pfp_url: t.pfp_url ?? "",
      first_post_text: t.first_post_text ?? "",
      first_post_media_url: t.first_post_media_url ?? "",
    });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!accountId) {
      toast.error("Pick a Telegram account first");
      return;
    }
    const raw = usernamesRef.current?.value || "";
    const usernames = raw
      .split(/[\s,]+/)
      .map((u) => u.trim().replace(/^@/, ""))
      .filter(Boolean);
    if (usernames.length === 0) {
      toast.error("Enter at least one username");
      return;
    }
    if (!form.channel_title.trim()) {
      toast.error("Channel title is required");
      return;
    }
    createMut.mutate({
      telegram_account_id: accountId,
      usernames,
      ...form,
    });
    if (usernamesRef.current) usernamesRef.current.value = "";
  };

  const onSaveTemplate = () => {
    const name = window.prompt("Template name?", "");
    if (!name?.trim()) return;
    if (!form.channel_title.trim()) {
      toast.error("Add a channel title before saving");
      return;
    }
    saveTplMut.mutate(name.trim());
  };


  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Telegram Username Claimer</h1>
            <p className="text-xs text-muted-foreground">Signed in as {email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/accounts">
                <Users className="mr-2 h-4 w-4" /> Accounts
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-5">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>New claim</CardTitle>
            <CardDescription>Queue a job for the worker to claim.</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasAccounts ? (
              <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm">
                <p>You haven't connected any Telegram accounts yet.</p>
                <Button asChild className="w-full">
                  <Link to="/accounts">
                    <Users className="mr-2 h-4 w-4" /> Connect an account
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Template</Label>
                  <div className="flex gap-2">
                    <Select value={selectedTpl} onValueChange={applyTemplate}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={templates.length ? "Load template" : "No templates yet"} />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTpl && (
                      <Button type="button" size="icon" variant="ghost"
                        onClick={() => delTplMut.mutate(selectedTpl)}
                        title="Delete template">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <Button type="button" size="icon" variant="outline"
                      onClick={onSaveTemplate} disabled={saveTplMut.isPending}
                      title="Save current fields as a template">
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Telegram account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.first_name || "Telegram user"}
                          {a.tg_username ? ` (@${a.tg_username})` : ""} — {a.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="usernames">Usernames</Label>
                  <Textarea
                    ref={usernamesRef}
                    id="usernames"
                    name="usernames"
                    placeholder={"mychannel\nanother_one\n@third"}
                    required
                    rows={5}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    One per line (or comma/space separated). Worker paces 10–15s between claims. Max 50 per batch.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel_title">Channel title</Label>
                  <Input id="channel_title" value={form.channel_title}
                    onChange={(e) => setForm((f) => ({ ...f, channel_title: e.target.value }))}
                    placeholder="My Channel" required maxLength={128} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel_description">Description</Label>
                  <Textarea id="channel_description" value={form.channel_description}
                    onChange={(e) => setForm((f) => ({ ...f, channel_description: e.target.value }))}
                    maxLength={255} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pfp_url">Profile photo URL (optional)</Label>
                  <Input id="pfp_url" type="url" value={form.pfp_url}
                    onChange={(e) => setForm((f) => ({ ...f, pfp_url: e.target.value }))}
                    placeholder="https://..." />
                </div>
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <Label htmlFor="first_post_text">First post (optional)</Label>
                  <Textarea id="first_post_text" value={form.first_post_text}
                    onChange={(e) => setForm((f) => ({ ...f, first_post_text: e.target.value }))}
                    maxLength={4000} rows={3}
                    placeholder="Welcome message posted right after claiming…" />
                  <Input type="url" value={form.first_post_media_url}
                    onChange={(e) => setForm((f) => ({ ...f, first_post_media_url: e.target.value }))}
                    placeholder="Media URL (image/video, optional)" />
                  <p className="text-xs text-muted-foreground">
                    If text or media is set, the worker posts it in the new channel right after claiming.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={createMut.isPending}>
                  {createMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Queue claim
                </Button>
              </form>

            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
            <CardDescription>Latest 100 jobs. Auto-refreshes every 4s.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobsQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {jobsQuery.data?.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No jobs yet.</p>
            )}
            {jobsQuery.data?.map((j) => (
              <div key={j.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReasonTag reason={(j as { failure_reason?: string | null }).failure_reason ?? null} />
                      <span className="font-mono text-sm">@{j.username}</span>
                      <StatusBadge status={j.status} />
                    </div>
                    <p className="mt-1 truncate text-sm">{j.channel_title}</p>
                    {j.result_message && (
                      <p className="mt-1 text-xs text-muted-foreground">{j.result_message}</p>
                    )}
                    {j.invite_link && (
                      <a
                        href={j.invite_link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-primary hover:underline"
                      >
                        {j.invite_link}
                      </a>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMut.mutate(j.id)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>

      <footer className="mx-auto max-w-5xl px-6 pb-8 text-xs text-muted-foreground">
        Run the Python worker (see <code className="font-mono">worker/README.md</code>) on your own machine
        to drive Telegram logins and claim usernames.
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "done"
      ? "default"
      : status === "failed"
      ? "destructive"
      : status === "processing"
      ? "secondary"
      : "outline";
  return <Badge variant={variant as "default" | "destructive" | "secondary" | "outline"}>{status}</Badge>;
}

function ReasonTag({ reason }: { reason: string | null }) {
  if (!reason) return null;
  const map: Record<string, { label: string; className: string }> = {
    taken: { label: "TAKEN", className: "bg-red-500/15 text-red-500 border-red-500/30" },
    invalid: { label: "INVALID", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    fragment: { label: "ON FRAGMENT", className: "bg-violet-500/15 text-violet-500 border-violet-500/30" },
    flood: { label: "FLOOD WAIT", className: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
    other: { label: "ERROR", className: "bg-muted text-muted-foreground border-border" },
  };
  const cfg = map[reason] ?? map.other;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}
