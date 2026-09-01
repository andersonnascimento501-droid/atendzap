-- 1) Biblioteca de materiais
CREATE TABLE public.agent_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agent_config(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  tipo text NOT NULL CHECK (tipo IN ('image','audio','video','document','link')),
  storage_path text,
  external_url text,
  mime_type text,
  file_name text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_material_conteudo CHECK (
    (tipo = 'link' AND external_url IS NOT NULL) OR (tipo <> 'link' AND storage_path IS NOT NULL)
  )
);
CREATE INDEX agent_material_company_idx ON public.agent_material (company_id, ativo);
CREATE INDEX agent_material_agent_idx ON public.agent_material (company_id, agent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_material TO authenticated;
GRANT ALL ON public.agent_material TO service_role;
ALTER TABLE public.agent_material ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materiais da propria empresa" ON public.agent_material
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id) OR public.is_super_admin())
  WITH CHECK (public.has_company_access(company_id));

CREATE TRIGGER agent_material_updated_at BEFORE UPDATE ON public.agent_material
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Mídia persistida no histórico de mensagens
ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS midia jsonb,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

-- 3) Storage: arquivos privados na pasta da empresa
CREATE POLICY "materiais storage leitura da empresa" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'materiais'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND public.has_company_access(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "materiais storage envio da empresa" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'materiais'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND public.has_company_access(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "materiais storage exclusao da empresa" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'materiais'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND public.has_company_access(((storage.foldername(name))[1])::uuid)
  );