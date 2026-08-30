import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker de follow-up chamado por pg_cron.
 * Claim atômico via followup_claim_due (SKIP LOCKED) → sem envio duplicado.
 */
export const Route = createFileRoute("/api/public/hooks/process-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = (request.headers.get("apikey") || "").trim();
        const accepted = [process.env["SUPABASE_ANON_KEY"], process.env["SUPABASE_PUBLISHABLE_KEY"]].filter(
          (k): k is string => !!k && k.length > 20,
        );
        if (!apikey || !accepted.includes(apikey)) {
          const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { processDueFollowups } = await import("@/lib/followup.server");
          const out = await processDueFollowups(supabaseAdmin, 25);
          // Lembretes de agendamento no MESMO worker (nenhum cron novo).
          let lembretes: any = { sent: 0, skipped: 0 };
          try {
            const { processAppointmentReminders } = await import("@/lib/scheduling.server");
            lembretes = await processAppointmentReminders(supabaseAdmin, 50);
          } catch (e: any) {
            console.error("[agenda.lembretes]", e?.message);
            lembretes = { sent: 0, skipped: 0, error: String(e?.message ?? e) };
          }
          return Response.json({ ok: true, ...out, lembretes });
        } catch (e: any) {
          console.error("[process-followups]", e?.message);
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), { status: 500 });
        }

      },
    },
  },
});
