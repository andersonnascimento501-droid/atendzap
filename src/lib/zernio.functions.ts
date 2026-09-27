import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest } from "@tanstack/react-start/server";

// Instagram via Zernio — cada empresa usa a PRÓPRIA chave da Zernio.
// A empresa sempre vem da sessão (nunca do navegador). A chave é validada na Zernio,
// criptografada (AES-256-GCM) e guardada numa tabela que só o servidor lê.
// Nenhuma resposta devolve chave, segredo do webhook, profileId salvo ou accountId.

async function resolveCompany(supabase: any, userId: string): Promise<{ companyId: string; role: string }> {
  const { data, error } = await supabase
    .from("company_user")
    .select("company_id, role")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível identificar sua empresa.");
  if (!data) throw new Error("Você ainda não possui uma empresa. Finalize o onboarding.");
  return { companyId: data.company_id as string, role: String(data.role) };
}

async function requireManager(supabase: any, userId: string) {
  const c = await resolveCompany(supabase, userId);
  if (c.role !== "owner" && c.role !== "admin") throw new Error("Somente o responsável ou um administrador pode alterar esta conexão.");
  return c.companyId;
}

function origins() {
  const req = getRequest();
  const url = new URL(req.url);
  const m = url.host.match(/^id-preview--([0-9a-fA-F-]{36})\./);
  const stable = m ? `project--${m[1]}-dev.lovable.app` : url.host;
  return { app: `${url.protocol}//${url.host}`, stable: `${url.protocol}//${stable}` };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function loadRow(companyId: string) {
  const a = await admin();
  const { data } = await a.from("instagram_zernio").select("*").eq("company_id", companyId).maybeSingle();
  return { a, row: data as any };
}

async function keyOf(row: any): Promise<string> {
  const { decryptSecret } = await import("./secret-box.server");
  const k = await decryptSecret(row?.api_key_enc);
  if (!k) throw new Error("Chave da Zernio não configurada. Cole e valide sua chave.");
  return k;
}

function friendly(e: any, fallback: string): Error {
  const { isAuthError } = { isAuthError: (x: any) => x?.zernioStatus === 401 || x?.zernioStatus === 403 };
  if (isAuthError(e)) return new Error("A Zernio recusou a chave. Confira se ela está ativa e tente novamente.");
  const msg = String(e?.message || "");
  if (/Criptografia do servidor/.test(msg)) return new Error(msg);
  return new Error(msg.startsWith("Zernio") ? `${fallback} (${msg})` : fallback);
}

function publicStatus(row: any, ig: any) {
  return {
    provider: (ig?.instagram_provider as "meta" | "zernio") ?? "meta",
    metaConectado: ig?.instagram_provider !== "zernio" && !!ig?.conectado,
    keyConfigured: !!row?.api_key_enc,
    profileSelected: !!row?.profile_id,
    profileName: row?.profile_name ?? null,
    status: (row?.status as string) ?? "desconectado",
    username: row?.account_username ?? null,
    displayName: row?.account_display_name ?? null,
    verificadoEm: row?.verificado_em ?? null,
    ultimoErro: row?.ultimo_erro ?? null,
  };
}

export const getZernioStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { companyId } = await resolveCompany(context.supabase, context.userId);
    const { a, row } = await loadRow(companyId);
    const { data: ig } = await a
      .from("instagram_integration")
      .select("instagram_provider, conectado")
      .eq("company_id", companyId)
      .maybeSingle();
    return publicStatus(row, ig);
  });

export const zernioSaveKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { apiKey: string }) => {
    const apiKey = String(d?.apiKey ?? "").trim();
    if (apiKey.length < 16 || apiKey.length > 512 || /\s/.test(apiKey)) throw new Error("Cole uma chave de API válida da Zernio.");
    return { apiKey };
  })
  .handler(async ({ context, data }) => {
    const companyId = await requireManager(context.supabase, context.userId);
    const { encryptSecret } = await import("./secret-box.server");
    // Falha cedo se a criptografia do servidor não estiver configurada (nada é salvo).
    await encryptSecret("probe");
    const { zernioListProfiles, zernioDeleteWebhook } = await import("./zernio.server");
    let profiles;
    try {
      profiles = await zernioListProfiles(data.apiKey);
    } catch (e: any) {
      throw friendly(e, "Não foi possível validar a chave na Zernio");
    }
    const { a, row } = await loadRow(companyId);
    // Chave antiga com webhook: remove o webhook dela (best-effort) antes de trocar.
    if (row?.webhook_id) {
      try {
        const { decryptSecret } = await import("./secret-box.server");
        const old = await decryptSecret(row.api_key_enc);
        if (old && old !== data.apiKey) await zernioDeleteWebhook(old, row.webhook_id);
      } catch {}
    }
    const enc = await encryptSecret(data.apiKey);
    const autoProfile = profiles.length === 1 ? profiles[0]! : null;
    const { error } = await a.from("instagram_zernio").upsert(
      {
        company_id: companyId,
        api_key_enc: enc,
        profile_id: autoProfile?.id ?? null,
        profile_name: autoProfile?.name ?? null,
        account_id: null,
        account_username: null,
        account_display_name: null,
        webhook_id: null,
        webhook_token: null,
        webhook_secret_enc: null,
        status: "desconectado",
        ultimo_erro: null,
        verificado_em: new Date().toISOString(),
        connected_by: context.userId,
      },
      { onConflict: "company_id" },
    );
    if (error) throw new Error("Não foi possível salvar a chave.");
    // Se a Zernio era o provedor ativo, a conexão anterior deixa de valer.
    await a.from("instagram_integration").update({ conectado: false }).eq("company_id", companyId).eq("instagram_provider", "zernio");
    return { ok: true, profiles: profiles.map((p) => ({ id: p.id, name: p.name })), autoSelected: !!autoProfile };
  });

