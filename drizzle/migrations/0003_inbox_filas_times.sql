-- Bloco A: caixa de entrada com filas, atribuição, notas internas e etiquetas de conversa.

CREATE TABLE IF NOT EXISTS public.conversation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  numero text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  owner_id uuid,
  fila text NOT NULL DEFAULT 'aberta',
  tags text[] NOT NULL DEFAULT '{}',
  ultima_entrada_em timestamptz,
  ultima_saida_em timestamptz,
  resolvido_em timestamptz,
  resolvido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_state_fila_chk CHECK (fila IN ('aberta','aguardando','resolvida')),
  CONSTRAINT conversation_state_unq UNIQUE (company_id, numero)
);

CREATE INDEX IF NOT EXISTS conversation_state_company_fila_idx ON public.conversation_state (company_id, fila);
CREATE INDEX IF NOT EXISTS conversation_state_company_owner_idx ON public.conversation_state (company_id, owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_state TO authenticated;
GRANT ALL ON public.conversation_state TO service_role;
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversation_state por empresa" ON public.conversation_state
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));

CREATE TABLE IF NOT EXISTS public.conversation_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  numero text NOT NULL,
  autor_id uuid,
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_note_company_numero_idx ON public.conversation_note (company_id, numero, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_note TO authenticated;
GRANT ALL ON public.conversation_note TO service_role;
ALTER TABLE public.conversation_note ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversation_note por empresa" ON public.conversation_note
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));

CREATE TABLE IF NOT EXISTS public.conversation_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#6b7280',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_tag_unq UNIQUE (company_id, nome)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_tag TO authenticated;
GRANT ALL ON public.conversation_tag TO service_role;
ALTER TABLE public.conversation_tag ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversation_tag por empresa" ON public.conversation_tag
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));

CREATE TABLE IF NOT EXISTS public.conversation_assignment_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  numero text NOT NULL,
  de_user_id uuid,
  para_user_id uuid,
  por_user_id uuid,
  motivo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_assignment_event_idx ON public.conversation_assignment_event (company_id, numero, created_at DESC);

GRANT SELECT, INSERT ON public.conversation_assignment_event TO authenticated;
GRANT ALL ON public.conversation_assignment_event TO service_role;
ALTER TABLE public.conversation_assignment_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversation_assignment_event por empresa" ON public.conversation_assignment_event
  FOR SELECT TO authenticated
  USING (public.has_company_access(company_id));
CREATE POLICY "conversation_assignment_event insere" ON public.conversation_assignment_event
  FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(company_id));