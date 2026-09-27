ALTER TABLE public.instagram_integration
  ADD COLUMN IF NOT EXISTS instagram_provider text NOT NULL DEFAULT 'meta';
ALTER TABLE public.instagram_integration
  DROP CONSTRAINT IF EXISTS instagram_integration_provider_chk;
ALTER TABLE public.instagram_integration
  ADD CONSTRAINT instagram_integration_provider_chk CHECK (instagram_provider IN ('meta','zernio'));
COMMENT ON COLUMN public.instagram_integration.instagram_provider IS 'Provedor ativo do Instagram: meta (API oficial) ou zernio. Somente um fica ativo por empresa.';

-- Dados da Zernio: tabela acessível SOMENTE pelo servidor (service_role).
-- Guarda a chave e o segredo do webhook criptografados (AES-256-GCM) e nunca é lida pelo navegador.
CREATE TABLE IF NOT EXISTS public.instagram_zernio (
  company_id uuid PRIMARY KEY REFERENCES public.company(id) ON DELETE CASCADE,
  api_key_enc text,
  profile_id text,
  profile_name text,
  account_id text,
  account_username text,
  account_display_name text,
  webhook_id text,
  webhook_token text,
  webhook_secret_enc text,
  status text NOT NULL DEFAULT 'desconectado',
  ultimo_erro text,
  verificado_em timestamptz,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instagram_zernio_status_chk CHECK (status IN ('desconectado','aguardando','conectado','reconectar'))
);

GRANT ALL ON public.instagram_zernio TO service_role;
REVOKE ALL ON public.instagram_zernio FROM anon, authenticated;
ALTER TABLE public.instagram_zernio ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS instagram_zernio_account_uniq
  ON public.instagram_zernio (account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS instagram_zernio_webhook_token_uniq
  ON public.instagram_zernio (webhook_token) WHERE webhook_token IS NOT NULL;

DROP TRIGGER IF EXISTS tg_instagram_zernio_updated_at ON public.instagram_zernio;
CREATE TRIGGER tg_instagram_zernio_updated_at
  BEFORE UPDATE ON public.instagram_zernio
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Identificador da conversa no provedor (Zernio) para responder depois.
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS provider_conversation_id text;
COMMENT ON COLUMN public.mensagens.provider_conversation_id IS 'Id da conversa no provedor externo (ex.: conversationId da Zernio). NULL para WhatsApp/Meta.';
CREATE INDEX IF NOT EXISTS mensagens_provider_conv_idx
  ON public.mensagens (company_id, numero, created_at DESC)
  WHERE provider_conversation_id IS NOT NULL;