export const zernioListProfilesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await requireManager(context.supabase, context.userId);
    const { row } = await loadRow(companyId);
    const key = await keyOf(row);
    const { zernioListProfiles } = await import("./zernio.server");
    try {
      const list = await zernioListProfiles(key);
      return { profiles: list, selectedName: row?.profile_name ?? null };
    } catch (e: any) {
      throw friendly(e, "Não foi possível listar os perfis da Zernio");
    }
  });

export const zernioCreateProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await requireManager(context.supabase, context.userId);
    const { a, row } = await loadRow(companyId);
    const key = await keyOf(row);
    const { data: company } = await a.from("company").select("nome, nome_fantasia").eq("id", companyId).maybeSingle();
    const name = String((company as any)?.nome_fantasia || (company as any)?.nome || "Minha empresa").trim();
    const { zernioCreateProfile } = await import("./zernio.server");
    let p;
    try {
      p = await zernioCreateProfile(key, name, `atendai-profile-${companyId}`);
    } catch (e: any) {
      throw friendly(e, "Não foi possível criar o perfil na Zernio");
    }
    await a.from("instagram_zernio").update({ profile_id: p.id, profile_name: p.name }).eq("company_id", companyId);
    return { ok: true, name: p.name };
  });

export const zernioSelectProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { profileId: string }) => {
    const profileId = String(d?.profileId ?? "").trim();
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(profileId)) throw new Error("Perfil inválido.");
    return { profileId };
  })
  .handler(async ({ context, data }) => {
    const companyId = await requireManager(context.supabase, context.userId);
    const { a, row } = await loadRow(companyId);
    const key = await keyOf(row);
    const { zernioListProfiles } = await import("./zernio.server");
    const list = await zernioListProfiles(key).catch((e) => {
      throw friendly(e, "Não foi possível validar o perfil");
    });
    // Nunca confia no id do navegador: precisa pertencer à chave desta empresa.
    const hit = list.find((p) => p.id === data.profileId);
    if (!hit) throw new Error("Este perfil não pertence à sua conta da Zernio.");
    await a
      .from("instagram_zernio")
      .update({ profile_id: hit.id, profile_name: hit.name, account_id: null, status: "desconectado" })
      .eq("company_id", companyId);
    return { ok: true, name: hit.name };
  });

export const zernioStartConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirmSwitch?: boolean }) => ({ confirmSwitch: !!d?.confirmSwitch }))
  .handler(async ({ context, data }) => {
    const companyId = await requireManager(context.supabase, context.userId);
    const { a, row } = await loadRow(companyId);
    const key = await keyOf(row);
    if (!row?.profile_id) throw new Error("Escolha o perfil da empresa na Zernio antes de conectar.");
    const { data: ig } = await a
      .from("instagram_integration")
      .select("instagram_provider, conectado")
      .eq("company_id", companyId)
      .maybeSingle();
    if ((ig as any)?.instagram_provider !== "zernio" && (ig as any)?.conectado && !data.confirmSwitch) {
      return { needsConfirm: true as const, authUrl: null };
    }
    const { zernioGetConnectUrl } = await import("./zernio.server");
    const redirect = `${origins().app}/app/conexao?zernio=retorno`;
    let authUrl: string;
    try {
      authUrl = await zernioGetConnectUrl(key, row.profile_id, redirect);
    } catch (e: any) {
      throw friendly(e, "Não foi possível abrir a autorização do Instagram");
    }
    await a.from("instagram_zernio").update({ status: row.status === "conectado" ? "conectado" : "aguardando" }).eq("company_id", companyId);
    return { needsConfirm: false as const, authUrl };
  });

