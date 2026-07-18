import { createFileRoute } from "@tanstack/react-router";

// Worker fetches the next actionable Telegram login step.
// Returns rows where status is pending / submit_code / submit_2fa AND
// not currently being processed by another worker (claimed_at older than 60s or null).
export const Route = createFileRoute("/api/public/worker/next-login-step")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.WORKER_TOKEN;
        if (!token) return json({ error: "Server misconfigured" }, 500);
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${token}`) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 60_000).toISOString();

        const { data: pending, error: selErr } = await supabaseAdmin
          .from("telegram_login_requests")
          .select("*")
          .in("status", ["pending", "submit_code", "submit_2fa"])
          .or(`claimed_at.is.null,claimed_at.lt.${cutoff}`)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (selErr) return json({ error: selErr.message }, 500);
        if (!pending) return json({ task: null });

        // Atomically claim: only if claimed_at hasn't changed
        const filter = pending.claimed_at
          ? { key: "claimed_at", value: pending.claimed_at }
          : null;
        let upd = supabaseAdmin
          .from("telegram_login_requests")
          .update({ claimed_at: new Date().toISOString() })
          .eq("id", pending.id);
        upd = filter ? upd.eq(filter.key, filter.value) : upd.is("claimed_at", null);
        const { data: claimed, error: updErr } = await upd.select().maybeSingle();
        if (updErr) return json({ error: updErr.message }, 500);
        if (!claimed) return json({ task: null });

        // Decrypt transient fields
        const { decryptString } = await import("@/lib/session-crypto.server");
        let code: string | null = null;
        let password: string | null = null;
        try {
          if (claimed.code) code = decryptString(claimed.code as string);
        } catch (e) {
          return json({ error: `code decrypt: ${(e as Error).message}` }, 500);
        }
        try {
          if (claimed.password) password = decryptString(claimed.password as string);
        } catch (e) {
          return json({ error: `password decrypt: ${(e as Error).message}` }, 500);
        }

        return json({
          task: {
            id: claimed.id,
            user_id: claimed.user_id,
            phone: claimed.phone,
            status: claimed.status,
            phone_code_hash: claimed.phone_code_hash,
            code,
            password,
          },
        });
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
