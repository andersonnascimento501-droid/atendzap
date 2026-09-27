// Regras puras da integração Zernio (sem rede/banco) — testáveis isoladamente.

export const ZERNIO_API_BASE = "https://zernio.com/api";
export const ZERNIO_API_HOST = "zernio.com";
export const ZERNIO_DASHBOARD_URL = "https://zernio.com/dashboard";

/** Eventos assinados no webhook (somente o necessário ao atendimento). */
export const ZERNIO_WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "account.connected",
  "account.disconnected",
] as const;

export const ZERNIO_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/** Comparação em tempo constante de strings hex/ascii. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  return Array.from(sig, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** X-Zernio-Signature = hex(HMAC-SHA256(corpo bruto, segredo)). Sem segredo/assinatura → inválido. */
export async function verifyZernioSignature(
  secret: string | null | undefined,
  rawBody: string,
  header: string | null | undefined,
): Promise<boolean> {
  const provided = String(header ?? "").trim().toLowerCase();
  if (!secret || !provided) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqual(provided, expected);
}

/** Id de deduplicação namespaceado para mensagens vindas da Zernio. */
export function zernioMessageKey(accountId: string, messageId: string): string {
  return `zernio:${accountId}:${messageId}`;
}

export type ZernioInbound = {
  accountId: string;
  profileId: string | null;
  platform: string;
  messageId: string;
  platformMessageId: string | null;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  text: string;
  sentAt: string | null;
  attachment: { kind: "image" | "audio" | "document"; url: string; mimetype: string } | null;
};

export function eventAccount(payload: any): { accountId: string; platform: string; profileId: string | null } {
  const acc = payload?.account ?? {};
  return {
    accountId: String(acc.accountId || acc.id || "").trim(),
    platform: String(acc.platform || payload?.message?.platform || "").toLowerCase(),
    profileId: acc.profileId ? String(acc.profileId) : null,
  };
}

/** Mesmo mapeamento de mídia já usado no webhook oficial da Meta. */
export function mapZernioAttachment(att: any): ZernioInbound["attachment"] {
  const url = typeof att?.url === "string" ? att.url : "";
  if (!url) return null;
  const type = String(att?.type || "").toLowerCase();
  const orig = String(att?.originalType || "").toLowerCase();
  const kind =
    type === "audio"
      ? "audio"
      : type === "image" || (type === "share" && orig !== "story_mention") || orig === "story_mention"
        ? "image"
        : type === "video" || type === "file"
          ? "document"
          : null;
  if (!kind) return null;
  const mimetype =
    (typeof att?.mimeType === "string" && att.mimeType) ||
    (kind === "audio" ? "audio/mp4" : kind === "image" ? "image/jpeg" : "application/octet-stream");
  return { kind, url, mimetype };
}

/** Normaliza `message.received`. Retorna null para o que não deve virar mensagem de entrada. */
export function parseZernioInbound(payload: any): ZernioInbound | null {
  if (payload?.event !== "message.received") return null;
  const m = payload?.message ?? {};
  if (String(m.direction || "") !== "incoming") return null; // eco do nosso próprio envio
  const { accountId, platform, profileId } = eventAccount(payload);
  if (!accountId || (platform || m.platform) !== "instagram") return null;
  const messageId = String(m.id || "").trim();
  const conversationId = String(m.conversationId || payload?.conversation?.id || "").trim();
  const senderId = String(
    m.sender?.id || payload?.conversation?.participantId || payload?.conversation?.platformConversationId || "",
  ).trim();
  if (!messageId || !conversationId || !senderId) return null;
  const atts = Array.isArray(m.attachments) ? m.attachments : [];
  const attachment = atts.length ? mapZernioAttachment(atts[0]) : null;
  const text = typeof m.text === "string" ? m.text : "";
  if (!text.trim() && !attachment) return null;
  return {
    accountId,
    profileId,
    platform: "instagram",
    messageId,
    platformMessageId: m.platformMessageId ? String(m.platformMessageId) : null,
    conversationId,
    senderId,
    senderName: m.sender?.name || m.sender?.username || payload?.conversation?.participantName || null,
    text,
    sentAt: m.sentAt ? String(m.sentAt) : null,
    attachment,
  };
}

/** Host é privado/interno? (bloqueia SSRF em downloads de mídia). */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h === "::") return h.includes(":") || h === "::";
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/** Só https público. Credenciais da Zernio NUNCA vão para esse host. */
export function isSafeMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    return !isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

/** Remove qualquer ocorrência de segredos de uma mensagem antes de logar/exibir. */
export function redact(text: string, secrets: Array<string | null | undefined>): string {
  let out = String(text ?? "");
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[oculto]");
  return out.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [oculto]");
}

/** Status 4xx que significam "com certeza não enviado". 409/422 = em processamento/ambíguo. */
export function zernioDefinitiveStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 409 && status !== 422 && status !== 408;
}
