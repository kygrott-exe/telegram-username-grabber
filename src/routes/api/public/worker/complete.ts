import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CompleteSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["done", "failed"]),
  result_message: z.string().max(2000).optional(),
  channel_id: z.string().max(64).optional(),
  invite_link: z.string().url().max(512).optional(),
  failure_reason: z.enum(["taken", "invalid", "fragment", "flood", "other"]).optional(),
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
        const { id, status, result_message, channel_id, invite_link, failure_reason } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const patch: {
          status: "done" | "failed";
          failure_reason: string | null;
          claimed_at: string | null;
          result_message?: string;
          channel_id?: string;
          invite_link?: string;
        } = {
          status,
          failure_reason: status === "failed" ? failure_reason ?? "other" : null,
          claimed_at: status === "done" ? new Date().toISOString() : null,
        };
        if (result_message !== undefined) patch.result_message = result_message;
        if (channel_id !== undefined) patch.channel_id = channel_id;
        if (invite_link !== undefined) patch.invite_link = invite_link;

        const { error } = await supabaseAdmin
          .from("claim_jobs")
          .update(patch)
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
