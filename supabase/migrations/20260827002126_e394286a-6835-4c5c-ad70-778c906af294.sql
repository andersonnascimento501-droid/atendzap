-- ============ TEMPLATES GLOBAIS ============
CREATE TABLE public.agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  descricao text NOT NULL DEFAULT '',
  descricao_curta text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT 'geral',
  icon text,
  ativo boolean NOT NULL DEFAULT true,
  destaque boolean NOT NULL DEFAULT false,
  prompt_base text NOT NULL DEFAULT '',
  provider_default text NOT NULL DEFAULT 'openai',
  model_default text NOT NULL DEFAULT 'gpt-4o-mini',
  channels_supported text[] NOT NULL DEFAULT ARRAY['whatsapp','instagram'],
  default_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_followup jsonb,
  recommended_stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.agent_templates TO authenticated;
GRANT ALL ON public.agent_templates TO service_role;

ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_read_published" ON public.agent_templates
  FOR SELECT TO authenticated
  USING (ativo = true OR public.is_super_admin());

CREATE POLICY "templates_insert_super" ON public.agent_templates
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

CREATE POLICY "templates_update_super" ON public.agent_templates
  FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "templates_delete_super" ON public.agent_templates
  FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE TRIGGER trg_agent_templates_updated
  BEFORE UPDATE ON public.agent_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CAMPOS DO TEMPLATE ============
CREATE TABLE public.agent_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.agent_templates(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  field_type text NOT NULL DEFAULT 'string',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, key)
);

GRANT SELECT ON public.agent_template_fields TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.agent_template_fields TO authenticated;
GRANT ALL ON public.agent_template_fields TO service_role;

ALTER TABLE public.agent_template_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_fields_read" ON public.agent_template_fields
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_templates t
    WHERE t.id = agent_template_fields.template_id
      AND (t.ativo = true OR public.is_super_admin())
  ));

CREATE POLICY "template_fields_write_super" ON public.agent_template_fields
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TRIGGER trg_agent_template_fields_updated
  BEFORE UPDATE ON public.agent_template_fields
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ AGENTE INSTALADO ============
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES public.agent_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY['whatsapp','instagram'];

CREATE UNIQUE INDEX IF NOT EXISTS agent_config_company_template_uniq
  ON public.agent_config (company_id, source_template_id)
  WHERE source_template_id IS NOT NULL;

-- ============ TEMPLATES DEMONSTRATIVOS ============
INSERT INTO public.agent_templates
  (nome, slug, categoria, descricao_curta, descricao, prompt_base, destaque, default_tools, recommended_stages, channels_supported)
VALUES
  (
    'Comercial', 'comercial', 'vendas',
    'Qualifica leads, apresenta produtos e conduz para a proposta.',
    'Agente comercial genérico: recebe o lead, entende a necessidade, qualifica, apresenta os produtos cadastrados e conduz para proposta ou transferência humana.',
    'Você é um agente comercial. Entenda a necessidade do cliente, qualifique o lead, apresente as opções cadastradas e conduza para a próxima etapa. Seja objetivo e cordial.',
    true,
    '["atualizar_lead","qualificar_lead","mover_pipeline","transferir_humano","finalizar_lead"]'::jsonb,
    '[{"nome":"Novo","tipo":"normal"},{"nome":"Em atendimento","tipo":"normal"},{"nome":"Qualificado","tipo":"normal"},{"nome":"Proposta","tipo":"normal"},{"nome":"Ganho","tipo":"ganho"},{"nome":"Perdido","tipo":"perda"}]'::jsonb,
    ARRAY['whatsapp','instagram']
  ),
  (
    'Atendimento Geral', 'atendimento-geral', 'atendimento',
    'Responde dúvidas frequentes e encaminha para humano quando necessário.',
    'Agente de atendimento genérico: responde dúvidas com base nas informações da empresa e transfere para um atendente humano quando o assunto sair do escopo.',
    'Você é um agente de atendimento. Responda com base nas informações da empresa, seja claro e educado, e transfira para um atendente humano quando não tiver certeza.',
    false,
    '["atualizar_lead","transferir_humano","finalizar_lead"]'::jsonb,
    '[]'::jsonb,
    ARRAY['whatsapp','instagram']
  );

INSERT INTO public.agent_template_fields (template_id, key, label, description, field_type, required, sort_order)
SELECT t.id, v.key, v.label, v.description, v.field_type, v.required, v.sort_order
FROM public.agent_templates t
CROSS JOIN (VALUES
  ('interesse', 'Interesse principal', 'Produto ou serviço de interesse do lead', 'string', false, 0),
  ('orcamento', 'Orçamento estimado', 'Faixa de investimento informada pelo lead', 'string', false, 1),
  ('prazo', 'Prazo de decisão', 'Quando o lead pretende decidir', 'string', false, 2)
) AS v(key, label, description, field_type, required, sort_order)
WHERE t.slug = 'comercial';

INSERT INTO public.agent_template_fields (template_id, key, label, description, field_type, required, sort_order)
SELECT t.id, v.key, v.label, v.description, v.field_type, v.required, v.sort_order
FROM public.agent_templates t
CROSS JOIN (VALUES
  ('assunto', 'Assunto do contato', 'Motivo pelo qual o cliente entrou em contato', 'string', false, 0)
) AS v(key, label, description, field_type, required, sort_order)
WHERE t.slug = 'atendimento-geral';