-- telegram_accounts
CREATE TABLE public.telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  tg_user_id bigint,
  tg_username text,
  first_name text,
  session_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;

ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own telegram accounts"
  ON public.telegram_accounts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_telegram_accounts_updated
  BEFORE UPDATE ON public.telegram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_telegram_accounts_user ON public.telegram_accounts(user_id);

-- telegram_login_requests
CREATE TABLE public.telegram_login_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  phone_code_hash text,
  code text,
  password text,
  needs_2fa boolean NOT NULL DEFAULT false,
  account_id uuid REFERENCES public.telegram_accounts(id) ON DELETE SET NULL,
  error_message text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_login_requests TO authenticated;
GRANT ALL ON public.telegram_login_requests TO service_role;

ALTER TABLE public.telegram_login_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own login requests"
  ON public.telegram_login_requests
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_telegram_login_requests_updated
  BEFORE UPDATE ON public.telegram_login_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_login_requests_status ON public.telegram_login_requests(status);
CREATE INDEX idx_login_requests_user ON public.telegram_login_requests(user_id);

-- claim_jobs FK
ALTER TABLE public.claim_jobs
  ADD COLUMN telegram_account_id uuid REFERENCES public.telegram_accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_claim_jobs_account ON public.claim_jobs(telegram_account_id);