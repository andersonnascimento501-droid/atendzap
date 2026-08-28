ALTER TABLE public.agendamento
  ADD COLUMN IF NOT EXISTS lembrete_24h_em timestamptz,
  ADD COLUMN IF NOT EXISTS lembrete_2h_em timestamptz;

ALTER TABLE public.agenda_servico
  ADD COLUMN IF NOT EXISTS lembretes_ativos boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_agendamento_lembretes
  ON public.agendamento(status, inicio)
  WHERE status = 'agendado';