// Entrada comum do Instagram Direct (Meta oficial e Zernio).
// Mesmo contrato de antes: grava mensagem (dedupe pelo id externo) → cancela follow-up →
// webhooks internos → comandos de pausa → enfileira o MESMO worker. Nunca chama a IA aqui.

export type IgInboundInput = {
  companyId: string;
  userId: string;
  contactId: string; // ig:<id>
  externalMessageId: string | null; // dedupe (coluna whatsapp_message_id, índice único por empresa)
  text: string;
  media: any | null;
  providerConversationId?: string | null;
  resolveName?: () => Promise<string | null>;
};

export type IgInboundResult = "queued" | "duplicate" | "command" | "ignored";

export async function ingestInstagramInbound(admin: any, input: IgInboundInput): Promise<IgInboundResult> {
  const { companyId, userId, contactId, media } = input;
  const text = input.text || "";
  if (!text.trim() && !media) return "ignored";

  const label =
    media?.kind === "audio" ? "[Áudio]" : media?.kind === "image" ? "[Imagem]" : media ? "[Arquivo]" : "";
  const storedText = text.trim() || `${label} (processando...)`;

  // Nome do contato (best-effort, uma vez por conversa).
  let contatoNome: string | null = null;
  const { data: knownCard } = await admin
    .from("crm_cards")
    .select("nome")
    .eq("company_id", companyId)
    .eq("numero", contactId)
    .maybeSingle();
  contatoNome = (knownCard as any)?.nome ?? null;
  if (!contatoNome && input.resolveName) {
    try {
      contatoNome = await input.resolveName();
    } catch {}
  }

  const row: Record<string, any> = {
    company_id: companyId,
    user_id: userId,
    numero: contactId,
    channel: "instagram",
    contato_nome: contatoNome,
    direcao: "entrada",
    autor: "contato",
    texto: storedText,
    whatsapp_message_id: input.externalMessageId,
    media_ref: media,
  };
  if (input.providerConversationId) row.provider_conversation_id = input.providerConversationId;

  const { data: inserted, error: insertErr } = await admin.from("mensagens").insert(row).select("id").maybeSingle();
  if (insertErr) {
    if ((insertErr as any).code !== "23505") throw insertErr;
    // Reentrega: garante que existe job para a conversa (mq_enqueue é idempotente por conversa).
    const { error: reErr } = await admin.rpc("mq_enqueue", {
      _company_id: companyId,
      _numero: contactId,
      _instance_name: null,
      _available_at: new Date(Date.now() + 3_000).toISOString(),
    });
    if (reErr) throw reErr;
    return "duplicate";
  }

  const lower = storedText.toLowerCase().trim();
  const { data: cmdCfg } = await admin
    .from("agent_config")
    .select("palavra_pausar, palavra_despausar, segundos_buffer")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  const palavraPausar = ((cmdCfg as any)?.palavra_pausar || "/pausar").toLowerCase().trim();
  const palavraDespausar = ((cmdCfg as any)?.palavra_despausar || "/despausar").toLowerCase().trim();

  try {
    const { cancelFollowups } = await import("@/lib/followup.server");
    await cancelFollowups(admin, companyId, contactId, "cliente respondeu");
  } catch (e: any) {
    console.error("[followup.reset]", e?.message);
  }

  try {
    const { emitWebhook } = await import("@/lib/webhooks.server");
    void emitWebhook(companyId, "message.received", {
      numero: contactId,
      channel: "instagram",
      contato_nome: contatoNome,
      texto: storedText,
      message_id: inserted?.id,
    });
  } catch {}

  if (lower === palavraPausar || lower === palavraDespausar) {
    const { error: pErr } = await admin
      .from("contact_pause")
      .upsert(
        { company_id: companyId, user_id: userId, numero: contactId, pausado: lower === palavraPausar },
        { onConflict: "company_id,numero" },
      );
    if (pErr) throw pErr;
    const { error: mErr } = await admin
      .from("mensagens")
      .update({ ai_processed_at: new Date().toISOString() })
      .eq("id", inserted?.id);
    if (mErr) throw mErr;
    return "command";
  }

  const bufferSec = Math.max(0, Math.min(20, Number((cmdCfg as any)?.segundos_buffer ?? 8)));
  const { error: qErr } = await admin.rpc("mq_enqueue", {
    _company_id: companyId,
    _numero: contactId,
    _instance_name: null,
    _available_at: new Date(Date.now() + bufferSec * 1000).toISOString(),
  });
  if (qErr) throw qErr;
  return "queued";
}
