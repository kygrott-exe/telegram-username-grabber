import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createJob, deleteJob, listJobs } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, LogOut, Send, Trash2 } from "lucide-react";

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

  const jobsQuery = useQuery({
    queryKey: ["jobs"],
    queryFn: () => list(),
    refetchInterval: 4000,
  });

  const createMut = useMutation({
    mutationFn: (data: {
      username: string;
      channel_title: string;
      channel_description: string;
      pfp_url: string;
    }) => create({ data }),
    onSuccess: () => {
      toast.success("Job queued. Worker will pick it up.");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    createMut.mutate({
      username: String(f.get("username") || ""),
      channel_title: String(f.get("channel_title") || ""),
      channel_description: String(f.get("channel_description") || ""),
      pfp_url: String(f.get("pfp_url") || ""),
    });
    e.currentTarget.reset();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Telegram Username Claimer</h1>
            <p className="text-xs text-muted-foreground">Signed in as {email}</p>
          </div>
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
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-5">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>New claim</CardTitle>
            <CardDescription>Queue a job for the worker to claim.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" name="username" placeholder="e.g. mychannel" required />
                <p className="text-xs text-muted-foreground">5-32 chars, must start with a letter.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel_title">Channel title</Label>
                <Input id="channel_title" name="channel_title" placeholder="My Channel" required maxLength={128} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel_description">Description</Label>
                <Textarea id="channel_description" name="channel_description" maxLength={255} rows={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pfp_url">Profile photo URL (optional)</Label>
                <Input id="pfp_url" name="pfp_url" type="url" placeholder="https://..." />
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
                    <div className="flex items-center gap-2">
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
        to actually claim usernames. Bots cannot do this — the worker signs in as your Telegram user account.
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
