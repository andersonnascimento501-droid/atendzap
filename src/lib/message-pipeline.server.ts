// BLOCO 4 — Pipeline de PROCESSAMENTO (roda no worker, nunca na request do webhook).
// Todo o comportamento do webhook antigo foi movido para cá sem mudança de regra:
// mídia → contact_pause → horário → buffer/consolidação → Supervisor → agente → tools → Evolution → follow-up.

export type QueueJob = {
  id: string;
  company_id: string;
  numero: string;
  instance_name: string | null;
  credit_consumed: boolean;
  routed_agent_id: string | null;
  run_seq: number;
};

type PendingMsg = {
  id: string;
  texto: string;
  contato_nome: string | null;
  created_at: string;
  media_ref: any;
};

export type PipelineResult = { status: "completed" | "skipped"; reason?: string };

const MAX_PENDING = 20;

/** Mensagens de entrada ainda não processadas pela IA (buffer consolidado). */
async function loadPending(admin: any, companyId: string, numero: string): Promise<PendingMsg[]> {
  const { data } = await admin
    .from("mensagens")
    .select("id, texto, contato_nome, created_at, media_ref")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .eq("direcao", "entrada")
    .is("ai_processed_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_PENDING);
  return (data ?? []) as PendingMsg[];
}

async function markProcessed(admin: any, ids: string[]) {
  if (!ids.length) return;
  await admin.from("mensagens").update({ ai_processed_at: new Date().toISOString() }).in("id", ids);
}

/** Interpreta a mídia guardada pelo webhook (Whisper / Vision / documento) — pesado, por isso roda aqui. */
async function resolveMedia(
  admin: any,
  companyId: string,
  target: any,
  pend: PendingMsg[],
): Promise<{ notice: string | null }> {
  let notice: string | null = null;
  const withMedia = pend.filter((m) => m.media_ref?.kind);
  if (!withMedia.length) return { notice };

  const { data: keyCfg } = await admin
    .from("agent_config")
    .select("openai_api_key")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  const openaiKey = ((keyCfg as any)?.openai_api_key || "").trim();

  const { downloadChannelMedia } = await import("@/lib/channels.server");
  const { transcribeAudio, describeImage, readDocument, isSupportedDocument } = await import("@/lib/media.server");

  for (const m of withMedia) {
    const media = m.media_ref;
    const label =
      media.kind === "audio" ? "[Áudio]" : media.kind === "image" ? "[Imagem]" : `[Documento: ${media.fileName || "arquivo"}]`;
    let texto = m.texto;
    try {
      if (media.kind === "document" && !isSupportedDocument(media.mimetype, media.fileName)) {
        texto = `${label} (formato não suportado: ${media.mimetype})`;
        notice = "Recebi seu arquivo, mas não consigo abrir esse formato por aqui. Pode me enviar em PDF, imagem ou descrever por texto?";
      } else {
        const dl = await downloadChannelMedia(target, media);
        if (!dl?.base64) throw new Error("mídia sem base64");
        const mime = dl.mimetype || media.mimetype;
        if (media.kind === "audio") {
          const t = (await transcribeAudio(dl.base64, mime, openaiKey)).trim();
          if (!t) throw new Error("transcrição vazia");
          texto = `${label} ${t}`;
        } else if (media.kind === "image") {
          const d = (await describeImage(dl.base64, mime, media.caption, openaiKey)).trim();
          if (!d) throw new Error("descrição vazia");
          texto = `${label} ${d}${media.caption ? ` (legenda do cliente: ${media.caption})` : ""}`;
        } else {
          const c = (await readDocument(dl.base64, mime, dl.fileName || media.fileName, media.caption, openaiKey)).trim();
          if (!c) throw new Error("documento sem conteúdo");
          texto = `${label} ${c}`;
        }
      }
    } catch (e: any) {
      console.error("[media]", media.kind, e?.message);
      texto = `${label} (não foi possível interpretar o conteúdo)`;
      notice =
        media.kind === "audio"
          ? "Não consegui ouvir seu áudio agora. Pode me mandar por escrito, por favor?"
          : media.kind === "image"
          ? "Não consegui abrir sua imagem agora. Pode reenviar ou me descrever por texto?"
          : "Não consegui ler esse arquivo agora. Pode reenviar em PDF ou me contar o conteúdo por texto?";
    }
    m.texto = texto;
    // media_ref é limpo para que um retry não reprocesse (e não gaste) a mídia de novo.
    await admin.from("mensagens").update({ texto, media_ref: null }).eq("id", m.id);
    m.media_ref = null;
  }
  return { notice };
}


/** Envio idempotente: response_key = job + índice da parte. Só grava depois do envio confirmado. */
async function sendPartOnce(
  admin: any,
  args: {
    companyId: string;
    userId: string;
    numero: string;
    contatoNome: string | null;
    instanceName: string;
    jobId: string;
    index: number;
    texto: string;
    autor?: string;
  },
) {
  const responseKey = `${args.jobId}:${args.index}`;
  const { data: already } = await admin
    .from("mensagens")
    .select("id")
    .eq("company_id", args.companyId)
    .eq("response_key", responseKey)
    .maybeSingle();
  if (already) return; // retry: essa parte já foi enviada

  const { evoSendText } = await import("@/lib/evolution.server");
  await evoSendText(args.instanceName, args.numero, args.texto);
  await admin.from("mensagens").insert({
    company_id: args.companyId,
    user_id: args.userId,
    numero: args.numero,
    contato_nome: args.contatoNome,
    direcao: "saida",
    autor: args.autor ?? "ia",
    texto: args.texto,
    response_key: responseKey,
    ai_processed_at: new Date().toISOString(),
  });
}

export async function processConversationJob(admin: any, job: QueueJob): Promise<PipelineResult> {
  const companyId = job.company_id;
  const number = job.numero;

  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("company_id, user_id, instance_name")
    .eq("company_id", companyId)
    .maybeSingle();
  const instanceName = (job.instance_name || (inst as any)?.instance_name) as string;
  const userId = (inst as any)?.user_id as string;
  if (!instanceName || !userId) return { status: "skipped", reason: "instance-missing" };

  const pending = await loadPending(admin, companyId, number);
  if (!pending.length) return { status: "skipped", reason: "nothing-pending" };

  const pushName = pending[pending.length - 1]?.contato_nome ?? undefined;
  const ids = pending.map((m) => m.id);

  // ---- agentes / etapas / produtos
  const { fetchActiveAgents, pickDefaultAgent } = await import("@/lib/agents");
  const activeAgents = await fetchActiveAgents(admin, companyId);
  let cfg: any = pickDefaultAgent(activeAgents);
  if (!cfg) {
    const { data: legacyCfg } = await admin
      .from("agent_config")
      .select("*")
      .eq("company_id", companyId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    cfg = legacyCfg;
  }

  const [{ data: stagesRows }, { data: produtosRows }] = await Promise.all([
    admin.from("crm_stage").select("id, nome, tipo, ordem").eq("company_id", companyId).order("ordem", { ascending: true }),
    admin
      .from("produto")
      .select("nome, preco, descricao, ativo, ordem")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
  ]);
  const stages = (stagesRows ?? []) as Array<{ id: string; nome: string; tipo: "normal" | "ganho" | "perda" }>;
  const produtos = (produtosRows ?? []).map((p: any) => ({ nome: p.nome, preco: p.preco, descricao: p.descricao }));

  // ---- Human takeover: nada de IA, nada de crédito.
  const { data: pauseRow } = await admin
    .from("contact_pause")
    .select("pausado")
    .eq("company_id", companyId)
    .eq("numero", number)
    .maybeSingle();
  if (pauseRow?.pausado) {
    await resolveMediaSafe(admin, companyId, instanceName, pending);
    await markProcessed(admin, ids);
    await upsertCard(admin, companyId, userId, number, pushName, pending[pending.length - 1]!.texto, stages);
    return { status: "skipped", reason: "paused-contact" };
  }

  // ---- mídia (pesado, aqui no worker)
  const { notice: mediaFailureNotice } = await resolveMedia(admin, companyId, instanceName, pending);
  const text = pending
    .map((m) => (m.texto || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!text) {
    await markProcessed(admin, ids);
    return { status: "skipped", reason: "empty" };
  }
  const lastText = pending[pending.length - 1]!.texto;

  // ---- Horário de atendimento
  try {
    const { isWithinBusinessHours } = await import("@/lib/business-hours");
    const horarios = (cfg as any)?.horarios_atendimento;
    if (horarios?.enabled && !isWithinBusinessHours(horarios)) {
      const msgFora =
        ((cfg as any)?.mensagem_fora_horario as string) ||
        "No momento estamos fora do horário de atendimento. Retornamos em breve.";
      const { data: ultimaSaida } = await admin
        .from("mensagens")
        .select("texto, created_at")
        .eq("company_id", companyId)
        .eq("numero", number)
        .eq("direcao", "saida")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ultimaFoiFora =
        ultimaSaida && ultimaSaida.texto === msgFora && Date.now() - new Date(ultimaSaida.created_at).getTime() < 6 * 60 * 60_000;
      if (!ultimaFoiFora) {
        await sendPartOnce(admin, {
          companyId, userId, numero: number, contatoNome: pushName ?? null,
          instanceName, jobId: job.id, index: 0, texto: msgFora,
        });
      }
      await markProcessed(admin, ids);
      await upsertCard(admin, companyId, userId, number, pushName, lastText, stages);
      return { status: "completed", reason: "off-hours" };
    }
  } catch (e: any) {
    console.error("[business-hours]", e?.message);
  }

  // ---- mídia ilegível: resposta curta, sem IA
  if (mediaFailureNotice) {
    await sendPartOnce(admin, {
      companyId, userId, numero: number, contatoNome: pushName ?? null,
      instanceName, jobId: job.id, index: 0, texto: mediaFailureNotice,
    });
    await markProcessed(admin, ids);
    await upsertCard(admin, companyId, userId, number, pushName, lastText, stages);
    return { status: "completed", reason: "media-unreadable" };
  }

  // ---- atendente humano ativo agora
  const { data: humanRecent } = await admin
    .from("mensagens")
    .select("id")
    .eq("company_id", companyId)
    .eq("numero", number)
    .eq("direcao", "saida")
    .eq("autor", "humano")
    .gte("created_at", new Date(Date.now() - 90_000).toISOString())
    .limit(1);
  if (humanRecent && humanRecent.length > 0) {
    await markProcessed(admin, ids);
    await upsertCard(admin, companyId, userId, number, pushName, lastText, stages);
    return { status: "skipped", reason: "human-active" };
  }

  // ---- histórico / card
  const { data: histDesc } = await admin
    .from("mensagens")
    .select("autor,direcao,texto,created_at")
    .eq("company_id", companyId)
    .eq("numero", number)
    .order("created_at", { ascending: false })
    .limit(25);
  const historico = (histDesc ?? []).slice().reverse();

  const { data: cardRow } = await admin
    .from("crm_cards")
    .select("status, nome, stage_id, custom_data")
    .eq("company_id", companyId)
    .eq("numero", number)
    .maybeSingle();
  const estagioAtual = cardRow?.status || stages[0]?.nome || "Conversas";
  const resumoContato = `${cardRow?.nome || pushName || "Contato"} (${number}), ${historico.length} mensagens trocadas`;

  const { data: googleIntegration } = await admin
    .from("google_integration")
    .select("conectado")
    .eq("company_id", companyId)
    .maybeSingle();

  // ---- Supervisor / multiagente (Bloco 1 preservado). Em retry, reaproveita o agente já decidido.
  const alreadyRouted = job.routed_agent_id ? activeAgents.find((a: any) => a.id === job.routed_agent_id) : null;
  if (alreadyRouted) {
    cfg = alreadyRouted;
  } else if (activeAgents.length > 1) {
    try {
      const { routeToAgent } = await import("@/lib/supervisor.server");
      const decision = await routeToAgent(admin, {
        companyId,
        numero: number,
        text,
        agents: activeAgents,
        historico: historico.map((m: any) => ({ direcao: m.direcao, texto: m.texto })),
      });
      if (decision) {
        cfg = decision.agent;
        console.info("[router]", companyId, number, decision.agent.slug, decision.intent, decision.confidence, decision.supervised ? "supervisor" : "direto");
      }
    } catch (e: any) {
      console.error("[router]", e?.message);
    }
  } else if (activeAgents.length === 1 && cfg?.id) {
    try {
      const { persistConversationState } = await import("@/lib/supervisor.server");
      await persistConversationState(admin, companyId, number, {
        agentId: cfg.id, intent: null, confidence: 1, reason: "único agente ativo",
      });
    } catch {}
  }
  if (cfg?.id && cfg.id !== job.routed_agent_id) {
    await admin.from("message_processing_queue").update({ routed_agent_id: cfg.id }).eq("id", job.id);
  }

  const { buildSystemPrompt, parseAiOutput } = await import("@/lib/ai-prompt");
  const responderEmPartes = cfg?.responder_em_partes ?? true;
  const system = buildSystemPrompt(cfg ?? {}, {
    responderEmPartes,
    estagioAtual,
    resumoContato,
    produtos,
    stages: stages.map((s) => ({ nome: s.nome, tipo: s.tipo })),
    googleConectado: !!googleIntegration?.conectado,
  });

  // ---- Tools (Bloco 2 preservado)
  const { normalizeToolList, loadCustomFields, buildToolsPromptBlock, DEFAULT_ALLOWED_TOOLS } = await import(
    "@/lib/agent-tools.server"
  );
  const allowedTools = cfg?.id ? normalizeToolList(cfg?.allowed_tools ?? DEFAULT_ALLOWED_TOOLS) : [];
  const customFields = cfg?.id ? await loadCustomFields(admin, companyId, cfg.id) : [];
  const toolCtx = {
    companyId,
    userId,
    agentId: (cfg?.id as string) ?? null,
    agentNome: cfg?.nome_agente,
    numero: number,
    contatoNome: pushName ?? null,
    allowedTools,
    fields: customFields,
  };
  const toolsPrompt = buildToolsPromptBlock(toolCtx as any, (cardRow as any)?.custom_data ?? null);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: system },
    ...(toolsPrompt ? [{ role: "system" as const, content: toolsPrompt }] : []),
    ...historico.map((m: any) => ({
      role: (m.direcao === "entrada" ? "user" : "assistant") as "user" | "assistant",
      content: m.texto,
    })),
  ];
  if (!messages.length || messages[messages.length - 1]!.role !== "user") {
    messages.push({ role: "user", content: text });
  }

  // ---- Créditos: 1 por interação, nunca 2 por causa de retry.
  const { getCompanyPlan } = await import("@/lib/plan-limits.server");
  const { allowsProvider } = await import("@/lib/plan-features");
  if (!job.credit_consumed) {
    const { data: hasCredit } = await admin.rpc("consume_ai_credit", { _company_id: companyId, _ref: number });
    if (!hasCredit) {
      await markProcessed(admin, ids);
      await upsertCard(admin, companyId, userId, number, pushName, lastText, stages);
      console.warn("[credits] créditos esgotados — IA não respondeu", companyId);
      return { status: "skipped", reason: "no_credits" };
    }
    await admin.from("message_processing_queue").update({ credit_consumed: true }).eq("id", job.id);
    job.credit_consumed = true;
  }

  const throttleReason = await getAiThrottleReason(admin, companyId, number);
  if (throttleReason) {
    await markProcessed(admin, ids);
    await upsertCard(admin, companyId, userId, number, pushName, lastText, stages);
    console.warn("[whatsapp.safety] resposta pausada", throttleReason, companyId, number);
    return { status: "skipped", reason: throttleReason };
  }

  const plan = await getCompanyPlan(companyId);
  let providerChoice = ((cfg as any)?.ai_provider || "gemini") as string;
  let modelChoice = ((cfg as any)?.ai_model || "google/gemini-2.5-flash") as string;
  if (!allowsProvider(plan.slug, providerChoice)) {
    providerChoice = "gemini";
    modelChoice = "google/gemini-2.5-flash";
  }

  const aiConfig = {
    provider: providerChoice,
    model: modelChoice,
    openaiKey: (cfg as any)?.openai_api_key || "",
    anthropicKey: (cfg as any)?.anthropic_api_key || "",
  };
  const { lovableAiChat } = await import("@/lib/lovable-ai.server");
  let rawReply = "";
  if (allowedTools.length) {
    const { runAgentTurn } = await import("@/lib/agent-runtime.server");
    const turn = await runAgentTurn(admin, {
      messages,
      aiConfig,
      ctx: toolCtx as any,
      stageNames: stages.map((s) => s.nome),
    });
    rawReply = turn.text;
  } else {
    rawReply = await lovableAiChat(messages, aiConfig);
  }
  if (!rawReply.trim()) rawReply = await lovableAiChat(messages, aiConfig); // uma tentativa simples; falha => retry do job

  const { parts, stage, agendar } = parseAiOutput(rawReply, stages.map((s) => ({ nome: s.nome, tipo: s.tipo })));
  const finalParts = sanitizeAiParts(responderEmPartes ? parts : [parts.join(" ")]);

  if (agendar && googleIntegration?.conectado) {
    try {
      const { createCalendarEventForCompany } = await import("@/lib/google.server");
      await createCalendarEventForCompany(admin, companyId, {
        titulo: agendar.titulo,
        inicio: agendar.inicio,
        fim: agendar.fim,
        descricao: `Agendado via WhatsApp — ${pushName || number}`,
      });
    } catch (e: any) {
      console.error("[agendar]", e?.message);
    }
  }

  const { evoSendPresence } = await import("@/lib/evolution.server");
  for (let i = 0; i < finalParts.length; i++) {
    const part = finalParts[i];
    if (!part) continue;
    const typingMs = Math.min(3000, 1200 + Math.floor(part.length * 35));
    await evoSendPresence(instanceName, number, "composing", typingMs);
    await new Promise((r) => setTimeout(r, typingMs));
    await sendPartOnce(admin, {
      companyId, userId, numero: number, contatoNome: pushName ?? null,
      instanceName, jobId: job.id, index: i, texto: part,
    });
    if (i < finalParts.length - 1) await new Promise((r) => setTimeout(r, 700 + Math.floor(Math.random() * 800)));
  }

  await markProcessed(admin, ids);
  await upsertCard(admin, companyId, userId, number, pushName, finalParts[finalParts.length - 1] || lastText, stages, stage);

  // BLOCO 3 — follow-up só DEPOIS da resposta efetivamente enviada.
  try {
    const { scheduleFollowup } = await import("@/lib/followup.server");
    await scheduleFollowup(admin, { companyId, numero: number, agentId: (cfg?.id as string) ?? null });
  } catch (e: any) {
    console.error("[followup.schedule]", e?.message);
  }

  return { status: "completed" };
}

async function resolveMediaSafe(admin: any, companyId: string, instanceName: string, pending: PendingMsg[]) {
  try {
    await admin
      .from("mensagens")
      .update({ media_ref: null })
      .in("id", pending.filter((m) => m.media_ref?.kind).map((m) => m.id));
  } catch {}
}

export function sanitizeAiParts(parts: string[]) {
  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((part) => (part.length > 700 ? `${part.slice(0, 697).trim()}...` : part))
    .slice(0, 2);
}

export async function getAiThrottleReason(admin: any, companyId: string, numero: string): Promise<string | null> {
  const now = Date.now();
  const [contactRecent, companyRecent] = await Promise.all([
    admin
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("numero", numero)
      .eq("direcao", "saida")
      .eq("autor", "ia")
      .gte("created_at", new Date(now - 10 * 60_000).toISOString()),
    admin
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("direcao", "saida")
      .eq("autor", "ia")
      .gte("created_at", new Date(now - 60_000).toISOString()),
  ]);
  if ((contactRecent.count ?? 0) >= 6) return "contact-rate-limit";
  if ((companyRecent.count ?? 0) >= 20) return "company-rate-limit";
  return null;
}

export async function upsertCard(
  admin: any,
  companyId: string,
  userId: string,
  numero: string,
  nome: string | undefined,
  ultimaMensagem: string,
  stages: Array<{ id: string; nome: string; tipo: "normal" | "ganho" | "perda" }>,
  proposedStageName?: string | null,
) {
  const { data: existing } = await admin
    .from("crm_cards")
    .select("status, nome, stage_id")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .maybeSingle();

  const stageByName = new Map(stages.map((s) => [s.nome.toLowerCase(), s]));
  const stageById = new Map(stages.map((s) => [s.id, s]));

  const currentStage = existing?.stage_id ? stageById.get(existing.stage_id) : undefined;
  const currentTipo =
    currentStage?.tipo ?? (existing?.status ? stageByName.get(String(existing.status).toLowerCase())?.tipo : undefined);
  const isLocked = currentTipo === "ganho" || currentTipo === "perda";
  const proposed = proposedStageName ? stageByName.get(proposedStageName.toLowerCase()) : undefined;

  let finalStage = currentStage;
  if (proposed && !isLocked) finalStage = proposed;
  if (!finalStage) finalStage = stages[0];

  const payload: any = {
    company_id: companyId,
    user_id: userId,
    numero,
    nome: existing?.nome || nome || null,
    ultima_mensagem: (ultimaMensagem || "").slice(0, 240),
    ultima_em: new Date().toISOString(),
  };
  if (finalStage) {
    payload.stage_id = finalStage.id;
    payload.status = finalStage.nome;
  } else if (existing?.status) {
    payload.status = existing.status;
  } else {
    payload.status = "Conversas";
  }
  await admin.from("crm_cards").upsert(payload, { onConflict: "company_id,numero" });
}
