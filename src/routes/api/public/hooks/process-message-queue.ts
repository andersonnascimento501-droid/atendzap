import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker da fila de mensagens (pg_cron a cada minuto, Authorization: Bearer <segredo interno>).
 * - Claim atômico (mq_claim_due, SKIP LOCKED) gera lease_token novo a cada posse.
 * - Toda finalização/retry passa por mq_finish(id, lease_token): worker antigo não sobrescreve.
 * - mq_finish cria o próximo ciclo quando chegaram mensagens durante o processamento.
 * - Início de cada execução roda mq_recover_orphans (entradas sem job ativo).
 */

const BACKOFF_MIN = [1, 5, 15]; // minutos
const DRAIN_MS = 45_000;
const BATCH = 10;

export const Route = createFileRoute("/api/public/hooks/process-message-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateWorkerRequest } = await import("@/lib/worker-auth.server");
        const denied = await authenticateWorkerRequest(request);
        if (denied) return denied;

        const started = Date.now();
        const stats = { recovered: 0, claimed: 0, completed: 0, skipped: 0, retried: 0, failed: 0, leaseLost: 0 };

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { processConversationJob, LeaseLostError } = await import("@/lib/message-pipeline.server");
          const admin = supabaseAdmin as any;
          const worker = `w-${Math.random().toString(36).slice(2, 8)}`;

          const { data: rec, error: recErr } = await admin.rpc("mq_recover_orphans", { _limit: 50 });
          if (recErr) console.error("[mq.recover]", recErr.message);
          else stats.recovered = Number(rec ?? 0);

          const finish = async (job: any, status: "completed" | "failed" | "pending", extra: { error?: string; retryAt?: string; attempts?: number } = {}) => {
            const { data, error } = await admin.rpc("mq_finish", {
              _id: job.id,
              _token: job.lease_token,
              _status: status,
              _error: extra.error ?? null,
              _retry_at: extra.retryAt ?? null,
              _attempts: extra.attempts ?? null,
            });
            if (error) throw new Error(`mq_finish: ${error.message}`);
            if (!data) stats.leaseLost++;
            return !!data;
          };

          while (Date.now() - started < DRAIN_MS) {
            const { data: jobs, error } = await admin.rpc("mq_claim_due", { _limit: BATCH, _worker: worker });
            if (error) throw error;
            const list = (jobs ?? []) as any[];
            if (!list.length) {
              if (Date.now() - started > DRAIN_MS - 6_000) break;
              await new Promise((r) => setTimeout(r, 4_000));
              continue;
            }
            stats.claimed += list.length;

            await Promise.all(
              list.map(async (job: any) => {
                const jobStart = Date.now();
                const qjob = {
                  id: job.id,
                  company_id: job.company_id,
                  numero: job.numero,
                  instance_name: job.instance_name,
                  credit_consumed: !!job.credit_consumed,
                  routed_agent_id: job.routed_agent_id ?? null,
                  run_seq: job.run_seq ?? 0,
                  lease_token: job.lease_token ?? null,
                };
                try {
                  const out = await processConversationJob(admin, qjob);
                  if (await finish(job, "completed")) {
                    if (out.status === "completed") stats.completed++;
                    else stats.skipped++;
                  }
                  console.info("[mq]", job.company_id, job.numero, out.status, out.reason ?? "", `${Date.now() - jobStart}ms`);
                } catch (e: any) {
                  if (e instanceof LeaseLostError) {
                    stats.leaseLost++;
                    console.warn("[mq.lease-lost]", job.company_id, job.numero, job.id);
                    return;
                  }
                  const attempts = (job.attempts ?? 0) + 1;
                  const max = job.max_attempts ?? 3;
                  const msg = String(e?.message ?? e).slice(0, 500);
                  try {
                    if (attempts >= max) {
                      if (await finish(job, "failed", { error: msg, attempts })) {
                        stats.failed++;
                        await refundIfNothingSent(admin, qjob);
                      }
                      console.error("[mq.failed]", job.company_id, job.numero, msg);
                    } else {
                      const delayMin = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)]!;
                      const retryAt = new Date(Date.now() + delayMin * 60_000).toISOString();
                      if (await finish(job, "pending", { error: msg, attempts, retryAt })) stats.retried++;
                      console.warn("[mq.retry]", job.company_id, job.numero, `tentativa ${attempts}/${max} em ${delayMin}min`, msg);
                    }
                  } catch (fe: any) {
                    // Sem posse gravada o job expira em 5 min e é reclamado de novo; nada é perdido.
                    console.error("[mq.finish]", job.id, fe?.message);
                  }
                }
              }),
            );
          }

          return Response.json({ ok: true, ...stats, ms: Date.now() - started });
        } catch (e: any) {
          console.error("[process-message-queue]", e?.message);
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), { status: 500 });
        }
      },
    },
  },
});

/** Regra de cobrança: job que falhou de vez sem nenhuma resposta enviada tem o crédito estornado. */
async function refundIfNothingSent(admin: any, job: { id: string; company_id: string; numero: string; credit_consumed: boolean }) {
  const { data: row } = await admin.from("message_processing_queue").select("credit_consumed, credit_refunded").eq("id", job.id).maybeSingle();
  if (!row?.credit_consumed || row?.credit_refunded) return;
  const { count, error } = await admin
    .from("mensagens")
    .select("id", { count: "exact", head: true })
    .eq("company_id", job.company_id)
    .like("response_key", `${job.id}:%`);
  if (error) return console.error("[credits.refund.check]", error.message);
  if ((count ?? 0) > 0) return; // algo foi (ou pode ter sido) entregue: cobrança mantida
  const { data: flagged, error: fErr } = await admin
    .from("message_processing_queue")
    .update({ credit_refunded: true })
    .eq("id", job.id)
    .eq("credit_refunded", false)
    .select("id");
  if (fErr || !flagged?.length) return;
  const { error: rErr } = await admin.rpc("refund_ai_credit", { _company_id: job.company_id, _ref: `${job.numero}:${job.id}` });
  if (rErr) console.error("[credits.refund]", rErr.message);
}
