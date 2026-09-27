// Cliente server-only da API Zernio (Instagram Direct). A chave pertence ao CLIENTE,
// vem descriptografada só em memória e só é enviada para https://zernio.com/api.
// Redirecionamentos são recusados para a credencial nunca sair do host oficial.

import {
  ZERNIO_API_BASE,
  ZERNIO_API_HOST,
  ZERNIO_MEDIA_MAX_BYTES,
  isSafeMediaUrl,
  redact,
  zernioDefinitiveStatus,
} from "./zernio-logic";

type Init = {
  method?: string;
  json?: any;
  query?: Record<string, string | undefined>;
  idempotencyKey?: string | null;
};

export async function zernioFetch<T = any>(apiKey: string, path: string, init: Init = {}): Promise<T> {
  if (!apiKey) throw new Error("Zernio: chave não configurada");
  const url = new URL(`${ZERNIO_API_BASE}${path}`);
  if (url.hostname !== ZERNIO_API_HOST) throw new Error("Zernio: host inválido");
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey.slice(0, 255);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: init.method ?? "GET",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      redirect: "manual",
    });
  } catch (e: any) {
    // Falha de rede: resultado desconhecido → sem providerStatus (vira "incerto" no envio).
    throw new Error(`Zernio indisponível: ${redact(e?.message || "falha de rede", [apiKey])}`);
  }
  if (res.status >= 300 && res.status < 400) {
    throw Object.assign(new Error("Zernio: redirecionamento recusado"), { providerStatus: 400 });
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const raw = data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`;
    const msg = redact(String(raw).slice(0, 300), [apiKey]);
    const err: any = new Error(`Zernio: ${msg}`);
    if (zernioDefinitiveStatus(res.status)) err.providerStatus = res.status;
    err.zernioStatus = res.status;
    throw err;
  }
  return data as T;
}

export function isAuthError(e: any): boolean {
  return e?.zernioStatus === 401 || e?.zernioStatus === 403;
}

export type ZernioProfile = { id: string; name: string };

export async function zernioListProfiles(apiKey: string): Promise<ZernioProfile[]> {
  const r: any = await zernioFetch(apiKey, "/v1/profiles");
  const list: any[] = Array.isArray(r?.profiles) ? r.profiles : [];
  return list
    .map((p) => ({ id: String(p?._id || p?.id || ""), name: String(p?.name || "Perfil") }))
    .filter((p) => p.id);
}

export async function zernioCreateProfile(apiKey: string, name: string, idem: string): Promise<ZernioProfile> {
  const r: any = await zernioFetch(apiKey, "/v1/profiles", {
    method: "POST",
    json: { name: name.slice(0, 80) },
    idempotencyKey: idem,
  });
  const p = r?.profile ?? {};
  const id = String(p?._id || p?.id || "");
  if (!id) throw new Error("Zernio: perfil não criado");
  return { id, name: String(p?.name || name) };
}

export type ZernioAccount = { id: string; username: string | null; displayName: string | null; profileId: string; needsReconnection: boolean; isActive: boolean };

export async function zernioListInstagramAccounts(apiKey: string, profileId: string): Promise<ZernioAccount[]> {
  const r: any = await zernioFetch(apiKey, "/v1/accounts", { query: { profileId, platform: "instagram" } });
  const list: any[] = Array.isArray(r?.accounts) ? r.accounts : [];
  return list
    .map((a) => ({
      id: String(a?._id || a?.id || ""),
      username: a?.username ? String(a.username) : null,
      displayName: a?.displayName ? String(a.displayName) : null,
      profileId: String(typeof a?.profileId === "object" ? a?.profileId?._id || "" : a?.profileId || ""),
      needsReconnection: !!a?.needsReconnection,
      isActive: a?.isActive !== false,
      platform: String(a?.platform || ""),
    }))
    .filter((a) => a.id && a.platform === "instagram" && a.profileId === profileId);
}

export async function zernioGetConnectUrl(apiKey: string, profileId: string, redirectUrl: string): Promise<string> {
  const r: any = await zernioFetch(apiKey, "/v1/connect/instagram", {
    query: { profileId, redirect_url: redirectUrl },
  });
  const url = String(r?.authUrl || "");
  if (!/^https:\/\//.test(url)) throw new Error("Zernio: link de autorização inválido");
  return url;
}

export async function zernioAccountHealth(apiKey: string, accountId: string): Promise<{ ok: boolean; status: string }> {
  const r: any = await zernioFetch(apiKey, `/v1/accounts/${encodeURIComponent(accountId)}/health`);
  const status = String(r?.status || "");
  const tokenValid = r?.tokenStatus?.valid !== false;
  return { ok: status !== "error" && tokenValid, status };
}

export async function zernioCreateWebhook(
  apiKey: string,
  args: { name: string; url: string; secret: string; events: readonly string[] },
): Promise<string> {
  const r: any = await zernioFetch(apiKey, "/v1/webhooks/settings", {
    method: "POST",
    json: { name: args.name.slice(0, 50), url: args.url, secret: args.secret, events: args.events, isActive: true },
  });
  const id = String(r?.webhook?._id || r?.webhook?.id || "");
  if (!id) throw new Error("Zernio: webhook não criado");
  return id;
}

export async function zernioDeleteWebhook(apiKey: string, webhookId: string): Promise<void> {
  await zernioFetch(apiKey, "/v1/webhooks/settings", { method: "DELETE", query: { webhookId } });
}

function normalizeSend(r: any) {
  const id = r?.data?.messageId ?? r?.messageId ?? null;
  return { ...r, message_id: typeof id === "string" ? id : null };
}

export async function zernioSendText(
  apiKey: string,
  accountId: string,
  conversationId: string,
  text: string,
  idempotencyKey?: string | null,
) {
  const r = await zernioFetch(apiKey, `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    json: { accountId, message: text.slice(0, 950) },
    idempotencyKey: idempotencyKey ?? null,
  });
  return normalizeSend(r);
}

export async function zernioSendAttachment(
  apiKey: string,
  accountId: string,
  conversationId: string,
  type: "image" | "video" | "audio" | "file",
  attachmentUrl: string,
  idempotencyKey?: string | null,
) {
  const r = await zernioFetch(apiKey, `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    json: { accountId, attachmentUrl, attachmentType: type },
    idempotencyKey: idempotencyKey ?? null,
  });
  return normalizeSend(r);
}

export async function zernioSendTyping(apiKey: string, accountId: string, conversationId: string) {
  try {
    await zernioFetch(apiKey, `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/typing`, {
      method: "POST",
      json: { accountId },
    });
  } catch {
    // best-effort
  }
}

/**
 * Baixa mídia recebida (link público de CDN do Instagram). NUNCA envia a chave da Zernio;
 * só https público, sem redirecionar para host interno e com limite de tamanho.
 */
export async function zernioDownloadMedia(
  url: string,
): Promise<{ base64: string; mimetype: string | null } | null> {
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    if (!isSafeMediaUrl(current)) return null;
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual" });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > ZERNIO_MEDIA_MAX_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > ZERNIO_MEDIA_MAX_BYTES) return null;
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    const ct = res.headers.get("content-type");
    return { base64: btoa(binary), mimetype: ct ? ct.split(";")[0]!.trim() : null };
  }
  return null;
}
