-- BLOCO 2: Tools internas da IA

-- 1) Tools autorizadas por agente
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS allowed_tools jsonb NOT NULL
  DEFAULT '["atualizar_lead","qualificar_lead","mover_pipeline","transferir_humano","finalizar_lead"]'::jsonb;

-- 2) Dados personalizados coletados no lead
ALTER TABLE public.crm_cards
  ADD COLUMN IF NOT EXISTS custom_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Histórico de ações mais rico
ALTER TABLE public.lead_evento
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.agent_config(id) ON DELETE SET NULL;
ALTER TABLE public.lead_evento
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4) Definição genérica de campos personalizados por empresa/agente
CREATE TABLE IF NOT EXISTS public.agent_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agent_config(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  field_type text NOT NULL DEFAULT 'string',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_custom_fields_unique_key
  ON public.agent_custom_fields (company_id, COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_custom_fields TO authenticated;
GRANT ALL ON public.agent_custom_fields TO service_role;

ALTER TABLE public.agent_custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom fields por empresa" ON public.agent_custom_fields;
CREATE POLICY "custom fields por empresa" ON public.agent_custom_fields
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));

DROP TRIGGER IF EXISTS tg_agent_custom_fields_updated ON public.agent_custom_fields;
CREATE TRIGGER tg_agent_custom_fields_updated
  BEFORE UPDATE ON public.agent_custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();