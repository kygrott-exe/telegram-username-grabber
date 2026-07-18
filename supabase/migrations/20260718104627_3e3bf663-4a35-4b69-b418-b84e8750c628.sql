
CREATE TABLE public.claim_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  channel_title text NOT NULL DEFAULT '',
  channel_description text NOT NULL DEFAULT '',
  pfp_url text,
  first_post_text text NOT NULL DEFAULT '',
  first_post_media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_templates TO authenticated;
GRANT ALL ON public.claim_templates TO service_role;
ALTER TABLE public.claim_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own templates" ON public.claim_templates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_claim_templates_updated_at BEFORE UPDATE ON public.claim_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.claim_jobs
  ADD COLUMN first_post_text text NOT NULL DEFAULT '',
  ADD COLUMN first_post_media_url text;