export const zernioConfirmConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId?: string | null; confirmSwitch?: boolean }) => ({
    accountId: d?.accountId ? String(d.accountId).slice(0, 64) : null,
    confirmSwitch: !!d?.confirmSwitch,
  }))
  .handler(async ({ context, data }) => {
    const companyId = await requireManager(context.supabase, context.userId);
    const { a, row } = await loadRow(companyId);
    const key = await keyOf(row);
    if (!row?.profile_id) throw new Error("Escolha o perfil da empresa na Zernio antes de conectar.");
    const { zernioListInstagramAccounts, zernioCreateWebhook, zernioDeleteWebhook } = await import("./zernio.server");
    // O retorno do navegador é só uma dica: confirma na Zernio com a chave desta empresa.
    const accounts = await zernioListInstagramAccounts(key, row.profile_id).catch((e) => {
      throw friendly(e, "Não foi possível confirmar a conta na Zernio");
    });
    const acc = data.accountId ? accounts.find((x) => x.id === data.accountId) : accounts.length === 1 ? accounts[0] : null;
    if (!acc) {
      throw new Error(
        accounts.length
          ? "Não conseguimos confirmar qual conta do Instagram foi autorizada. Tente conectar novamente."
          : "Nenhuma conta do Instagram foi encontrada neste perfil da Zernio. Autorize o Instagram e tente de novo.",
      );
    }
    const { data: other } = await a
      .from("instagram_zernio")
      .select("company_id")
      .eq("account_id", acc.id)
      .neq("company_id", companyId)
      .maybeSingle();
    if (other) throw new Error("Esta conta do Instagram já está conectada em outra empresa.");

    // Webhook exclusivo e imprevisível, com segredo forte criptografado.
    const { randomToken, encryptSecret } = await import("./secret-box.server");
    const { ZERNIO_WEBHOOK_EVENTS } = await import("./zernio-logic");
    if (row.webhook_id) {
      try {
        await zernioDeleteWebhook(key, row.webhook_id);
      } catch {}
    }
    const webhookToken = randomToken(32);
    const secret = randomToken(32);
    const secretEnc = await encryptSecret(secret);
    let webhookId: string;
    try {
      webhookId = await zernioCreateWebhook(key, {
        name: "AtendAi Instagram",
        url: `${origins().stable}/api/public/zernio-webhook/${webhookToken}`,
        secret,
        events: ZERNIO_WEBHOOK_EVENTS,
      });
    } catch (e: any) {
      throw friendly(e, "Não foi possível ativar o recebimento de mensagens na Zernio");
    }
    const { error } = await a
      .from("instagram_zernio")
      .update({
        account_id: acc.id,
        account_username: acc.username,
        account_display_name: acc.displayName,
        webhook_id: webhookId,
        webhook_token: webhookToken,
        webhook_secret_enc: secretEnc,
        status: "conectado",
        ultimo_erro: null,
        verificado_em: new Date().toISOString(),
        connected_by: context.userId,
      })
      .eq("company_id", companyId);
    if (error) {
      try {
        await zernioDeleteWebhook(key, webhookId);
      } catch {}
      throw new Error(/unique|duplicate/i.test(error.message) ? "Esta conta do Instagram já está conectada em outra empresa." : "Não foi possível salvar a conexão.");
    }
    // Troca o provedor ativo (tokens da Meta são preservados).
    const { error: igErr } = await a.from("instagram_integration").upsert(
      { company_id: companyId, user_id: context.userId, instagram_provider: "zernio", conectado: true, username: acc.username },
      { onConflict: "company_id" },
    );
    if (igErr) throw new Error("Não foi possível ativar o provedor Zernio.");
    return { ok: true, username: acc.username, displayName: acc.displayName };
  });

export const zernioVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { companyId } = await resolveCompany(context.supabase, context.userId);
    const { a, row } = await loadRow(companyId);
    if (!row?.account_id) return { ok: false, status: "desconectado" };
    const { zernioAccountHealth } = await import("./zernio.server");
    let ok = false;
    let erro: string | null = null;
    try {
      const key = await keyOf(row);
      const h = await zernioAccountHealth(key, row.account_id);
      ok = h.ok;
      if (!ok) erro = "A conta precisa ser reconectada na Zernio.";
    } catch (e: any) {
      erro = friendly(e, "Não foi possível verificar a conexão").message;
    }
    const status = ok ? "conectado" : "reconectar";
    await a
      .from("instagram_zernio")
      .update({ status, ultimo_erro: erro, verificado_em: new Date().toISOString() })
      .eq("company_id", companyId);
    return { ok, status };
  });

async function doDisconnect(companyId: string, removeKey: boolean) {
  const { a, row } = await loadRow(companyId);
  if (!row) return;
  if (row.webhook_id) {
    try {
      const key = await keyOf(row);
      const { zernioDeleteWebhook } = await import("./zernio.server");
      await zernioDeleteWebhook(key, row.webhook_id);
    } catch {}
  }
  const patch: Record<string, any> = {
    account_id: null,
    account_username: null,
    account_display_name: null,
    webhook_id: null,
    webhook_token: null,
    webhook_secret_enc: null,
    status: "desconectado",
    ultimo_erro: null,
  };
  if (removeKey) Object.assign(patch, { api_key_enc: null, profile_id: null, profile_name: null });
  const { error } = await a.from("instagram_zernio").update(patch).eq("company_id", companyId);
  if (error) throw new Error("Não foi possível desconectar.");
  // Mensagens, contatos e cards são preservados; só bloqueia novos envios.
  await a.from("instagram_integration").update({ conectado: false }).eq("company_id", companyId).eq("instagram_provider", "zernio");
}

export const zernioDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await requireManager(context.supabase, context.userId);
    await doDisconnect(companyId, false);
    return { ok: true };
  });

export const zernioRemoveKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await requireManager(context.supabase, context.userId);
    await doDisconnect(companyId, true);
    return { ok: true };
  });
