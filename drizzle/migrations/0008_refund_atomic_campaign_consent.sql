-- 5.3 Estorno atômico e idempotente (uma transação: checa cobrança, checa estorno, devolve, registra).
CREATE OR REPLACE FUNCTION public.refund_ai_credit(_company_id uuid, _ref text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _novo int; _charged int; _refunded int;
BEGIN
  IF _ref IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('refund:' || _company_id::text || ':' || _ref));
  SELECT count(*) INTO _charged FROM public.credit_ledger WHERE company_id=_company_id AND ref=_ref AND motivo='ai_message';
  SELECT count(*) INTO _refunded FROM public.credit_ledger WHERE company_id=_company_id AND ref=_ref AND motivo='ai_refund';
  IF _charged = 0 OR _refunded >= _charged THEN RETURN false; END IF;
  UPDATE public.company SET creditos_saldo = creditos_saldo + 1 WHERE id=_company_id RETURNING creditos_saldo INTO _novo;
  IF _novo IS NULL THEN RAISE EXCEPTION 'empresa inexistente'; END IF;
  INSERT INTO public.credit_ledger(company_id, delta, saldo_apos, motivo, ref) VALUES (_company_id, 1, _novo, 'ai_refund', _ref);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.refund_ai_credit_for_job(_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j record; _ok boolean;
BEGIN
  SELECT * INTO j FROM public.message_processing_queue WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND OR NOT j.credit_consumed OR j.credit_refunded THEN RETURN false; END IF;
  _ok := public.refund_ai_credit(j.company_id, j.numero || ':' || j.id::text);
  -- Só marca estornado depois da devolução (ou se o histórico mostra que já houve estorno).
  UPDATE public.message_processing_queue SET credit_refunded = true WHERE id=_job_id;
  RETURN _ok;
END $$;
REVOKE ALL ON FUNCTION public.refund_ai_credit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_credit_for_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_credit(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_credit_for_job(uuid) TO service_role;

-- 5.4 Campanhas: consentimento/opt-out por contato (não havia onde guardar) e estado incerto.
ALTER TABLE public.crm_cards ADD COLUMN IF NOT EXISTS campanha_consentimento_em timestamptz;
ALTER TABLE public.crm_cards ADD COLUMN IF NOT EXISTS campanha_optout_em timestamptz;
ALTER TYPE public.campaign_target_status ADD VALUE IF NOT EXISTS 'incerto';
CREATE UNIQUE INDEX IF NOT EXISTS campaign_target_unique_dest ON public.campaign_target(campaign_id, contato_numero);