-- 1) Nenhuma função do schema public deve ser executável por visitantes anônimos.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 2) Funções internas (créditos, triggers, seeds, bootstrap) não podem ser chamadas pelo cliente logado.
REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid, text) FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.topup_plan_credits(uuid, text) FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_stages() FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.seed_fin_categorias(uuid) FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.tg_company_trial_credits() FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.tg_fin_auto_receita_on_ganho() FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.claim_super_admin_if_empty() FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_claim_targets(uuid, integer, text) FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_pending_count(uuid) FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.followup_claim_due(integer) FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.mq_claim_due(integer, text) FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.mq_cleanup() FROM authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.topup_plan_credits(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_default_stages() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_fin_categorias(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_claim_targets(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_pending_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.followup_claim_due(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mq_claim_due(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mq_cleanup() TO service_role;

-- 3) Funções necessárias para RLS e ações administrativas legítimas continuam para usuários logados.
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_operational(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_super_admin_bootstrap() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_enable_for_company(uuid, boolean) TO authenticated;
