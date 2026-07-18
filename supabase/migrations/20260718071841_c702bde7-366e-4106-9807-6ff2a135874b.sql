
CREATE TABLE public.claim_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  username TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  channel_description TEXT NOT NULL DEFAULT '',
  pfp_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  result_message TEXT,
  channel_id TEXT,
  invite_link TEXT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_jobs_status ON public.claim_jobs (status, created_at);
CREATE INDEX idx_claim_jobs_user_id ON public.claim_jobs (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_jobs TO authenticated;
GRANT ALL ON public.claim_jobs TO service_role;

ALTER TABLE public.claim_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own jobs" ON public.claim_jobs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_claim_jobs_updated_at
BEFORE UPDATE ON public.claim_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
