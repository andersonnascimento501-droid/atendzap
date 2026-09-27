import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { withChargedCredit, shouldMarkRefunded, isAgentTested } from "../src/lib/credit-guard";

function fakeLedger(saldo = 5) {
  const ledger: { ref: string; motivo: string }[] = [];
  const st = { saldo };
  return {
    st, ledger,
    deps: {
      alreadyCharged: async (r: string) => ledger.some((l) => l.ref === r && l.motivo === "ai_message") && !ledger.some((l) => l.ref === r && l.motivo === "ai_refund"),
      consume: async (r: string) => { if (st.saldo <= 0) return false; st.saldo--; ledger.push({ ref: r, motivo: "ai_message" }); return true; },
      refund: async (r: string) => {
        const c = ledger.filter((l) => l.ref === r && l.motivo === "ai_message").length;
        const d = ledger.filter((l) => l.ref === r && l.motivo === "ai_refund").length;
        if (c === 0 || d >= c) return false;
        st.saldo++; ledger.push({ ref: r, motivo: "ai_refund" }); return true;
      },
    },
  };
}

describe("assistente: cobrança e estorno", () => {
  test("sucesso cobra 1 crédito e não estorna", async () => {
    const f = fakeLedger();
    expect(await withChargedCredit("r1", f.deps, async () => "ok")).toBe("ok");
    expect(f.st.saldo).toBe(4);
  });
  test("falha da OpenAI estorna com a mesma ref e preserva o erro", async () => {
    const f = fakeLedger();
    await expect(withChargedCredit("r2", f.deps, async () => { throw new Error("OpenAI 500"); })).rejects.toThrow("OpenAI 500");
    expect(f.st.saldo).toBe(5);
    expect(f.ledger.filter((l) => l.motivo === "ai_refund").map((l) => l.ref)).toEqual(["r2"]);
  });
  test("estorno idempotente: segunda tentativa não devolve de novo", async () => {
    const f = fakeLedger();
    await withChargedCredit("r3", f.deps, async () => { throw new Error("x"); }).catch(() => {});
    expect(await f.deps.refund("r3")).toBe(false);
    expect(f.st.saldo).toBe(5);
  });
  test("retry da mesma solicitação não cobra de novo", async () => {
    const f = fakeLedger();
    await f.deps.consume("r4");
    await withChargedCredit("r4", f.deps, async () => "ok");
    expect(f.st.saldo).toBe(4);
  });
  test("assistant.functions usa estorno atômico", () => {
    const s = readFileSync("src/lib/assistant.functions.ts", "utf8");
    expect(s).toContain("withChargedCredit");
    expect(s).toContain('"refund_ai_credit"');
  });
});

describe("refund_ai_credit_for_job (regra isolada; SQL não executado nos testes)", () => {
  test("marca só quando devolveu agora ou histórico comprova", () => {
    expect(shouldMarkRefunded(true, { charged: true, refunded: true })).toBe(true);
    expect(shouldMarkRefunded(false, { charged: true, refunded: true })).toBe(true);
    expect(shouldMarkRefunded(false, { charged: false, refunded: false })).toBe(false);
    expect(shouldMarkRefunded(false, { charged: true, refunded: false })).toBe(false);
  });
  test("migração 0009 não marca incondicionalmente", () => {
    const sql = readFileSync("drizzle/migrations/0009_0009_refund_job_fix_agent_tested.sql", "utf8");
    expect(sql).toContain("IF _ok THEN");
    expect(sql).toContain("IF _ja THEN");
  });
});

describe("teste realizado salvo no banco", () => {
  test("leitura do checklist", () => {
    expect(isAgentTested({ agent_tested_at: "2026-09-27T00:00:00Z" })).toBe(true);
    expect(isAgentTested({ agent_tested_at: null })).toBe(false);
    expect(isAgentTested(null)).toBe(false);
  });
  test("sucesso grava agent_tested_at da empresa logada; falha não chega ao update", () => {
    const s = readFileSync("src/lib/evolution.functions.ts", "utf8");
    const i = s.indexOf("agent_tested_at");
    expect(i).toBeGreaterThan(s.indexOf("await lovableAiChat(", s.indexOf("testAiReply")));
    expect(s.slice(i, i + 120)).toContain('.eq("id", companyId)');
  });
  test("localStorage não é mais fonte oficial", () => {
    for (const f of ["src/routes/app/dashboard.tsx", "src/routes/app/onboarding.tsx", "src/routes/app/agente.tsx"]) {
      expect(readFileSync(f, "utf8")).not.toContain("TESTE_FLAG_KEY");
    }
  });
});
