-- ============ agenda_servico ============
CREATE TABLE public.agenda_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  nome text NOT NULL,
  duracao_min integer NOT NULL DEFAULT 60 CHECK (duracao_min > 0 AND duracao_min <= 1440),
  buffer_min integer NOT NULL DEFAULT 0 CHECK (buffer_min >= 0 AND buffer_min <= 480),
  antecedencia_min integer NOT NULL DEFAULT 60 CHECK (antecedencia_min >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_servico TO authenticated;
GRANT ALL ON public.agenda_servico TO service_role;
ALTER TABLE public.agenda_servico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_servico por empresa" ON public.agenda_servico FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE TRIGGER tg_agenda_servico_updated BEFORE UPDATE ON public.agenda_servico
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_agenda_servico_company ON public.agenda_servico(company_id, ativo);

-- ============ agenda_janela ============
CREATE TABLE public.agenda_janela (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fim > hora_inicio)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_janela TO authenticated;
GRANT ALL ON public.agenda_janela TO service_role;
ALTER TABLE public.agenda_janela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_janela por empresa" ON public.agenda_janela FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE TRIGGER tg_agenda_janela_updated BEFORE UPDATE ON public.agenda_janela
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_agenda_janela_company ON public.agenda_janela(company_id, dia_semana);

-- ============ agenda_bloqueio ============
CREATE TABLE public.agenda_bloqueio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  motivo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim > inicio)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_bloqueio TO authenticated;
GRANT ALL ON public.agenda_bloqueio TO service_role;
ALTER TABLE public.agenda_bloqueio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_bloqueio por empresa" ON public.agenda_bloqueio FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE TRIGGER tg_agenda_bloqueio_updated BEFORE UPDATE ON public.agenda_bloqueio
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_agenda_bloqueio_company ON public.agenda_bloqueio(company_id, inicio, fim);

-- ============ agendamento (tabela existente) ============
ALTER TABLE public.agendamento
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.agenda_servico(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS observacoes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS criado_por text NOT NULL DEFAULT 'painel',
  ADD COLUMN IF NOT EXISTS cancelado_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.agendamento DROP CONSTRAINT IF EXISTS agendamento_status_check;
ALTER TABLE public.agendamento
  ADD CONSTRAINT agendamento_status_check CHECK (status IN ('agendado','cancelado','concluido'));

DROP TRIGGER IF EXISTS tg_agendamento_updated ON public.agendamento;
CREATE TRIGGER tg_agendamento_updated BEFORE UPDATE ON public.agendamento
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- idempotência: nunca dois agendamentos ativos no mesmo início da mesma empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamento_ativo_inicio
  ON public.agendamento(company_id, inicio) WHERE status = 'agendado';

CREATE INDEX IF NOT EXISTS idx_agendamento_company_inicio ON public.agendamento(company_id, inicio);
CREATE INDEX IF NOT EXISTS idx_agendamento_numero ON public.agendamento(company_id, numero, status);