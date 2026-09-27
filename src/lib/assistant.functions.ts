import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { question: string; requestId?: string }) => ({
    question: String(d?.question ?? "").trim().slice(0, 1000),
    requestId: typeof d?.requestId === "string" && /^[\w-]{8,64}$/.test(d.requestId) ? d.requestId : undefined,
  }))
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

    // Limite de uso: cada pergunta consome 1 crédito da empresa; estornado se a IA falhar.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const ref = `assistente:${userId}:${data.requestId ?? crypto.randomUUID()}`;
    const { withChargedCredit } = await import("./credit-guard");
    const { lovableAiChat } = await import("./lovable-ai.server");
    return withChargedCredit(ref, {
      alreadyCharged: async (r) => {
        if (!data.requestId) return false;
        const { data: rows } = await admin.from("credit_ledger").select("motivo")
          .eq("company_id", companyId).eq("ref", r);
        const m = (rows ?? []).map((x: any) => x.motivo);
        return m.includes("ai_message") && !m.includes("ai_refund");
      },
      consume: async (r) => {
        const { data: ok, error } = await admin.rpc("consume_ai_credit", { _company_id: companyId, _ref: r });
        if (error) throw new Error("Não foi possível verificar seus créditos agora.");
        return ok === true;
      },
      refund: async (r) => {
        const { data: ok } = await admin.rpc("refund_ai_credit", { _company_id: companyId, _ref: r });
        return ok === true;
      },
    }, async () => {
      const raw = await lovableAiChat(buildAssistantMessages(snapshot, data.question));
      if (!raw || !raw.trim()) throw new Error("A IA não respondeu agora. Tente novamente.");
      return parseAssistantReply(raw);
    });
  });
