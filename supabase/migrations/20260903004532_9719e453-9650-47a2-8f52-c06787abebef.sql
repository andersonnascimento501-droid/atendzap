CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============ 1) Campanhas: claim atômico ============
ALTER TABLE public.campaign_target
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS tentativas smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_campaign_target_claim
  ON public.campaign_target(campaign_id, status, created_at);

-- ============ 2) Agenda: sobreposição impossível ============
ALTER TABLE public.agendamento
  ALTER COLUMN fim SET NOT NULL;

ALTER TABLE public.agendamento DROP CONSTRAINT IF EXISTS agendamento_fim_maior;
ALTER TABLE public.agendamento
  ADD CONSTRAINT agendamento_fim_maior CHECK (fim > inicio);

ALTER TABLE public.agendamento DROP CONSTRAINT IF EXISTS agendamento_sem_sobreposicao;
ALTER TABLE public.agendamento
  ADD CONSTRAINT agendamento_sem_sobreposicao
  EXCLUDE USING gist (
    company_id WITH =,
    tstzrange(inicio, fim, '[)') WITH &&
  )
  WHERE (status = 'agendado');

-- ============ 3) Situação operacional da empresa ============
CREATE OR REPLACE FUNCTION public.is_company_operational(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company c
    WHERE c.id = _company_id
      AND (
        c.status_cobranca = 'ativo'
        OR (c.status_cobranca IN ('trial','checkout_pending','pendente') AND COALESCE(c.trial_ate, now()) > now())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_operational(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_operational(uuid) TO authenticated, service_role;
