-- company: insert somente super_admin (fluxos legítimos usam service role no servidor)
DROP POLICY IF EXISTS company_insert ON public.company;
CREATE POLICY company_insert ON public.company
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

-- company: update apenas owner/admin da empresa ou super_admin (atendente bloqueado)
DROP POLICY IF EXISTS company_update ON public.company;
CREATE POLICY company_update ON public.company
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_company_role(id, ARRAY['owner','admin']))
  WITH CHECK (public.is_super_admin() OR public.has_company_role(id, ARRAY['owner','admin']));

-- app_config: garante insert restrito a super_admin
DROP POLICY IF EXISTS app_config_insert ON public.app_config;
CREATE POLICY app_config_insert ON public.app_config
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());