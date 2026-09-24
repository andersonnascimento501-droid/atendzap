// FONTE ÚNICA DE VERDADE do contexto do atendente.
// Preview, teste e runtime real (WhatsApp/Instagram) usam esta mesma montagem.
// Não existe um segundo buildSystemPrompt: esta função apenas CENTRALIZA o que já existia.

import { buildSystemPrompt, type CompanyBrief } from "./ai-prompt";
import { AGENT_SAFE_COLUMNS, pickDefaultAgent, fetchActiveAgents } from "./agents";

export type AgentContextOperational = {
  /** Contexto inevitável do atendimento em andamento (não é configuração do negócio). */
  estagioAtual?: string;
  resumoContato?: string;
};

export type AgentContext = {
  agent: any | null;
  company: CompanyBrief | undefined;
  produtos: Array<{ nome: string; preco: any; descricao: any }>;
  stages: Array<{ id?: string; nome: string; tipo: "normal" | "ganho" | "perda" }>;
  materials: any[];
  allowedTools: string[];
  agendaTools: boolean;
  googleConectado: boolean;
  system: string;
};

const COMPANY_COLUMNS =
  "nome,nome_fantasia,telefone,email_corporativo,site,rua,numero,bairro,cidade,estado,cep,segmento";

/**
 * Carrega company + agent_config + catálogo + tools + materiais + agenda e devolve
 * o prompt final oficial. `overrides` permite testar exatamente a configuração
 * que está na tela (o que o cliente vê = o que ele testa).
 */
export async function loadAgentContext(
  client: any,
  params: {
    companyId: string;
    agentId?: string | null;
    overrides?: Record<string, any> | null;
    operational?: AgentContextOperational;
  },
): Promise<AgentContext> {
  const { companyId } = params;

  let agent: any = null;
  if (params.agentId) {
    const { data } = await client
      .from("agent_config")
      .select(AGENT_SAFE_COLUMNS)
      .eq("company_id", companyId)
      .eq("id", params.agentId)
      .maybeSingle();
    agent = data ?? null;
  }
  if (!agent) {
    agent = pickDefaultAgent(await fetchActiveAgents(client, companyId));
  }

  const [{ data: companyRow }, { data: stageRows }, { data: productRows }, { data: googleRow }] = await Promise.all([
    client.from("company").select(COMPANY_COLUMNS).eq("id", companyId).maybeSingle(),
    client.from("crm_stage").select("id,nome,tipo,ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
    client
      .from("produto")
      .select("nome,preco,descricao,ordem")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    client.from("google_integration").select("conectado").eq("company_id", companyId).maybeSingle(),
  ]);

  const cfg = { ...(agent ?? {}), ...(params.overrides ?? {}) };

  const { normalizeToolList, DEFAULT_ALLOWED_TOOLS, withAgendaTools, withMaterialTool, isAgendaTool, loadMaterials } =
    await import("./agent-tools.server");

  const agentId = (cfg.id as string | undefined) ?? null;
  const materials = agentId ? await loadMaterials(client, companyId, agentId) : [];
  const allowedTools = agentId
    ? withMaterialTool(
        withAgendaTools(normalizeToolList(cfg.allowed_tools ?? DEFAULT_ALLOWED_TOOLS), !!cfg.agendamento_ativo),
        materials.length > 0,
      )
    : [];
  const agendaTools = allowedTools.some((t: string) => isAgendaTool(t));

  const stages = (stageRows ?? []).map((s: any) => ({ id: s.id, nome: s.nome, tipo: s.tipo }));
  const produtos = (productRows ?? []).map((p: any) => ({ nome: p.nome, preco: p.preco, descricao: p.descricao }));
  const company = (companyRow ?? undefined) as CompanyBrief | undefined;

  const system = buildSystemPrompt(cfg as any, {
    responderEmPartes: cfg.responder_em_partes ?? true,
    produtos,
    stages: stages.map((s: { nome: string; tipo: "normal" | "ganho" | "perda" }) => ({ nome: s.nome, tipo: s.tipo })),
    agendaTools,
    materialsAvailable: materials.length > 0,
    googleConectado: !!googleRow?.conectado,
    company,
    estagioAtual: params.operational?.estagioAtual,
    resumoContato: params.operational?.resumoContato,
  });

  return {
    agent: Object.keys(cfg).length ? cfg : null,
    company,
    produtos,
    stages,
    materials,
    allowedTools,
    agendaTools,
    googleConectado: !!googleRow?.conectado,
    system,
  };
}
