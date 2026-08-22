// Helpers compartilhados de agentes (client-safe).
// agent_config passou a ser multi-linha: N agentes por company.
// O agente "padrão" (is_default) é o que as telas atuais editam.

export type AgentRow = Record<string, any> & {
  id: string;
  company_id: string;
  nome_agente: string;
  slug: string;
  descricao: string;
  ativo: boolean;
  prioridade: number;
  is_default: boolean;
};

export function agentSlugify(s: string): string {
  return (
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "agente"
  );
}

/** Lista todos os agentes ATIVOS da company, em ordem de preferência. */
export async function fetchActiveAgents(client: any, companyId: string): Promise<AgentRow[]> {
  const { data } = await client
    .from("agent_config")
    .select("*")
    .eq("company_id", companyId)
    .eq("ativo", true)
    .order("is_default", { ascending: false })
    .order("prioridade", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as AgentRow[];
}

/** Agente padrão (ou o primeiro ativo por prioridade). Nunca deixa a empresa sem agente. */
export function pickDefaultAgent(agents: AgentRow[]): AgentRow | null {
  return agents.find((a) => a.is_default) ?? agents[0] ?? null;
}

/** Busca direta do agente padrão da company (usado pelas telas atuais). */
export async function fetchDefaultAgent(client: any, companyId: string): Promise<AgentRow | null> {
  const { data } = await client
    .from("agent_config")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .order("prioridade", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as AgentRow) ?? null;
}

/**
 * Salva a configuração do agente padrão da company (update quando já existe,
 * insert do primeiro agente quando não existe). Substitui o antigo
 * upsert onConflict:"company_id".
 */
export async function saveDefaultAgentConfig(
  client: any,
  companyId: string,
  userId: string,
  payload: Record<string, any>,
): Promise<{ error: { message: string } | null }> {
  const { id: _id, company_id: _c, user_id: _u, updated_at: _ua, created_at: _ca, ...rest } = payload;
  const existing = await fetchDefaultAgent(client, companyId);
  if (existing) {
    const { error } = await client
      .from("agent_config")
      .update(rest)
      .eq("id", existing.id)
      .eq("company_id", companyId);
    return { error };
  }
  const { error } = await client.from("agent_config").insert({
    company_id: companyId,
    user_id: userId,
    slug: agentSlugify(rest.nome_agente || "agente"),
    descricao: rest.descricao ?? "",
    ativo: true,
    is_default: true,
    prioridade: 0,
    ...rest,
  });
  return { error };
}
