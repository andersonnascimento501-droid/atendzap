// BLOCO 5 — Envio/estado por canal (server-only).
// O pipeline, o follow-up e as telas passam a falar com estas funções em vez de
// chamarem a Evolution direto. WhatsApp mantém EXATAMENTE o comportamento anterior.

import { channelOf, externalIdOf, type Channel } from "./channels";

export type ChannelTarget = {
  channel: Channel;
  contactId: string; // identidade interna (coluna `numero`)
  externalId: string; // telefone ou IGSID
  instanceName: string | null; // WhatsApp
  token: string | null; // Instagram
  userId: string | null;
  ready: boolean;
  reason?: string;
};

/** Resolve tudo o que é necessário para falar com o contato no canal dele. */
export async function resolveChannelTarget(
  admin: any,
  companyId: string,
  contactId: string,
  hint?: { instanceName?: string | null },
): Promise<ChannelTarget> {
  const channel = channelOf(contactId);
  const externalId = externalIdOf(contactId);

  if (channel === "instagram") {
    const { data: ig } = await admin
      .from("instagram_integration")
      .select("user_id, page_access_token, conectado")
      .eq("company_id", companyId)
      .maybeSingle();
    const token = ((ig as any)?.page_access_token || "").trim();
    return {
      channel,
      contactId,
      externalId,
      instanceName: null,
      token: token || null,
      userId: (ig as any)?.user_id ?? null,
      ready: !!token && !!(ig as any)?.conectado,
      reason: !token ? "instagram desconectado" : !(ig as any)?.conectado ? "instagram desconectado" : undefined,
    };
  }

  let instanceName = hint?.instanceName ?? null;
  let userId: string | null = null;
  let status: string | null = null;
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("user_id, instance_name, status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (inst) {
    instanceName = instanceName || (inst as any).instance_name;
    userId = (inst as any).user_id ?? null;
    status = (inst as any).status ?? null;
  }
  const connected = status === "open" || status === "connected";
  return {
    channel,
    contactId,
    externalId,
    instanceName,
    token: null,
    userId,
    ready: !!instanceName && connected,
    reason: !instanceName ? "whatsapp não conectado" : !connected ? "whatsapp desconectado" : undefined,
  };
}

/** Envio de texto no canal correto. */
export async function sendChannelText(target: ChannelTarget, texto: string) {
  if (target.channel === "instagram") {
    if (!target.token) throw new Error("Instagram não conectado");
    const { igSendText } = await import("./instagram.server");
    await igSendText(target.token, target.externalId, texto);
    return;
  }
  if (!target.instanceName) throw new Error("WhatsApp não conectado");
  const { evoSendText } = await import("./evolution.server");
  await evoSendText(target.instanceName, target.externalId, texto);
}

/** "Digitando…" — best-effort nos dois canais. */
export async function sendChannelTyping(target: ChannelTarget, ms: number) {
  try {
    if (target.channel === "instagram") {
      if (!target.token) return;
      const { igSendTyping } = await import("./instagram.server");
      await igSendTyping(target.token, target.externalId, true);
      return;
    }
    if (!target.instanceName) return;
    const { evoSendPresence } = await import("./evolution.server");
    await evoSendPresence(target.instanceName, target.externalId, "composing", ms);
  } catch {
    // best-effort
  }
}

/** Baixa e devolve base64 da mídia recebida, independente do canal. */
export async function downloadChannelMedia(
  target: ChannelTarget,
  media: any,
): Promise<{ base64: string; mimetype: string | null; fileName: string | null } | null> {
  if (media?.provider === "instagram" || target.channel === "instagram") {
    if (!media?.url) return null;
    const { igDownloadMedia } = await import("./instagram.server");
    const dl = await igDownloadMedia(media.url);
    return dl ? { base64: dl.base64, mimetype: dl.mimetype ?? media.mimetype ?? null, fileName: media.fileName ?? null } : null;
  }
  if (!target.instanceName) return null;
  const { evoGetMediaBase64 } = await import("./evolution.server");
  return evoGetMediaBase64(target.instanceName, { key: media.key, message: media.message });
}
