import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Schema = z.discriminatedUnion("action", [
  z.object({
    id: z.string().uuid(),
    action: z.literal("code_sent"),
    phone_code_hash: z.string().min(1).max(256),
  }),
  z.object({
    id: z.string().uuid(),
    action: z.literal("need_2fa"),
  }),
  z.object({
    id: z.string().uuid(),
    action: z.literal("success"),
    session: z.string().min(10).max(20000),
    tg_user_id: z.number().int(),
    tg_username: z.string().max(64).nullable().optional(),
    first_name: z.string().max(128).nullable().optional(),
  }),
  z.object({
    id: z.string().uuid(),
    action: z.literal("error"),
    error_message: z.string().min(1).max(1000),
  }),
]);

export const Route = createFileRoute("/api/public/worker/complete-login-step")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.WORKER_TOKEN;
        if (!token) return json({ error: "Server misconfigured" }, 500);
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${token}`) return json({ error: "Unauthorized" }, 401);

        const raw = await request.json().catch(() => null);
        const parsed = Schema.safeParse(raw);
        if (!parsed.success) return json({ error: parsed.error.message }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Get the login request first (for user_id + phone)
        const { data: req, error: getErr } = await supabaseAdmin
          .from("telegram_login_requests")
          .select("*")
          .eq("id", parsed.data.id)
          .maybeSingle();
        if (getErr) return json({ error: getErr.message }, 500);
        if (!req) return json({ error: "login request not found" }, 404);

        const now = new Date().toISOString();

        if (parsed.data.action === "code_sent") {
          const { error } = await supabaseAdmin
            .from("telegram_login_requests")
            .update({
              status: "awaiting_code",
              phone_code_hash: parsed.data.phone_code_hash,
              claimed_at: null,
              updated_at: now,
            })
            .eq("id", req.id);
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true });
        }

        if (parsed.data.action === "need_2fa") {
          const { error } = await supabaseAdmin
            .from("telegram_login_requests")
            .update({
              status: "awaiting_password",
              needs_2fa: true,
              code: null,
              claimed_at: null,
              updated_at: now,
            })
            .eq("id", req.id);
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true });
        }

        if (parsed.data.action === "error") {
          const { error } = await supabaseAdmin
            .from("telegram_login_requests")
            .update({
              status: "error",
              error_message: parsed.data.error_message,
              code: null,
              password: null,
              claimed_at: null,
              updated_at: now,
            })
            .eq("id", req.id);
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true });
        }

        // success — encrypt session, create/update account row
        const { encryptString } = await import("@/lib/session-crypto.server");
        const enc = encryptString(parsed.data.session);

        // Upsert-by-(user_id, phone): if an account with this phone already
        // exists for the user, refresh its session; otherwise insert.
        const { data: existing } = await supabaseAdmin
          .from("telegram_accounts")
          .select("id")
          .eq("user_id", req.user_id)
          .eq("phone", req.phone)
          .maybeSingle();

        let accountId: string | null = null;
        if (existing?.id) {
          const { data: updated, error: upErr } = await supabaseAdmin
            .from("telegram_accounts")
            .update({
              session_ciphertext: enc,
              tg_user_id: parsed.data.tg_user_id,
              tg_username: parsed.data.tg_username ?? null,
              first_name: parsed.data.first_name ?? null,
              status: "active",
              updated_at: now,
            })
            .eq("id", existing.id)
            .select("id")
            .single();
          if (upErr) return json({ error: upErr.message }, 500);
          accountId = updated.id;
        } else {
          const { data: inserted, error: insErr } = await supabaseAdmin
            .from("telegram_accounts")
            .insert({
              user_id: req.user_id,
              phone: req.phone,
              tg_user_id: parsed.data.tg_user_id,
              tg_username: parsed.data.tg_username ?? null,
              first_name: parsed.data.first_name ?? null,
              session_ciphertext: enc,
              status: "active",
            })
            .select("id")
            .single();
          if (insErr) return json({ error: insErr.message }, 500);
          accountId = inserted.id;
        }

        const { error: reqErr } = await supabaseAdmin
          .from("telegram_login_requests")
          .update({
            status: "success",
            account_id: accountId,
            code: null,
            password: null,
            claimed_at: null,
            updated_at: now,
          })
          .eq("id", req.id);
        if (reqErr) return json({ error: reqErr.message }, 500);

        return json({ ok: true, account_id: accountId });
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
