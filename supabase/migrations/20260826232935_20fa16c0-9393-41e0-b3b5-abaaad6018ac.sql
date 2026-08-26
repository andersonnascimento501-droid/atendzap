-- =========================================================
-- BLOCO 4 — fila de processamento assíncrono das mensagens
-- =========================================================

CREATE TABLE public.message_processing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  numero text NOT NULL,
  instance_name text,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  credit_consumed boolean NOT NULL DEFAULT false,
  routed_agent_id uuid,
  run_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT message_processing_queue_status_chk
    CHECK (status IN ('pending','processing','completed','failed','cancelled'))
);

GRANT SELECT ON public.message_processing_queue TO authenticated;
GRANT ALL ON public.message_processing_queue TO service_role;

ALTER TABLE public.message_processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mq_select_company" ON public.message_processing_queue
  FOR SELECT TO authenticated
  USING (public.has_company_access(company_id));

CREATE TRIGGER tg_mq_updated_at BEFORE UPDATE ON public.message_processing_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Um único job ATIVO por conversa => ordem garantida por company_id + numero.
CREATE UNIQUE INDEX message_processing_queue_active_uniq
  ON public.message_processing_queue (company_id, numero)
  WHERE status IN ('pending','processing');

CREATE INDEX message_processing_queue_due_idx
  ON public.message_processing_queue (available_at)
  WHERE status IN ('pending','processing');

-- --------------------------------------------------------
-- mensagens: mídia postergada, marcação de processamento e
-- idempotência de saída
-- --------------------------------------------------------
ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS media_ref jsonb,
  ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_key text;

CREATE UNIQUE INDEX IF NOT EXISTS mensagens_response_key_uniq
  ON public.mensagens (company_id, response_key)
  WHERE response_key IS NOT NULL;

-- Idempotência de entrada: mesmo evento da Evolution nunca grava 2x.
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_whatsapp_message_id_uniq
  ON public.mensagens (company_id, whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mensagens_pending_ai_idx
  ON public.mensagens (company_id, numero, created_at)
  WHERE direcao = 'entrada' AND ai_processed_at IS NULL;

-- --------------------------------------------------------
-- Claim atômico (FOR UPDATE SKIP LOCKED)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mq_claim_due(_limit integer DEFAULT 10, _worker text DEFAULT NULL)
RETURNS SETOF public.message_processing_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.message_processing_queue q
     SET status = 'processing',
         locked_at = now(),
         locked_by = COALESCE(_worker, 'worker'),
         run_seq = q.run_seq + 1,
         updated_at = now()
   WHERE q.id IN (
     SELECT id FROM public.message_processing_queue
      WHERE available_at <= now()
        AND (status = 'pending' OR (status = 'processing' AND locked_at < now() - interval '5 minutes'))
      ORDER BY available_at ASC
      LIMIT GREATEST(1, LEAST(_limit, 50))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING q.*;
$$;

REVOKE ALL ON FUNCTION public.mq_claim_due(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mq_claim_due(integer, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mq_claim_due(integer, text) TO service_role;

-- --------------------------------------------------------
-- Limpeza periódica (nunca apaga mensagens/lead_evento)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mq_cleanup()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.message_processing_queue
   WHERE (status IN ('completed','cancelled') AND COALESCE(completed_at, updated_at) < now() - interval '7 days')
      OR (status = 'failed' AND updated_at < now() - interval '30 days');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.mq_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mq_cleanup() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mq_cleanup() TO service_role;

-- --------------------------------------------------------
-- Agendamentos
-- --------------------------------------------------------
SELECT cron.schedule(
  'process-message-queue-every-minute',
  '* * * * *',
  $CRON$
  select net.http_post(
    url:='https://project--fb4fa60f-d0e7-4f7b-b13a-9f67ed198ca9.lovable.app/api/public/hooks/process-message-queue',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_aj8HIoZ6Yu0w-HlXDFKi3A_J0LO9T7G"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $CRON$
);

SELECT cron.schedule(
  'message-queue-cleanup-daily',
  '20 4 * * *',
  $CRON$ select public.mq_cleanup(); $CRON$
);
