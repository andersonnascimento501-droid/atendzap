ALTER TABLE public.plan ALTER COLUMN trial_days SET DEFAULT 7;
UPDATE public.plan SET trial_days = 7 WHERE slug IN ('atendai-mensal','atendai-trimestral','atendai-semestral') AND trial_days = 3;
ALTER TABLE public.company ALTER COLUMN trial_ate SET DEFAULT (now() + interval '7 days');