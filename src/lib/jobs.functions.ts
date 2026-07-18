import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateJobSchema = z.object({
  username: z
    .string()
    .trim()
    .min(5)
    .max(32)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/, "5-32 chars, letters/digits/underscore, must start with a letter"),
  channel_title: z.string().trim().min(1).max(128),
  channel_description: z.string().trim().max(255).optional().default(""),
  pfp_url: z.string().trim().url().optional().or(z.literal("")),
});

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateJobSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("claim_jobs")
      .insert({
        user_id: userId,
        username: data.username.replace(/^@/, ""),
        channel_title: data.channel_title,
        channel_description: data.channel_description ?? "",
        pfp_url: data.pfp_url || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
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
