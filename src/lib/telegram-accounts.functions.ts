import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{6,20}$/, "Phone must be digits, optional leading +"),
});

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("telegram_accounts")
      .select("id, phone, tg_user_id, tg_username, first_name, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: unknown) => z.object({ id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("telegram_accounts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const startLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: unknown) => PhoneSchema.parse(r))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("telegram_login_requests")
      .insert({ user_id: context.userId, phone: data.phone, status: "pending" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { request_id: row.id as string };
  });

export const getLoginStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: unknown) => z.object({ request_id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("telegram_login_requests")
      .select("id, status, needs_2fa, error_message, account_id, phone, updated_at")
      .eq("id", data.request_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const submitCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        code: z.string().trim().min(3).max(16),
      })
      .parse(r),
  )
  .handler(async ({ data, context }) => {
    const { encryptString } = await import("./session-crypto.server");
    const { error } = await context.supabase
      .from("telegram_login_requests")
      .update({ status: "submit_code", code: encryptString(data.code), error_message: null })
      .eq("id", data.request_id)
      .eq("status", "awaiting_code");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        password: z.string().min(1).max(256),
      })
      .parse(r),
  )
  .handler(async ({ data, context }) => {
    const { encryptString } = await import("./session-crypto.server");
    const { error } = await context.supabase
      .from("telegram_login_requests")
      .update({
        status: "submit_2fa",
        password: encryptString(data.password),
        error_message: null,
      })
      .eq("id", data.request_id)
      .eq("status", "awaiting_password");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((r: unknown) => z.object({ request_id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("telegram_login_requests")
      .delete()
      .eq("id", data.request_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
