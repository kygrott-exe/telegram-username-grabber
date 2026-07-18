import { createFileRoute } from "@tanstack/react-router";

// Worker pulls the oldest pending job and atomically marks it processing.
// Auth: shared bearer token in `Authorization: Bearer <WORKER_TOKEN>`.
export const Route = createFileRoute("/api/public/worker/next-job")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.WORKER_TOKEN;
        if (!token) return json({ error: "Server misconfigured" }, 500);
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${token}`) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pick oldest pending
        const { data: pending, error: selErr } = await supabaseAdmin
          .from("claim_jobs")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (selErr) return json({ error: selErr.message }, 500);
        if (!pending) return json({ job: null });

        // Atomic claim: only update if still pending
        const { data: claimed, error: updErr } = await supabaseAdmin
          .from("claim_jobs")
          .update({ status: "processing" })
          .eq("id", pending.id)
          .eq("status", "pending")
          .select()
          .maybeSingle();
        if (updErr) return json({ error: updErr.message }, 500);
        if (!claimed) return json({ job: null }); // race, another worker took it
        return json({ job: claimed });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
