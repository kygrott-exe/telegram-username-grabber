import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TemplateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  channel_title: z.string().trim().max(128).default(""),
  channel_description: z.string().trim().max(255).default(""),
  pfp_url: z.string().trim().url().max(1024).optional().or(z.literal("")),
  first_post_text: z.string().max(4000).default(""),
  first_post_media_url: z.string().trim().url().max(1024).optional().or(z.literal("")),
});

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("claim_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: unknown) => TemplateSchema.parse(r))
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      name: data.name,
      channel_title: data.channel_title,
      channel_description: data.channel_description,
      pfp_url: data.pfp_url || null,
      first_post_text: data.first_post_text,
      first_post_media_url: data.first_post_media_url || null,
    };
    // Upsert by (user_id, name)
    const { data: existing } = await context.supabase
      .from("claim_templates")
      .select("id")
      .eq("user_id", context.userId)
      .eq("name", data.name)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("claim_templates")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("claim_templates")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: unknown) => z.object({ id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("claim_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
