ALTER TABLE public.company ADD COLUMN IF NOT EXISTS agent_test_mode boolean NOT NULL DEFAULT false;
ALTER TABLE public.company ADD COLUMN IF NOT EXISTS agent_test_phone text;