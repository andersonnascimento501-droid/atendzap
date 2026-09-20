ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS quando_transferir text NOT NULL DEFAULT '';

GRANT SELECT (quando_transferir), INSERT (quando_transferir), UPDATE (quando_transferir)
ON public.agent_config TO authenticated;

GRANT ALL ON public.agent_config TO service_role;

-- Reparo: a regra de transferência gravada por engano em nao_pode_fazer volta ao campo correto.
UPDATE public.agent_config
SET quando_transferir = btrim(regexp_replace(nao_pode_fazer, '^Transferir para uma pessoa do time nas seguintes situações:\s*', '')),
    nao_pode_fazer = ''
WHERE quando_transferir = ''
  AND nao_pode_fazer ILIKE 'Transferir para uma pessoa do time nas seguintes situações:%';