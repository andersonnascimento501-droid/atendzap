ALTER TABLE public.company ADD COLUMN IF NOT EXISTS agent_tested_at timestamptz;

CREATE OR REPLACE FUNCTION public.refund_ai_credit_for_job(_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j record; _ok boolean; _ref text; _ja boolean;
BEGIN
  SELECT * INTO j FROM public.message_processing_queue WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND OR NOT j.credit_consumed OR j.credit_refunded THEN RETURN false; END IF;
  _ref := j.numero || ':' || j.id::text;
  _ok := public.refund_ai_credit(j.company_id, _ref);
  IF _ok THEN
    UPDATE public.message_processing_queue SET credit_refunded = true WHERE id=_job_id;
    RETURN true;
  END IF;
  -- Só sincroniza se o histórico comprova que este mesmo crédito já foi devolvido.
  SELECT EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE company_id=j.company_id AND ref=_ref AND motivo='ai_refund'
  ) AND EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE company_id=j.company_id AND ref=_ref AND motivo='ai_message'
  ) INTO _ja;
  IF _ja THEN
    UPDATE public.message_processing_queue SET credit_refunded = true WHERE id=_job_id;
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.refund_ai_credit_for_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_credit_for_job(uuid) TO service_role;