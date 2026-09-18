import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TaskStatus = "aberta" | "concluida" | "cancelada";

export type CrmTask = {
  id: string;
  card_id: string | null;
  numero: string | null;
  titulo: string;
  descricao: string;
  responsavel_id: string | null;
  prazo: string | null;
  status: TaskStatus;
  origem: "humano" | "ia";
  concluido_em: string | null;
  created_at: string;
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

const SELECT = "id, card_id, numero, titulo, descricao, responsavel_id, prazo, status, origem, concluido_em, created_at";

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { cardId?: string | null; numero?: string | null; incluirConcluidas?: boolean }) => ({
    cardId: d?.cardId ? String(d.cardId) : null,
    numero: d?.numero ? String(d.numero).slice(0, 80) : null,
    incluirConcluidas: !!d?.incluirConcluidas,
  }))
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    let q = context.supabase.from("crm_task").select(SELECT).eq("company_id", cid);
    if (data.cardId) q = q.eq("card_id", data.cardId);
    if (data.numero) q = q.eq("numero", data.numero);
    if (!data.incluirConcluidas) q = q.eq("status", "aberta");
    const { data: rows, error } = await q
      .order("prazo", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    return (rows ?? []) as CrmTask[];
  });

export const saveTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    titulo: string;
    descricao?: string;
    prazo?: string | null;
    responsavelId?: string | null;
    cardId?: string | null;
    numero?: string | null;
  }) => {
    const titulo = String(d?.titulo ?? "").trim().slice(0, 160);
    if (titulo.length < 2) throw new Error("Escreva o que precisa ser feito");
    let prazo: string | null = null;
    if (d?.prazo) {
      const t = new Date(d.prazo);
      if (Number.isNaN(t.getTime())) throw new Error("Prazo inválido");
      prazo = t.toISOString();
    }
    return {
      id: d?.id ? String(d.id) : undefined,
      titulo,
      descricao: String(d?.descricao ?? "").trim().slice(0, 2000),
      prazo,
      responsavelId: d?.responsavelId ? String(d.responsavelId) : null,
      cardId: d?.cardId ? String(d.cardId) : null,
      numero: d?.numero ? String(d.numero).slice(0, 80) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const payload = {
      titulo: data.titulo,
      descricao: data.descricao,
      prazo: data.prazo,
      responsavel_id: data.responsavelId,
      card_id: data.cardId,
      numero: data.numero,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("crm_task")
        .update(payload)
        .eq("company_id", cid)
        .eq("id", data.id)
        .select(SELECT)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row as CrmTask;
    }
    const { data: row, error } = await context.supabase
      .from("crm_task")
      .insert({ ...payload, company_id: cid, criado_por: context.userId, origem: "humano" })
      .select(SELECT)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as CrmTask;
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: TaskStatus }) => {
    if (!d?.id) throw new Error("id obrigatório");
    const status = String(d?.status ?? "") as TaskStatus;
    if (!["aberta", "concluida", "cancelada"].includes(status)) throw new Error("Situação inválida");
    return { id: String(d.id), status };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_task")
      .update({
        status: data.status,
        concluido_em: data.status === "concluida" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", cid)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id obrigatório");
    return { id: String(d.id) };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_task")
      .delete()
      .eq("company_id", cid)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
