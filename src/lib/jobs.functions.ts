import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UsernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

const CreateJobSchema = z.object({
  telegram_account_id: z.string().uuid(),
  usernames: z
    .array(
      z
        .string()
        .trim()
        .transform((s) => s.replace(/^@/, ""))
        .refine((s) => UsernameRegex.test(s), {
          message: "5-32 chars, letters/digits/underscore, must start with a letter",
        }),
    )
    .min(1)
    .max(50),
  channel_title: z.string().trim().min(1).max(128),
  channel_description: z.string().trim().max(255).optional().default(""),
  pfp_url: z.string().trim().url().optional().or(z.literal("")),
  first_post_text: z.string().max(4000).optional().default(""),
  first_post_media_url: z.string().trim().url().max(1024).optional().or(z.literal("")),
});

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateJobSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: account, error: accErr } = await supabase
      .from("telegram_accounts")
      .select("id, status")
      .eq("id", data.telegram_account_id)
      .maybeSingle();
    if (accErr) throw new Error(accErr.message);
    if (!account) throw new Error("Telegram account not found");
    if (account.status !== "active") throw new Error("Telegram account is not active");

    // Dedupe within the batch.
    const uniq = Array.from(new Set(data.usernames.map((u) => u.toLowerCase())));

    const rows = uniq.map((username) => ({
      user_id: userId,
      telegram_account_id: data.telegram_account_id,
      username,
      channel_title: data.channel_title,
      channel_description: data.channel_description ?? "",
      pfp_url: data.pfp_url || null,
      first_post_text: data.first_post_text ?? "",
      first_post_media_url: data.first_post_media_url || null,
    }));

    const { data: inserted, error } = await supabase
      .from("claim_jobs")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);
    return { count: inserted?.length ?? 0 };
  });


export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("claim_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data;
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("claim_jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
