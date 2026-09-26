import { describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { buildContextMessages, isDefinitiveSendFailure, HISTORY_LIMIT } from "../src/lib/queue-logic";

const migration = readFileSync("drizzle/migrations/0007_queue_lease_send_state_recovery.sql", "utf8");
const worker = readFileSync("src/routes/api/public/hooks/process-message-queue.ts", "utf8");
const pipeline = readFileSync("src/lib/message-pipeline.server.ts", "utf8");
const waHook = readFileSync("src/routes/api/public/whatsapp-webhook.ts", "utf8");
const igHook = readFileSync("src/routes/api/public/instagram-webhook.ts", "utf8");

// ---- Fake mínimo do cliente Supabase (apenas o que sendPartOnce usa)
function fakeAdmin(opts: { conflict?: boolean; lease?: boolean } = {}) {
  const rows: any[] = [];
  const calls: string[] = [];
  const admin: any = {
    rows,
    calls,
    rpc: async (name: string) => {
      calls.push(name);
      return { data: opts.lease ?? true, error: null };
    },
    from: () => {
      let op = "";
      let payload: any;
      let id: string | null = null;
      const q: any = {
        insert: (p: any) => ((op = "insert"), (payload = p), q),
        update: (p: any) => ((op = "update"), (payload = p), q),
        delete: () => ((op = "delete"), q),
        select: () => q,
        eq: (col: string, v: any) => (col === "id" && (id = v), q),
        maybeSingle: () => q.then((r: any) => r),
        then: (res: any) => {
          if (op === "insert") {
            if (opts.conflict || rows.some((r) => r.response_key === payload.response_key))
              return res({ data: null, error: { code: "23505", message: "dup" } });
            const row = { id: `m${rows.length}`, ...payload };
            rows.push(row);
            return res({ data: { id: row.id }, error: null });
          }
          if (op === "update") rows.filter((r) => r.id === id).forEach((r) => Object.assign(r, payload));
          if (op === "delete") rows.splice(0, rows.length, ...rows.filter((r) => r.id !== id));
          return res({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return admin;
}

const baseArgs = (send: any, extra: any = {}) => ({
  companyId: "c1", userId: "u1", numero: "5511", contatoNome: null,
  target: { channel: "whatsapp" }, jobId: "job1", index: 0, texto: "oi", send, ...extra,
});

describe("cron autenticado", () => {
  test("worker exige Bearer com segredo interno", async () => {
    process.env["LOVABLE_CRON_SECRET"] = "s".repeat(32);
    mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }));
    const { authenticateWorkerRequest } = await import("../src/lib/worker-auth.server");
    const mk = (h?: string) => new Request("https://x/y", { method: "POST", headers: h ? { authorization: h } : {} });
    expect((await authenticateWorkerRequest(mk()))?.status).toBe(401);
    expect((await authenticateWorkerRequest(mk("Bearer sb_publishable_xxx")))?.status).toBe(401);
    expect(await authenticateWorkerRequest(mk(`Bearer ${"s".repeat(32)}`))).toBeNull();
  });
});

describe("webhooks", () => {
  test("falha após gravar entrada responde 500 (provedor reenvia) e não 200", () => {
    expect(waHook).toContain('status: 500');
    expect(igHook).toContain('status: 500');
    expect(waHook).not.toMatch(/return new Response\("error", \{ status: 200 \}\)/);
  });
  test("reentrega (23505) garante job; enfileiramento é atômico", () => {
    for (const src of [waHook, igHook]) {
      expect(src).toContain('rpc("mq_enqueue"');
      expect(src).not.toContain('.from("message_processing_queue")');
    }
    expect(migration).toMatch(/ON CONFLICT \(company_id, numero\) WHERE status IN \('pending','processing'\)/);
  });
});

describe("fila: posse, recuperação e próximo ciclo", () => {
  test("claim gera lease_token e finalização exige o token", () => {
    expect(migration).toContain("lease_token=gen_random_uuid()");
    expect(migration).toMatch(/WHERE id=_id AND lease_token=_token AND status='processing'/);
    expect(worker).toContain('rpc("mq_finish"');
    expect(worker).not.toMatch(/\.from\("message_processing_queue"\)\s*\.update\(\{\s*status/);
  });
  test("worker com posse expirada aborta antes de enviar", async () => {
    const { sendPartOnce, LeaseLostError } = await import("../src/lib/message-pipeline.server");
    const admin = fakeAdmin({ lease: false });
    const send = mock(async () => ({}));
    await expect(
      sendPartOnce(admin, baseArgs(send, { job: { id: "job1", lease_token: "t", company_id: "c1", numero: "5511" } }) as any),
    ).rejects.toBeInstanceOf(LeaseLostError);
    expect(send).not.toHaveBeenCalled();
  });
  test("mensagem chegando durante processamento cria próximo ciclo (inclusive em falha)", () => {
    expect(migration).toMatch(/IF _status IN \('completed','failed'\) AND EXISTS[\s\S]*mq_enqueue/);
  });
  test("recuperação de órfã ignora decisões finais e job recente", () => {
    expect(migration).toContain("m.ai_processed_at IS NULL");
    expect(migration).toContain("q.status='failed' AND q.updated_at >= r.primeira");
    expect(migration).toContain("interval '24 hours'");
    expect(worker).toContain('rpc("mq_recover_orphans"');
  });
});

describe("envio idempotente", () => {
  test("envio confirmado grava sent; retry não reenvia", async () => {
    const { sendPartOnce } = await import("../src/lib/message-pipeline.server");
    const admin = fakeAdmin();
    const send = mock(async () => ({ key: { id: "P1" } }));
    expect(await sendPartOnce(admin, baseArgs(send) as any)).toBe("sent");
    expect(admin.rows[0].send_status).toBe("sent");
    expect(await sendPartOnce(admin, baseArgs(send) as any)).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);
  });
  test("falha de rede após envio => uncertain, sem reenvio cego", async () => {
    const { sendPartOnce } = await import("../src/lib/message-pipeline.server");
    const admin = fakeAdmin();
    const send = mock(async () => { throw Object.assign(new Error("indisponível"), { providerStatus: 0 }); });
    expect(await sendPartOnce(admin, baseArgs(send) as any)).toBe("uncertain");
    expect(admin.rows[0].send_status).toBe("uncertain");
    expect(await sendPartOnce(admin, baseArgs(send) as any)).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);
  });
  test("recusa explícita (4xx) libera a reserva para retry", async () => {
    const { sendPartOnce } = await import("../src/lib/message-pipeline.server");
    const admin = fakeAdmin();
    const send = mock(async () => { throw Object.assign(new Error("Evolution API: bad"), { providerStatus: 400 }); });
    await expect(sendPartOnce(admin, baseArgs(send) as any)).rejects.toThrow();
    expect(admin.rows.length).toBe(0);
    expect(isDefinitiveSendFailure({ providerStatus: 503 })).toBe(false);
  });
});

describe("créditos", () => {
  test("limite de respostas é verificado antes de consumir crédito", () => {
    const iThrottle = pipeline.indexOf("getAiThrottleReason(admin, companyId, number)");
    const iCredit = pipeline.indexOf('rpc("consume_ai_credit"');
    expect(iThrottle).toBeGreaterThan(0);
    expect(iThrottle).toBeLessThan(iCredit);
  });
  test("retry não cobra de novo e erro da RPC é verificado", () => {
    expect(pipeline).toContain("if (!job.credit_consumed)");
    expect(pipeline).toContain("if (cErr) throw");
    expect(pipeline).toContain("hasCredit !== true");
  });
  test("falha definitiva sem envio estorna uma única vez", () => {
    expect(worker).toContain("refund_ai_credit");
    expect(worker).toContain('.eq("credit_refunded", false)');
  });
});

describe("contexto da IA", () => {
  test("lote com mais de 25 mensagens entra inteiro, uma vez, em ordem", () => {
    const hist = Array.from({ length: 40 }, (_, i) => ({
      id: `h${i}`, autor: i % 3 === 0 ? "humano" : i % 2 ? "ia" : "contato",
      direcao: i % 2 && i % 3 ? "saida" : i % 3 === 0 ? "saida" : "entrada",
      texto: `h${i}`, created_at: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    const batch = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, texto: `lote ${i}` }));
    const msgs = buildContextMessages(hist, batch);
    expect(msgs.length).toBe(HISTORY_LIMIT + 1);
    const last = msgs[msgs.length - 1]!;
    expect(last.role).toBe("user");
    expect(last.content.split("\n")).toEqual(batch.map((b) => b.texto));
    expect(msgs.filter((m) => m.content.includes("lote 0")).length).toBe(1);
    expect(msgs.some((m) => m.content.startsWith("[Atendente humano]"))).toBe(true);
  });
  test("lote já presente no histórico não é duplicado", () => {
    const msgs = buildContextMessages(
      [{ id: "b0", autor: "contato", direcao: "entrada", texto: "[Áudio] quero agendar", created_at: "2026-01-01" }],
      [{ id: "b0", texto: "[Áudio] quero agendar" }],
    );
    expect(msgs).toEqual([{ role: "user", content: "[Áudio] quero agendar" }]);
  });
});
