import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CompleteSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["done", "failed"]),
  result_message: z.string().max(2000).optional(),
  channel_id: z.string().max(64).optional(),
  invite_link: z.string().url().max(512).optional(),
});

export const Route = createFileRoute("/api/public/worker/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.WORKER_TOKEN;
        if (!token) return json({ error: "Server misconfigured" }, 500);
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${token}`) return json({ error: "Unauthorized" }, 401);

        const raw = await request.json().catch(() => null);
        const parsed = CompleteSchema.safeParse(raw);
        if (!parsed.success) return json({ error: parsed.error.message }, 400);
        const { id, status, result_message, channel_id, invite_link } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("claim_jobs")
          .update({
            status,
            result_message: result_message ?? null,
            channel_id: channel_id ?? null,
            invite_link: invite_link ?? null,
            claimed_at: status === "done" ? new Date().toISOString() : null,
          })
          .eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
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
