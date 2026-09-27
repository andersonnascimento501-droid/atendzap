import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da Zernio (Instagram Direct) — um por empresa, URL com token imprevisível.
 * Valida X-Zernio-Signature (HMAC-SHA256 do corpo bruto) com o segredo criptografado
 * daquela empresa ANTES de qualquer gravação. A empresa vem do token, nunca do payload,
 * e o accountId do evento precisa ser o da integração. Nada de IA aqui: só enfileira.
 */
export const Route = createFileRoute("/api/public/zernio-webhook/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = String((params as any)?.token || "");
        if (!/^[a-f0-9]{48,128}$/.test(token)) return new Response("not found", { status: 404 });
        const raw = await request.text();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as any;
          const { data: z } = await admin
            .from("instagram_zernio")
            .select("company_id, account_id, profile_id, status, webhook_secret_enc, connected_by")
            .eq("webhook_token", token)
            .maybeSingle();
          if (!z) return new Response("not found", { status: 404 });

          const { decryptSecret } = await import("@/lib/secret-box.server");
          let secret: string | null = null;
          try {
            secret = await decryptSecret((z as any).webhook_secret_enc);
          } catch {
            secret = null;
          }
          if (!secret) return new Response("webhook signature not configured", { status: 503 });

          const { verifyZernioSignature, parseZernioInbound, eventAccount, zernioMessageKey } =
            await import("@/lib/zernio-logic");
          const sig = request.headers.get("x-zernio-signature") || request.headers.get("x-late-signature");
          if (!(await verifyZernioSignature(secret, raw, sig))) {
            console.warn("[zernio-webhook] assinatura inválida");
            return new Response("invalid signature", { status: 401 });
          }

          let payload: any = {};
          try {
            payload = raw ? JSON.parse(raw) : {};
          } catch {
            return new Response("ok", { status: 200 });
          }
          const event = String(payload?.event || "");
          if (event === "webhook.test") return new Response("ok", { status: 200 });

          const companyId = (z as any).company_id as string;
          const acc = eventAccount(payload);
          // Evento de outra conta/plataforma nunca entra nesta empresa (200 para não gerar reentrega eterna).
          if (!(z as any).account_id || acc.accountId !== (z as any).account_id) return new Response("ignored", { status: 200 });
          if (acc.platform && acc.platform !== "instagram") return new Response("ignored", { status: 200 });
          if (acc.profileId && (z as any).profile_id && acc.profileId !== (z as any).profile_id)
            return new Response("ignored", { status: 200 });

          if (event === "account.disconnected") {
            await admin
              .from("instagram_zernio")
              .update({ status: "reconectar", ultimo_erro: "A conta do Instagram foi desconectada na Zernio." })
              .eq("company_id", companyId);
            return new Response("ok", { status: 200 });
          }

          if (event === "message.sent" || event === "message.delivered" || event === "message.read" || event === "message.failed") {
            const pmid = String(payload?.message?.platformMessageId || payload?.message?.id || "");
            if (pmid) {
              const q = admin
                .from("mensagens")
                .update({ send_status: event === "message.failed" ? "failed" : "sent" })
                .eq("company_id", companyId)
                .eq("channel", "instagram")
                .eq("direcao", "saida")
                .eq("provider_message_id", pmid);
              // Confirmações só promovem "incerto" → "enviado"; falha marca "failed".
              const { error } = event === "message.failed" ? await q.in("send_status", ["sending", "uncertain", "sent"]) : await q.eq("send_status", "uncertain");
              if (error) throw error;
            }
            return new Response("ok", { status: 200 }); // eco/estado: nunca vira entrada nem dispara IA
          }

          if (event !== "message.received") return new Response("ignored", { status: 200 });
          if ((z as any).status !== "conectado") return new Response("ignored", { status: 200 });

          const { data: ig } = await admin
            .from("instagram_integration")
            .select("user_id, instagram_provider")
            .eq("company_id", companyId)
            .maybeSingle();
          if ((ig as any)?.instagram_provider !== "zernio") return new Response("ignored", { status: 200 });

          const msg = parseZernioInbound(payload);
          if (!msg) return new Response("ignored", { status: 200 });
          const userId = ((ig as any)?.user_id || (z as any).connected_by) as string | null;
          if (!userId) return new Response("ignored", { status: 200 });

          const { igContactId } = await import("@/lib/channels");
          const media = msg.attachment
            ? {
                kind: msg.attachment.kind,
                provider: "zernio",
                url: msg.attachment.url,
                mimetype: msg.attachment.mimetype,
                fileName: null,
                caption: msg.text || null,
              }
            : null;
          const { ingestInstagramInbound } = await import("@/lib/instagram-ingest.server");
          await ingestInstagramInbound(admin, {
            companyId,
            userId,
            contactId: igContactId(msg.senderId),
            externalMessageId: zernioMessageKey(msg.accountId, msg.messageId),
            text: msg.text,
            media,
            providerConversationId: msg.conversationId,
            resolveName: async () => msg.senderName,
          });
          return new Response("queued", { status: 200 });
        } catch (e: any) {
          console.error("[zernio-webhook]", e?.message);
          // 500 → a Zernio reentrega; a entrada é deduplicada pelo id namespaceado.
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
