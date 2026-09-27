import { createFileRoute } from "@tanstack/react-router";
import { igContactId } from "@/lib/channels";
import { ingestInstagramInbound } from "@/lib/instagram-ingest.server";

/**
 * BLOCO 5 — WEBHOOK RÁPIDO DO INSTAGRAM (somente RECEBIMENTO).
 * Mesmo contrato do webhook do WhatsApp: valida → grava mensagem → cancela follow-up
 * → enfileira job → 200. Todo o processamento pesado roda no worker da fila.
 *
 * Identidade da conversa: `ig:<IGSID>` na coluna `numero` (não colide com telefones).
 */
export const Route = createFileRoute("/api/public/instagram-webhook")({
  server: {
    handlers: {
      // Verificação do webhook exigida pela Meta.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token") || "";
        const challenge = url.searchParams.get("hub.challenge") || "";
        if (mode !== "subscribe" || !token)
          return new Response("AtendAI Instagram webhook online", { status: 200 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const envToken = (process.env["META_VERIFY_TOKEN"] || "").trim();
          if (envToken && token === envToken) return new Response(challenge, { status: 200 });
          const { data } = await (supabaseAdmin as any)
            .from("instagram_integration")
            .select("company_id")
            .eq("verify_token", token)
            .maybeSingle();
          if (data) return new Response(challenge, { status: 200 });
        } catch (e: any) {
          console.error("[instagram-webhook.verify]", e?.message);
        }
        return new Response("invalid verify token", { status: 403 });
      },

      POST: async ({ request }) => {
        const t0 = Date.now();
        try {
          const raw = await request.text();
          // Assinatura da Meta: SEMPRE obrigatória. Sem META_APP_SECRET o webhook
          // permaneceria aberto silenciosamente, então falhamos fechado.
          const appSecret = (process.env["META_APP_SECRET"] || "").trim();
          if (!appSecret) {
            console.error(
              "[instagram-webhook] META_APP_SECRET ausente — webhook recusado (fail-closed)",
            );
            return new Response("webhook signature not configured", { status: 503 });
          }
          {
            const header = (request.headers.get("x-hub-signature-256") || "").trim();
            const provided = header.startsWith("sha256=") ? header.slice(7) : "";
            const { createHmac, timingSafeEqual } = await import("node:crypto");
            const expected = createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
            const a = Buffer.from(provided, "utf8");
            const b = Buffer.from(expected, "utf8");
            if (a.length !== b.length || !timingSafeEqual(a, b)) {
              console.warn("[instagram-webhook] assinatura inválida");
              return new Response("invalid signature", { status: 401 });
            }
          }
          let payload: any = {};
          try {
            payload = raw ? JSON.parse(raw) : {};
          } catch {
            payload = {};
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
          if (!entries.length) return new Response("ok", { status: 200 });

          let queued = 0;
          for (const entry of entries) {
            const events: any[] = Array.isArray(entry?.messaging) ? entry.messaging : [];
            for (const ev of events) {
              const message = ev?.message;
              if (!message || message.is_echo) continue;

              const senderId = String(ev?.sender?.id || "").trim();
              const recipientId = String(ev?.recipient?.id || entry?.id || "").trim();
              if (!senderId || !recipientId) continue;

              // Resolve a empresa pela conta que RECEBEU a mensagem.
              const { data: ig } = await (supabaseAdmin as any)
                .from("instagram_integration")
                .select("company_id, user_id, ig_user_id, page_id, page_access_token, conectado, instagram_provider")
                .or(`ig_user_id.eq.${recipientId},page_id.eq.${recipientId}`)
                .maybeSingle();
              if (!ig || !(ig as any).conectado) continue;
              // Provedor ativo é a Zernio: a entrada vem pelo webhook da Zernio (evita duplicar).
              if ((ig as any).instagram_provider === "zernio") continue;

              const companyId = (ig as any).company_id as string;
              const userId = (ig as any).user_id as string | null;
              if (!userId) continue;

              const contactId = igContactId(senderId);
              const mid: string | null =
                typeof message.mid === "string" && message.mid.trim() ? message.mid.trim() : null;

              // ---- mídia
              const att = Array.isArray(message.attachments) ? message.attachments[0] : null;
              const attType = String(att?.type || "").toLowerCase();
              const attUrl = att?.payload?.url ? String(att.payload.url) : null;
              let media: any = null;
              if (attUrl) {
                const kind =
                  attType === "audio"
                    ? "audio"
                    : attType === "image" || attType === "story_mention" || attType === "share"
                      ? "image"
                      : attType === "video"
                        ? "document"
                        : attType === "file"
                          ? "document"
                          : null;
                if (kind) {
                  media = {
                    kind,
                    provider: "instagram",
                    url: attUrl,
                    mimetype:
                      attType === "audio"
                        ? "audio/mp4"
                        : attType === "image"
                          ? "image/jpeg"
                          : "application/octet-stream",
                    fileName: null,
                    caption: typeof message.text === "string" ? message.text : null,
                  };
                }
              }

              const text: string = typeof message.text === "string" ? message.text : "";
              const token = (ig as any).page_access_token as string | null;
              const r = await ingestInstagramInbound(supabaseAdmin, {
                companyId,
                userId,
                contactId,
                externalMessageId: mid,
                text,
                media,
                resolveName: token
                  ? async () => {
                      const { igFetchContact } = await import("@/lib/instagram.server");
                      return (await igFetchContact(token, senderId)).nome;
                    }
                  : undefined,
              });
              if (r !== "queued") continue;
              queued++;
            }
          }

          console.info("[instagram-webhook] recebido em", Date.now() - t0, "ms", queued, "job(s)");
          return new Response("queued", { status: 200 });
        } catch (e: any) {
          console.error("[instagram-webhook]", e?.message, e?.stack);
          // 500 => a Meta reentrega; entradas já gravadas são deduplicadas pelo mid.
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
