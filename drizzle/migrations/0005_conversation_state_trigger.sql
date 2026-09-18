-- Mantém o estado da conversa (fila e espera) em sincronia com as mensagens.
CREATE OR REPLACE FUNCTION public.touch_conversation_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.conversation_state (company_id, numero, channel, fila, ultima_entrada_em, ultima_saida_em)
  VALUES (
    NEW.company_id,
    NEW.numero,
    COALESCE(NEW.channel, 'whatsapp'),
    CASE WHEN NEW.direcao = 'entrada' THEN 'aberta' ELSE 'aguardando' END,
    CASE WHEN NEW.direcao = 'entrada' THEN NEW.created_at ELSE NULL END,
    CASE WHEN NEW.direcao = 'entrada' THEN NULL ELSE NEW.created_at END
  )
  ON CONFLICT (company_id, numero) DO UPDATE SET
    ultima_entrada_em = CASE WHEN NEW.direcao = 'entrada' THEN NEW.created_at ELSE public.conversation_state.ultima_entrada_em END,
    ultima_saida_em = CASE WHEN NEW.direcao = 'entrada' THEN public.conversation_state.ultima_saida_em ELSE NEW.created_at END,
    fila = CASE
      WHEN NEW.direcao = 'entrada' THEN 'aberta'
      WHEN public.conversation_state.fila = 'resolvida' THEN 'resolvida'
      ELSE 'aguardando'
    END,
    resolvido_em = CASE WHEN NEW.direcao = 'entrada' THEN NULL ELSE public.conversation_state.resolvido_em END,
    resolvido_por = CASE WHEN NEW.direcao = 'entrada' THEN NULL ELSE public.conversation_state.resolvido_por END,
    updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_conversation_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_conversation_state() FROM anon;
REVOKE ALL ON FUNCTION public.touch_conversation_state() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.touch_conversation_state() TO service_role;

DROP TRIGGER IF EXISTS mensagens_touch_conversation_state ON public.mensagens;
CREATE TRIGGER mensagens_touch_conversation_state
AFTER INSERT ON public.mensagens
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_state();