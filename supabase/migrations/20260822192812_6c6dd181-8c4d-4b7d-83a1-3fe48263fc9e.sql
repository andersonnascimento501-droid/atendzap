-- 1) agent_config passa a ser multi-linha (N agentes por company)
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS descricao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS prioridade integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- backfill slug a partir do nome do agente
UPDATE public.agent_config
SET slug = COALESCE(NULLIF(regexp_replace(lower(coalesce(nome_agente,'agente')), '[^a-z0-9]+', '-', 'g'), '-'), 'agente')
WHERE slug IS NULL;

-- garante unicidade de slug por company (sufixa duplicados)
WITH d AS (
  SELECT id, slug, row_number() OVER (PARTITION BY company_id, slug ORDER BY created_at, id) rn
  FROM public.agent_config
)
UPDATE public.agent_config a
SET slug = a.slug || '-' || d.rn
FROM d WHERE d.id = a.id AND d.rn > 1;

ALTER TABLE public.agent_config ALTER COLUMN slug SET NOT NULL;

-- PK passa para id; user_id vira opcional (autor da criação)
ALTER TABLE public.agent_config DROP CONSTRAINT IF EXISTS agent_config_company_unique;
ALTER TABLE public.agent_config DROP CONSTRAINT IF EXISTS agent_config_pkey;
ALTER TABLE public.agent_config ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.agent_config ADD CONSTRAINT agent_config_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS agent_config_company_slug_uniq
  ON public.agent_config (company_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS agent_config_one_default_per_company
  ON public.agent_config (company_id) WHERE is_default AND ativo;
CREATE INDEX IF NOT EXISTS agent_config_company_ativo_idx
  ON public.agent_config (company_id, ativo, prioridade);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_config TO authenticated;
GRANT ALL ON public.agent_config TO service_role;

-- 2) estado do agente por conversa
CREATE TABLE IF NOT EXISTS public.conversation_agent_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  numero text NOT NULL,
  agent_id uuid REFERENCES public.agent_config(id) ON DELETE SET NULL,
  intent text,
  confidence numeric,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_agent_state_company_numero_uniq
  ON public.conversation_agent_state (company_id, numero);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_agent_state TO authenticated;
GRANT ALL ON public.conversation_agent_state TO service_role;

ALTER TABLE public.conversation_agent_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_agent_state_company ON public.conversation_agent_state;
CREATE POLICY conversation_agent_state_company
  ON public.conversation_agent_state FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_company_access(company_id))
  WITH CHECK (public.is_super_admin() OR public.has_company_access(company_id));

DROP TRIGGER IF EXISTS conversation_agent_state_updated ON public.conversation_agent_state;
CREATE TRIGGER conversation_agent_state_updated
  BEFORE UPDATE ON public.conversation_agent_state
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();