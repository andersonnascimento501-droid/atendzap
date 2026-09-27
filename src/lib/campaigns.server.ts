// Processamento de campanhas (disparo em massa) com claim atômico e bloqueio de empresa suspensa.
// Roda dentro do worker de follow-up (nenhum cron novo) e também pelo endpoint dedicado.

export async function processDueCampaigns(admin: any, maxCampaigns = 10) {
  const nowIso = new Date().toISOString();

  // Promove agendadas cuja hora chegou
  await admin
    .from("campaign")
    .update({ status: "enviando" })
    .eq("status", "agendada")
    .lte("proximo_envio_em", nowIso);

  const { data: due } = await admin
    .from("campaign")
    .select("*")
    .eq("status", "enviando")
    .lte("proximo_envio_em", nowIso)
    .limit(Math.min(25, Math.max(1, maxCampaigns)));

  const { isCompanyOperational } = await import("@/lib/billing-guard.server");

  const processed: any[] = [];

  for (const c of (due ?? []) as any[]) {
    // Empresa suspensa/inadimplente: pausa a campanha, não envia nada.
    if (!(await isCompanyOperational(admin, c.company_id))) {
      await admin.from("campaign").update({ status: "pausada" }).eq("id", c.id);
      processed.push({ id: c.id, skipped: "empresa_suspensa" });
      continue;
    }

    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("instance_name, status, user_id")
      .eq("company_id", c.company_id)
      .maybeSingle();
    if (!inst || inst.status !== "open") {
      processed.push({ id: c.id, skipped: "sem_whatsapp" });
      continue;
    }

    // Claim atômico (FOR UPDATE SKIP LOCKED) → nunca envia 2x o mesmo destino.
    const { data: claimedRows, error: claimErr } = await admin.rpc("campaign_claim_targets", {
      _campaign_id: c.id,
      _limit: 5,
      _worker: `w-${Math.random().toString(36).slice(2, 8)}`,
    });
    if (claimErr) {
      processed.push({ id: c.id, error: claimErr.message });
      continue;
    }

    const targets = (claimedRows ?? []) as any[];
    if (!targets.length) {
      const { data: pendentes } = await admin.rpc("campaign_pending_count", { _campaign_id: c.id });
      if (!pendentes || Number(pendentes) === 0) {
        await admin
          .from("campaign")
          .update({ status: "concluida", concluido_em: new Date().toISOString() })
          .eq("id", c.id);
        processed.push({ id: c.id, done: true });
      } else {
        processed.push({ id: c.id, waiting: Number(pendentes) });
      }
      continue;
    }

    let enviados = 0;
    let falhas = 0;
    const { sendPartOnce } = await import("@/lib/message-pipeline.server");
    const { resolveChannelTarget } = await import("@/lib/channels.server");
    const { campaignEligibility, isStopRequest, isDefinitiveSendFailure } = await import("@/lib/queue-logic");
    const { getCompanyPlan } = await import("@/lib/plan-limits.server");
    const finalize = (id: string, patch: Record<string, any>) =>
      admin.from("campaign_target").update({ locked_at: null, locked_by: null, ...patch }).eq("id", id);

    // Limite do plano: envios de campanha no mês não passam de limite_mensagens.
    let restante = Infinity;
    try {
      const plan: any = await getCompanyPlan(c.company_id);
      const inicioMes = new Date(); inicioMes.setUTCDate(1); inicioMes.setUTCHours(0, 0, 0, 0);
      const { count } = await admin
        .from("campaign_target").select("id", { count: "exact", head: true })
        .eq("company_id", c.company_id).eq("status", "enviado").gte("enviado_em", inicioMes.toISOString());
      restante = Number(plan?.limites?.mensagens ?? 1500) - (count ?? 0);
    } catch (e: any) {
      console.error("[campaign.limit]", e?.message);
      restante = 0; // sem conseguir medir, não envia
    }

    for (const t of targets) {
      if (restante <= 0) {
        await finalize(t.id, { status: "pendente", tentativas: Math.max(0, Number(t.tentativas ?? 1) - 1), erro: "limite do plano atingido" });
        await admin.from("campaign").update({ status: "pausada" }).eq("id", c.id);
        continue;
      }
      try {
        const [{ data: card }, { data: inbound }] = await Promise.all([
          admin.from("crm_cards").select("campanha_consentimento_em, campanha_optout_em")
            .eq("company_id", c.company_id).eq("numero", t.contato_numero).maybeSingle(),
          admin.from("mensagens").select("texto").eq("company_id", c.company_id)
            .eq("numero", t.contato_numero).eq("direcao", "entrada")
            .order("created_at", { ascending: false }).limit(30),
        ]);
        const stop = ((inbound ?? []) as any[]).some((m) => isStopRequest(m.texto));
        const elig = campaignEligibility(card as any, stop);
        if (!elig.ok) { await finalize(t.id, { status: "pulado", erro: elig.motivo }); continue; }

        const target = await resolveChannelTarget(admin, c.company_id, t.contato_numero);
        if (!target.ready) throw new Error("canal desconectado");
        const texto = String(c.mensagem || "").replace(/\{\{nome\}\}/gi, t.contato_nome || "");
        // Chave única por campanha+destinatário: retry nunca reenvia.
        const r = await sendPartOnce(admin, {
          companyId: c.company_id,
          userId: c.created_by ?? inst.user_id ?? c.company_id,
          numero: t.contato_numero,
          contatoNome: t.contato_nome ?? null,
          target,
          jobId: `camp:${c.id}:${t.contato_numero}`,
          index: 0,
          texto,
          autor: "sistema",
        });
        if (r === "uncertain") {
          await finalize(t.id, { status: "incerto", erro: "entrega não confirmada pelo provedor" });
          continue;
        }
        if (r === "skipped") {
          const { data: prev } = await admin.from("mensagens").select("send_status")
            .eq("company_id", c.company_id).eq("response_key", `camp:${c.id}:${t.contato_numero}:0`).maybeSingle();
          const st = (prev as any)?.send_status;
          await finalize(t.id, st === "sent" ? { status: "enviado", enviado_em: new Date().toISOString(), erro: null }
            : { status: "incerto", erro: "tentativa anterior sem confirmação" });
          continue;
        }
        await finalize(t.id, { status: "enviado", enviado_em: new Date().toISOString(), erro: null });
        enviados++; restante--;
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 500);
        const tentativas = Number(t.tentativas ?? 1);
        const definitiva = isDefinitiveSendFailure(e) || tentativas >= 3;
        await finalize(t.id, definitiva ? { status: "falhou", erro: msg } : { status: "pendente", erro: msg });
        if (definitiva) falhas++;
      }
    }

    const minS = Math.max(2, c.intervalo_min_seg ?? 5);
    const maxS = Math.max(minS, c.intervalo_max_seg ?? 20);
    let nextDelaySeg = Math.floor(minS + Math.random() * (maxS - minS + 1));

    const totalEnviados = (c.total_enviados ?? 0) + enviados;
    const pausaApos = c.pausa_apos_envios ?? 50;
    const pausaDurMin = c.pausa_duracao_min ?? 10;
    if (pausaApos > 0 && Math.floor(totalEnviados / pausaApos) > Math.floor((c.total_enviados ?? 0) / pausaApos)) {
      nextDelaySeg = pausaDurMin * 60;
    }

    await admin
      .from("campaign")
      .update({
        total_enviados: totalEnviados,
        total_falhas: (c.total_falhas ?? 0) + falhas,
        proximo_envio_em: new Date(Date.now() + nextDelaySeg * 1000).toISOString(),
      })
      .eq("id", c.id);

    processed.push({ id: c.id, enviados, falhas });
  }

  return { processed };
}
