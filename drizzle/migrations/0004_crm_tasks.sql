-- Bloco C: tarefas e atividades ligadas a leads e conversas.

CREATE TABLE IF NOT EXISTS public.crm_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  numero text,
  titulo text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  responsavel_id uuid,
  prazo timestamptz,
  status text NOT NULL DEFAULT 'aberta',
  criado_por uuid,
  origem text NOT NULL DEFAULT 'humano',
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_task_status_chk CHECK (status IN ('aberta','concluida','cancelada')),
  CONSTRAINT crm_task_origem_chk CHECK (origem IN ('humano','ia'))
);

CREATE INDEX IF NOT EXISTS crm_task_company_status_prazo_idx ON public.crm_task (company_id, status, prazo);
CREATE INDEX IF NOT EXISTS crm_task_company_responsavel_idx ON public.crm_task (company_id, responsavel_id, status);
CREATE INDEX IF NOT EXISTS crm_task_card_idx ON public.crm_task (card_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_task TO authenticated;
GRANT ALL ON public.crm_task TO service_role;
ALTER TABLE public.crm_task ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_task por empresa" ON public.crm_task
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));