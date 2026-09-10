-- P4: funções internas não devem ser chamáveis pelo cliente (Data API).
REVOKE EXECUTE ON FUNCTION public.consume_ai_credit(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.topup_plan_credits(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_fin_categorias(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_stages() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_company_trial_credits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_fin_auto_receita_on_ganho() FROM anon, authenticated;

-- Funções administrativas/utilitárias: só usuário autenticado (nunca anônimo).
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fin_enable_for_company(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_super_admin_bootstrap() FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_super_admin_if_empty() FROM anon;

GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.topup_plan_credits(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_fin_categorias(uuid) TO service_role;