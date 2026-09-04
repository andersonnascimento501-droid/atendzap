CREATE TABLE IF NOT EXISTS public.worker_auth (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.worker_auth FROM anon, authenticated;
GRANT ALL ON public.worker_auth TO service_role;
ALTER TABLE public.worker_auth ENABLE ROW LEVEL SECURITY;
-- Sem policies: apenas service_role (server-side) acessa.

INSERT INTO public.worker_auth (id, secret)
VALUES (true, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;
