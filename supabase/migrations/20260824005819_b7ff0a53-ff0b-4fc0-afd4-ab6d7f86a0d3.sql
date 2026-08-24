-- ============ FOLLOW-UP: configuração da cadência ============
CREATE TABLE public.followup_sequence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agent_config(id) ON DELETE SET NULL,
  nome text NOT NULL DEFAULT 'Follow-up',
  ativo boolean NOT NULL DEFAULT false,
  eligible_stage_ids uuid[] NOT NULL DEFAULT '{}',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  allowed_start_time time NOT NULL DEFAULT '08:00',
  allowed_end_time time NOT NULL DEFAULT '20:00',
  final_action text NOT NULL DEFAULT 'none',
  final_stage_id uuid REFERENCES public.crm_stage(id) ON DELETE SET NULL,
  restart_on_reply boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followup_sequence_final_action_chk CHECK (final_action IN ('none','finalize','move_stage','stop'))
);
CREATE INDEX followup_sequence_company_idx ON public.followup_sequence(company_id, ativo);
CREATE INDEX followup_sequence_agent_idx ON public.followup_sequence(agent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_sequence TO authenticated;
GRANT ALL ON public.followup_sequence TO service_role;
ALTER TABLE public.followup_sequence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followup_sequence company access" ON public.followup_sequence
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));
CREATE TRIGGER followup_sequence_updated BEFORE UPDATE ON public.followup_sequence
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ FOLLOW-UP: etapas ============
CREATE TABLE public.followup_step (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id uuid NOT NULL REFERENCES public.followup_sequence(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  delay_value integer NOT NULL DEFAULT 30,
  delay_unit text NOT NULL DEFAULT 'minutes',
  message_mode text NOT NULL DEFAULT 'ai',
  message_template text NOT NULL DEFAULT '',
  move_stage_id uuid REFERENCES public.crm_stage(id) ON DELETE SET NULL,
  finalize boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followup_step_delay_unit_chk CHECK (delay_unit IN ('minutes','hours','days')),
  CONSTRAINT followup_step_delay_value_chk CHECK (delay_value > 0 AND delay_value <= 100000),
  CONSTRAINT followup_step_message_mode_chk CHECK (message_mode IN ('template','ai','none'))
);
CREATE INDEX followup_step_seq_idx ON public.followup_step(sequence_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_step TO authenticated;
GRANT ALL ON public.followup_step TO service_role;
ALTER TABLE public.followup_step ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followup_step company access" ON public.followup_step
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));
CREATE TRIGGER followup_step_updated BEFORE UPDATE ON public.followup_step
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ FOLLOW-UP: estado por contato ============
CREATE TABLE public.followup_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.followup_sequence(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  numero text NOT NULL,
  agent_id uuid REFERENCES public.agent_config(id) ON DELETE SET NULL,
  current_step integer NOT NULL DEFAULT 0,
  anchor_at timestamptz NOT NULL DEFAULT now(),
  next_run_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  last_sent_at timestamptz,
  last_error text,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followup_state_status_chk CHECK (status IN ('pending','processing','completed','cancelled','error'))
);
CREATE INDEX followup_state_due_idx ON public.followup_state(status, next_run_at);
CREATE INDEX followup_state_contact_idx ON public.followup_state(company_id, numero);
CREATE UNIQUE INDEX followup_state_active_uniq
  ON public.followup_state(company_id, numero, sequence_id)
  WHERE status IN ('pending','processing');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_state TO authenticated;
GRANT ALL ON public.followup_state TO service_role;
ALTER TABLE public.followup_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followup_state company access" ON public.followup_state
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));
CREATE TRIGGER followup_state_updated BEFORE UPDATE ON public.followup_state
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Claim atômico de jobs vencidos (evita envio duplicado por workers concorrentes)
CREATE OR REPLACE FUNCTION public.followup_claim_due(_limit integer DEFAULT 25)
RETURNS SETOF public.followup_state
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.followup_state s
     SET status = 'processing', locked_at = now(), updated_at = now()
   WHERE s.id IN (
     SELECT id FROM public.followup_state
      WHERE next_run_at IS NOT NULL
        AND next_run_at <= now()
        AND (status = 'pending' OR (status = 'processing' AND locked_at < now() - interval '10 minutes'))
      ORDER BY next_run_at ASC
      LIMIT GREATEST(1, LEAST(_limit, 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING s.*;
$$;
REVOKE ALL ON FUNCTION public.followup_claim_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.followup_claim_due(integer) TO service_role;