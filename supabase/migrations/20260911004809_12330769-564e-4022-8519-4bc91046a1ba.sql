DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_operational(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_super_admin_bootstrap() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_enable_for_company(uuid, boolean) TO authenticated;
