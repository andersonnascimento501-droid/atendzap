CREATE OR REPLACE FUNCTION public.campaign_claim_targets(_campaign_id uuid, _limit integer DEFAULT 5, _worker text DEFAULT NULL::text)
RETURNS SETOF public.campaign_target
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.campaign_target t
     SET status = 'enviando',
         locked_at = now(),
         locked_by = COALESCE(_worker, 'worker'),
         tentativas = t.tentativas + 1
   WHERE t.id IN (
     SELECT id FROM public.campaign_target
      WHERE campaign_id = _campaign_id
        AND (
          status = 'pendente'
          OR (status = 'enviando' AND locked_at < now() - interval '10 minutes')
        )
      ORDER BY created_at ASC
      LIMIT GREATEST(1, LEAST(_limit, 50))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING t.*;
$$;

REVOKE ALL ON FUNCTION public.campaign_claim_targets(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_claim_targets(uuid, integer, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_claim_targets(uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.campaign_pending_count(_campaign_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)::int FROM public.campaign_target
   WHERE campaign_id = _campaign_id AND status IN ('pendente','enviando');
$$;

REVOKE ALL ON FUNCTION public.campaign_pending_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_pending_count(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_pending_count(uuid) TO service_role;
