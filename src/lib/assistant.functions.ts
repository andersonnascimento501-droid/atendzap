import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { question: string }) => ({ question: String(d?.question ?? "").trim().slice(0, 1000) }))
  .handler(async ({ context, data }) => {
    if (!data.question) throw new Error("Escreva sua pergunta.");
    const { supabase, userId } = context;
    // Empresa do usuário logado (RLS). Nunca aceita company_id vindo do navegador.
    const { data: cu, error } = await supabase
      .from("company_user").select("company_id").eq("user_id", userId).eq("ativo", true)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!cu) throw new Error("Você ainda não possui uma empresa.");
    const companyId = (cu as any).company_id as string;

    const { buildCompanySnapshot, buildAssistantMessages, parseAssistantReply } = await import("./assistant.server");
    const snapshot = await buildCompanySnapshot(supabase, companyId);

    // Limite de uso: cada pergunta consome 1 crédito da empresa (mesmo mecanismo da IA).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok, error: cErr } = await (supabaseAdmin as any).rpc("consume_ai_credit", {
      _company_id: companyId, _ref: `assistente:${userId}:${Date.now()}`,
    });
    if (cErr) throw new Error("Não foi possível verificar seus créditos agora.");
    if (ok !== true) throw new Error("Seus créditos acabaram. Veja seu plano em /app/checkout.");

    const { lovableAiChat } = await import("./lovable-ai.server");
    const raw = await lovableAiChat(buildAssistantMessages(snapshot, data.question));
    return parseAssistantReply(raw);
  });
