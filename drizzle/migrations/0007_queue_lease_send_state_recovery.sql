ALTER TABLE public.message_processing_queue ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.message_processing_queue ADD COLUMN IF NOT EXISTS credit_refunded boolean NOT NULL DEFAULT false;
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS send_status text;
COMMENT ON COLUMN public.mensagens.send_status IS 'Saídas da IA: sending | sent | uncertain. NULL = legado/entrada.';

CREATE OR REPLACE FUNCTION public.mq_claim_due(_limit integer DEFAULT 10, _worker text DEFAULT NULL::text)
RETURNS SETOF public.message_processing_queue LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.message_processing_queue q
     SET status='processing', locked_at=now(), locked_by=COALESCE(_worker,'worker'),
         run_seq=q.run_seq+1, lease_token=gen_random_uuid(), updated_at=now()
   WHERE q.id IN (
     SELECT id FROM public.message_processing_queue
      WHERE available_at <= now()
        AND (status='pending' OR (status='processing' AND locked_at < now() - interval '5 minutes'))
      ORDER BY available_at ASC
      LIMIT GREATEST(1, LEAST(_limit, 50))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
$$;

CREATE OR REPLACE FUNCTION public.mq_renew_lease(_id uuid, _token uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH u AS (UPDATE public.message_processing_queue SET locked_at=now(), updated_at=now()
    WHERE id=_id AND lease_token=_token AND status='processing' RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM u);
$$;

-- Enfileira/estende o debounce de forma atômica (sem corrida entre webhooks).
CREATE OR REPLACE FUNCTION public.mq_enqueue(_company_id uuid, _numero text, _instance_name text, _available_at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.message_processing_queue(company_id, numero, instance_name, status, available_at)
  VALUES (_company_id, _numero, _instance_name, 'pending', _available_at)
  ON CONFLICT (company_id, numero) WHERE status IN ('pending','processing')
  DO UPDATE SET available_at = CASE WHEN public.message_processing_queue.status='pending'
                                    THEN GREATEST(public.message_processing_queue.available_at, EXCLUDED.available_at)
                                    ELSE public.message_processing_queue.available_at END,
                updated_at = now();
$$;

-- Finaliza o ciclo SOMENTE se o chamador ainda tem a posse. Se sobrou entrada
-- sem processar e o job saiu de "ativo", cria o próximo ciclo na mesma transação.
CREATE OR REPLACE FUNCTION public.mq_finish(_id uuid, _token uuid, _status text, _error text DEFAULT NULL, _retry_at timestamptz DEFAULT NULL, _attempts integer DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row public.message_processing_queue;
BEGIN
  IF _status NOT IN ('completed','failed','pending') THEN RAISE EXCEPTION 'status inválido'; END IF;
  UPDATE public.message_processing_queue
     SET status=_status, last_error=_error,
         attempts=COALESCE(_attempts, attempts),
         available_at=COALESCE(_retry_at, available_at),
         completed_at=CASE WHEN _status='completed' THEN now() ELSE completed_at END,
         locked_at=NULL, locked_by=NULL, lease_token=NULL, updated_at=now()
   WHERE id=_id AND lease_token=_token AND status='processing'
   RETURNING * INTO _row;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _status IN ('completed','failed') AND EXISTS (
       SELECT 1 FROM public.mensagens m WHERE m.company_id=_row.company_id AND m.numero=_row.numero
         AND m.direcao='entrada' AND m.ai_processed_at IS NULL) THEN
    PERFORM public.mq_enqueue(_row.company_id, _row.numero, _row.instance_name, now() + interval '5 seconds');
  END IF;
  RETURN true;
END $$;

-- Recuperação de entradas órfãs (sem job ativo). Não reenfileira conversa cujo
-- último job falhou definitivamente depois da mensagem, nem mexe em conversa com
-- job recente (canal fora do ar etc.). Janela limitada a 24h.
CREATE OR REPLACE FUNCTION public.mq_recover_orphans(_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; _n integer := 0;
BEGIN
  FOR r IN
    SELECT m.company_id, m.numero, min(m.created_at) AS primeira
      FROM public.mensagens m
     WHERE m.direcao='entrada' AND m.ai_processed_at IS NULL
       AND m.created_at < now() - interval '2 minutes'
       AND m.created_at > now() - interval '24 hours'
     GROUP BY m.company_id, m.numero
     LIMIT GREATEST(1, LEAST(_limit, 200))
  LOOP
    IF EXISTS (SELECT 1 FROM public.message_processing_queue q WHERE q.company_id=r.company_id AND q.numero=r.numero
                AND (q.status IN ('pending','processing')
                     OR q.updated_at > now() - interval '15 minutes'
                     OR (q.status='failed' AND q.updated_at >= r.primeira))) THEN
      CONTINUE;
    END IF;
    PERFORM public.mq_enqueue(r.company_id, r.numero, NULL, now());
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.refund_ai_credit(_company_id uuid, _ref text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _novo int;
BEGIN
  UPDATE public.company SET creditos_saldo = creditos_saldo + 1 WHERE id=_company_id RETURNING creditos_saldo INTO _novo;
  IF _novo IS NULL THEN RETURN false; END IF;
  INSERT INTO public.credit_ledger(company_id, delta, saldo_apos, motivo, ref) VALUES (_company_id, 1, _novo, 'ai_refund', _ref);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.mq_claim_due(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mq_renew_lease(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mq_enqueue(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mq_finish(uuid, uuid, text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mq_recover_orphans(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_credit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mq_claim_due(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mq_renew_lease(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mq_enqueue(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mq_finish(uuid, uuid, text, text, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mq_recover_orphans(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_credit(uuid, text) TO service_role;