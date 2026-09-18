import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConversationFila = "aberta" | "aguardando" | "resolvida";

export type ConversationState = {
  numero: string;
  channel: string;
  owner_id: string | null;
  fila: ConversationFila;
  tags: string[];
  ultima_entrada_em: string | null;
  ultima_saida_em: string | null;
  resolvido_em: string | null;
};

export type ConversationNote = {
  id: string;
  numero: string;
  texto: string;
  autor_id: string | null;
  created_at: string;
};

export type ConversationTag = {
  id: string;
  nome: string;
  cor: string;
  ativo: boolean;
};

async function currentCompanyId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Sem empresa ativa");
  return data.company_id as string;
}

function cleanNumero(v: unknown): string {
  const numero = String(v ?? "").trim().slice(0, 80);
  if (!numero) throw new Error("Conversa não informada");
  return numero;
}

/** Garante a linha de estado da conversa (o gatilho cria no fluxo normal de mensagens). */
async function ensureState(supabase: any, companyId: string, numero: string) {
  const { data } = await supabase
    .from("conversation_state")
    .select("numero")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .maybeSingle();
  if (data) return;
  const { error } = await supabase
    .from("conversation_state")
    .insert({ company_id: companyId, numero });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
}

export const listConversationStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("conversation_state")
      .select("numero, channel, owner_id, fila, tags, ultima_entrada_em, ultima_saida_em, resolvido_em")
      .eq("company_id", cid);
    if (error) throw new Error(error.message);
    return (data ?? []) as ConversationState[];
  });

export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; ownerId: string | null; motivo?: string }) => ({
    numero: cleanNumero(d?.numero),
    ownerId: d?.ownerId ? String(d.ownerId) : null,
    motivo: String(d?.motivo ?? "").slice(0, 240),
  }))
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    await ensureState(context.supabase, cid, data.numero);

    const { data: before } = await context.supabase
      .from("conversation_state")
      .select("owner_id")
      .eq("company_id", cid)
      .eq("numero", data.numero)
      .maybeSingle();

    if (data.ownerId) {
      const { data: member } = await context.supabase
        .from("company_user")
        .select("user_id")
        .eq("company_id", cid)
        .eq("user_id", data.ownerId)
        .eq("ativo", true)
        .maybeSingle();
      if (!member) throw new Error("Essa pessoa não faz parte da equipe ativa.");
    }

    const { error } = await context.supabase
      .from("conversation_state")
      .update({ owner_id: data.ownerId, updated_at: new Date().toISOString() })
      .eq("company_id", cid)
      .eq("numero", data.numero);
    if (error) throw new Error(error.message);

    await context.supabase.from("conversation_assignment_event").insert({
      company_id: cid,
      numero: data.numero,
      de_user_id: before?.owner_id ?? null,
      para_user_id: data.ownerId,
      por_user_id: context.userId,
      motivo: data.motivo,
    });

    return { ok: true };
  });

export const setConversationFila = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; fila: ConversationFila }) => {
    const fila = String(d?.fila ?? "") as ConversationFila;
    if (!["aberta", "aguardando", "resolvida"].includes(fila)) throw new Error("Situação inválida");
    return { numero: cleanNumero(d?.numero), fila };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    await ensureState(context.supabase, cid, data.numero);
    const resolvida = data.fila === "resolvida";
    const { error } = await context.supabase
      .from("conversation_state")
      .update({
        fila: data.fila,
        resolvido_em: resolvida ? new Date().toISOString() : null,
        resolvido_por: resolvida ? context.userId : null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", cid)
      .eq("numero", data.numero);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setConversationTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; tags: string[] }) => ({
    numero: cleanNumero(d?.numero),
    tags: Array.from(
      new Set((Array.isArray(d?.tags) ? d.tags : []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean)),
    ).slice(0, 12),
  }))
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    await ensureState(context.supabase, cid, data.numero);
    const { error } = await context.supabase
      .from("conversation_state")
      .update({ tags: data.tags, updated_at: new Date().toISOString() })
      .eq("company_id", cid)
      .eq("numero", data.numero);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listConversationTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("conversation_tag")
      .select("id, nome, cor, ativo")
      .eq("company_id", cid)
      .eq("ativo", true)
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ConversationTag[];
  });

export const createConversationTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string; cor?: string }) => {
    const nome = String(d?.nome ?? "").trim().slice(0, 40);
    if (!nome) throw new Error("Dê um nome para a etiqueta");
    const cor = String(d?.cor ?? "#6b7280").trim();
    return { nome, cor: /^#[0-9a-f]{6}$/i.test(cor) ? cor : "#6b7280" };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("conversation_tag")
      .upsert(
        { company_id: cid, nome: data.nome, cor: data.cor, ativo: true },
        { onConflict: "company_id,nome" },
      )
      .select("id, nome, cor, ativo")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as ConversationTag;
  });

export const listConversationNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => ({ numero: cleanNumero(d?.numero) }))
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("conversation_note")
      .select("id, numero, texto, autor_id, created_at")
      .eq("company_id", cid)
      .eq("numero", data.numero)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ConversationNote[];
  });

export const addConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; texto: string }) => {
    const texto = String(d?.texto ?? "").trim().slice(0, 2000);
    if (!texto) throw new Error("Escreva a nota");
    return { numero: cleanNumero(d?.numero), texto };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("conversation_note")
      .insert({ company_id: cid, numero: data.numero, texto: data.texto, autor_id: context.userId })
      .select("id, numero, texto, autor_id, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as ConversationNote;
  });

export const deleteConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id obrigatório");
    return { id: String(d.id) };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("conversation_note")
      .delete()
      .eq("company_id", cid)
      .eq("id", data.id)
      .eq("autor_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
