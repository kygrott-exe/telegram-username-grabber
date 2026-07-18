import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createJob, deleteJob, listJobs } from "@/lib/jobs.functions";
import { listAccounts } from "@/lib/telegram-accounts.functions";
import { listTemplates, saveTemplate, deleteTemplate } from "@/lib/templates.functions";
import hankiePfp from "@/assets/hankie-pfp.png.asset.json";
import hankieBanner from "@/assets/hankie-banner.png.asset.json";

const ABSOLUTE_BASE =
  typeof window !== "undefined" ? window.location.origin : "https://telegram-username-grabber.lovable.app";
const SAMPLE_PFP = `https://telegram-username-grabber.lovable.app${hankiePfp.url}`;
const SAMPLE_BANNER = `https://telegram-username-grabber.lovable.app${hankieBanner.url}`;
void ABSOLUTE_BASE;
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Save,
  Send,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Telegram Username Claimer" },
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
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) navigate({ to: "/auth" });
      else {
        setEmail(data.session.user.email ?? null);
        setReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (!session) {
        navigate({ to: "/auth" });
      } else {
        setEmail(session.user.email ?? null);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return <Dashboard email={email} />;
}

function Panel({
  title,
  description,
  children,
  className = "",
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      className={`glass rounded-3xl p-5 shadow-[var(--shadow-elegant)] sm:p-6 ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold tracking-tight sm:text-lg">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
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
    mutationFn: (name: string) => saveTpl({ data: { name, ...form } }),
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
  const jobs = jobsQuery.data ?? [];
  const hasAccounts = accounts.length > 0;

  const stats = {
    total: jobs.length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    pending: jobs.filter((j) => j.status !== "done" && j.status !== "failed").length,
  };

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
    <AppShell email={email}>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        {/* Hero + stats bento */}
        <section aria-labelledby="dash-title" className="mb-6 grid gap-4 lg:grid-cols-4">
          <div className="glass rounded-3xl p-6 shadow-[var(--shadow-elegant)] lg:col-span-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Dashboard</p>
            <h1 id="dash-title" className="mt-2 font-heading text-3xl font-bold leading-tight sm:text-4xl">
              Sweep drops <span className="text-gradient">on autopilot</span>.
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Queue batches of usernames. The worker paces claims 10–15s apart to stay under Telegram's radar.
            </p>
          </div>
          <StatCard label="Queued" value={stats.pending} icon={Clock} tone="brand" />
          <StatCard label="Claimed" value={stats.done} icon={CheckCircle2} tone="success" />
        </section>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Compose */}
          <Panel
            title="New claim"
            description="Queue a job for the worker to claim."
            className="lg:col-span-2"
          >
            {!hasAccounts ? (
              <div className="space-y-4 rounded-2xl border border-dashed border-white/15 bg-white/5 p-5 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
                <div>
                  <p className="font-medium">No Telegram accounts yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Connect one to start claiming usernames.
                  </p>
                </div>
                <Button asChild className="w-full bg-[image:var(--gradient-brand)] text-primary-foreground">
                  <Link to="/accounts">
                    <Users className="mr-2 h-4 w-4" aria-hidden /> Connect an account
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4" aria-label="Queue a claim">
                <div className="space-y-2">
                  <Label>Template</Label>
                  <div className="flex gap-2">
                    <Select value={selectedTpl} onValueChange={applyTemplate}>
                      <SelectTrigger className="h-10 flex-1" aria-label="Load template">
                        <SelectValue placeholder={templates.length ? "Load template" : "No templates yet"} />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTpl && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => delTplMut.mutate(selectedTpl)}
                        aria-label="Delete selected template"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={onSaveTemplate}
                      disabled={saveTplMut.isPending}
                      aria-label="Save current fields as a template"
                    >
                      <Save className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account">Telegram account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="account" className="h-10">
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="channel_title">Channel title</Label>
                    <Input
                      id="channel_title"
                      value={form.channel_title}
                      onChange={(e) => setForm((f) => ({ ...f, channel_title: e.target.value }))}
                      placeholder="My Channel"
                      required
                      maxLength={128}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="channel_description">Description</Label>
                    <Textarea
                      id="channel_description"
                      value={form.channel_description}
                      onChange={(e) => setForm((f) => ({ ...f, channel_description: e.target.value }))}
                      maxLength={255}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor="pfp_url">Profile photo URL (optional)</Label>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, pfp_url: SAMPLE_PFP }))}
                        className="text-[11px] font-medium uppercase tracking-widest text-primary hover:underline"
                      >
                        Use hankie pfp
                      </button>
                    </div>
                    <Input
                      id="pfp_url"
                      type="url"
                      value={form.pfp_url}
                      onChange={(e) => setForm((f) => ({ ...f, pfp_url: e.target.value }))}
                      placeholder="https://…"
                    />
                  </div>
                </div>

                <fieldset className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <legend className="px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    First post (optional)
                  </legend>
                  <div className="space-y-2">
                    <Label htmlFor="first_post_text" className="sr-only">First post text</Label>
                    <Textarea
                      id="first_post_text"
                      value={form.first_post_text}
                      onChange={(e) => setForm((f) => ({ ...f, first_post_text: e.target.value }))}
                      maxLength={4000}
                      rows={3}
                      placeholder="Welcome message posted right after claiming…"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, first_post_media_url: SAMPLE_BANNER }))}
                        className="text-[11px] font-medium uppercase tracking-widest text-primary hover:underline"
                      >
                        Use hankie banner
                      </button>
                    </div>
                    <Label htmlFor="first_post_media_url" className="sr-only">First post media URL</Label>
                    <Input
                      id="first_post_media_url"
                      type="url"
                      value={form.first_post_media_url}
                      onChange={(e) => setForm((f) => ({ ...f, first_post_media_url: e.target.value }))}
                      placeholder="Media URL (image/video, optional)"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Posted in the new channel right after claiming.
                  </p>
                </fieldset>

                <Button
                  type="submit"
                  className="h-11 w-full bg-[image:var(--gradient-brand)] font-medium text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-95"
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Queue claim
                </Button>
              </form>
            )}
          </Panel>

          {/* Jobs feed */}
          <Panel
            title="Jobs"
            description="Latest 100 jobs. Auto-refreshes every 4s."
            className="lg:col-span-3"
            action={
              stats.failed > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-destructive">
                  <XCircle className="h-3 w-3" aria-hidden /> {stats.failed} failed
                </span>
              ) : undefined
            }
          >
            {jobsQuery.isLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading jobs" />
              </div>
            )}
            {!jobsQuery.isLoading && jobs.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center">
                <p className="text-sm text-muted-foreground">No jobs yet. Queue your first claim.</p>
              </div>
            )}
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className="group rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReasonTag reason={(j as { failure_reason?: string | null }).failure_reason ?? null} />
                        <span className="truncate font-mono text-sm font-medium">@{j.username}</span>
                        <StatusBadge status={j.status} />
                      </div>
                      {j.channel_title && (
                        <p className="mt-1 truncate text-sm text-foreground/90">{j.channel_title}</p>
                      )}
                      {j.result_message && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{j.result_message}</p>
                      )}
                      {j.invite_link && (
                        <a
                          href={j.invite_link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block truncate text-xs text-primary hover:underline"
                        >
                          {j.invite_link}
                        </a>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 opacity-60 hover:opacity-100"
                      onClick={() => deleteMut.mutate(j.id)}
                      disabled={deleteMut.isPending}
                      aria-label={`Delete job for @${j.username}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          Run the Python worker (see <code className="font-mono">worker/README.md</code>) on your own machine to drive Telegram logins and claim usernames.
        </footer>
      </main>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: "brand" | "success";
}) {
  const toneClass =
    tone === "brand"
      ? "from-primary/20 to-primary/0 text-primary"
      : "from-emerald-400/20 to-emerald-400/0 text-emerald-300";
  return (
    <div className="glass relative overflow-hidden rounded-3xl p-5 shadow-[var(--shadow-elegant)]">
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${toneClass}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="mt-1 font-heading text-3xl font-bold tabular-nums">{value}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    done: { label: "done", className: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
    failed: { label: "failed", className: "bg-destructive/15 text-destructive border-destructive/30" },
    processing: { label: "processing", className: "bg-primary/15 text-primary border-primary/30" },
    queued: { label: "queued", className: "bg-white/5 text-muted-foreground border-white/15" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-white/5 text-muted-foreground border-white/15" };
  return (
    <Badge variant="outline" className={`border ${cfg.className} rounded-full px-2 py-0 text-[10px] uppercase tracking-widest`}>
      {cfg.label}
    </Badge>
  );
}

function ReasonTag({ reason }: { reason: string | null }) {
  if (!reason) return null;
  const map: Record<string, { label: string; className: string }> = {
    taken: { label: "TAKEN", className: "bg-red-500/15 text-red-400 border-red-500/30" },
    invalid: { label: "INVALID", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    fragment: { label: "ON FRAGMENT", className: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
    flood: { label: "FLOOD WAIT", className: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
    other: { label: "ERROR", className: "bg-muted text-muted-foreground border-border" },
  };
  const cfg = map[reason] ?? map.other;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}
