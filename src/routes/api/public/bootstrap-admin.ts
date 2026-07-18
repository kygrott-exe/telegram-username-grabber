import { createFileRoute } from "@tanstack/react-router";

// One-shot admin bootstrap. Requires Authorization: Bearer <WORKER_TOKEN>.
// Creates or resets the hankie admin user with the fixed password.
export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token || token !== process.env.WORKER_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const email = "hankie@claimer.local";
        const password = "parth27208";

        // Try create
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username: "hankie" },
        });

        if (createErr && !/already/i.test(createErr.message)) {
          return new Response(`Create failed: ${createErr.message}`, { status: 500 });
        }

        if (!created?.user) {
          // Already exists — locate and reset password
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
          if (listErr) return new Response(`List failed: ${listErr.message}`, { status: 500 });
          const existing = list.users.find((u) => u.email === email);
          if (!existing) return new Response("User missing after conflict", { status: 500 });
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
          });
          if (updErr) return new Response(`Update failed: ${updErr.message}`, { status: 500 });
          return Response.json({ ok: true, id: existing.id, reset: true });
        }

        return Response.json({ ok: true, id: created.user.id, created: true });
      },
    },
  },
});
