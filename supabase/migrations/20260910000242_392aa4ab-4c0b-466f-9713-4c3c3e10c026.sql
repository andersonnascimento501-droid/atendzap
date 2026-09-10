-- Hardening: colunas de credenciais de IA em agent_config deixam de ser legíveis/graváveis
-- por clientes autenticados (navegador). Apenas service_role (server-side) mantém acesso.
DO $$
DECLARE
  _cols text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ')
    INTO _cols
    FROM pg_attribute a
   WHERE a.attrelid = 'public.agent_config'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attname NOT IN ('openai_api_key', 'anthropic_api_key');

  -- remove privilégio amplo de tabela e reconcede coluna por coluna (sem as chaves)
  EXECUTE 'REVOKE SELECT, INSERT, UPDATE ON public.agent_config FROM authenticated';
  EXECUTE 'REVOKE SELECT, INSERT, UPDATE ON public.agent_config FROM anon';
  EXECUTE format('GRANT SELECT (%s), INSERT (%s), UPDATE (%s) ON public.agent_config TO authenticated', _cols, _cols, _cols);
END $$;

GRANT DELETE ON public.agent_config TO authenticated;
GRANT ALL ON public.agent_config TO service_role;