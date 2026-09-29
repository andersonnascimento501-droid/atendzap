import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { normalizeTestPhone, samePhone, testModeAllows } from "../src/lib/test-mode";

const pipe = readFileSync("src/lib/message-pipeline.server.ts", "utf8");
const hook = readFileSync("src/routes/api/public/whatsapp-webhook.ts", "utf8");
const mig = readFileSync("drizzle/migrations/0012_0012_whatsapp_test_mode.sql", "utf8");

describe("modo de teste WhatsApp", () => {
  it("1. empresa existente começa desligada", () => {
    expect(mig).toMatch(/agent_test_mode boolean NOT NULL DEFAULT false/);
    expect(testModeAllows({}, "5511999999999", "whatsapp")).toBe(true);
  });
  it("2. número salvo normalizado", () => {
    expect(normalizeTestPhone("+55 (11) 99999-8888")).toBe("5511999998888");
    expect(normalizeTestPhone("(11) 99999-8888")).toBe("5511999998888");
    expect(normalizeTestPhone("abc")).toBeNull();
  });
  it("3. formatos diferentes = mesmo número (inclusive sem o 9º dígito)", () => {
    expect(samePhone("5511999998888@s.whatsapp.net", "+55 11 99999-8888")).toBe(true);
    expect(samePhone("551199998888", "5511999998888")).toBe(true);
    expect(samePhone("5511999998887", "5511999998888")).toBe(false);
  });
  const co = { agent_test_mode: true, agent_test_phone: "5511999998888" };
  it("4/6. autorizado passa, outro número bloqueado", () => {
    expect(testModeAllows(co, "5511999998888", "whatsapp")).toBe(true);
    expect(testModeAllows(co, "5521988887777", "whatsapp")).toBe(false);
  });
  it("11. liberado para todos volta a processar", () => {
    expect(testModeAllows({ ...co, agent_test_mode: false }, "5521988887777", "whatsapp")).toBe(true);
  });
  it("13. Instagram (Meta/Zernio) não é afetado", () => {
    expect(testModeAllows(co, "igsid123", "instagram")).toBe(true);
  });
  it("5/7/8/9. bloqueio no worker antes de crédito, IA e envio (cobre retry/recuperação)", () => {
    const gate = pipe.indexOf("test-mode-blocked");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(pipe.indexOf("consume_ai_credit"));
    expect(gate).toBeLessThan(pipe.indexOf("runAgentTurn") === -1 ? Infinity : pipe.indexOf("runAgentTurn"));
    expect(gate).toBeLessThan(pipe.indexOf("upsertCard(\n      admin"));
  });
  it("6/10. webhook grava a mensagem e não enfileira; reentrega também não", () => {
    const blk = hook.indexOf('"test-mode"');
    expect(blk).toBeGreaterThan(hook.indexOf('.from("mensagens")'));
    expect(blk).toBeLessThan(hook.lastIndexOf('rpc("mq_enqueue"'));
    const dupGate = hook.indexOf("testModeAllows");
    expect(dupGate).toBeLessThan(hook.indexOf('rpc("mq_enqueue"'));
  });
  it("12. prompt manual não é tocado", () => {
    const fn = readFileSync("src/lib/test-mode.functions.ts", "utf8");
    expect(fn).not.toMatch(/prompt_custom|agent_config/);
  });
  it("14/15. agent_tested_at só após todas as partes 'sent'", () => {
    expect(pipe).toMatch(/if \(sendResult !== "sent"\) allSent = false/);
    expect(pipe).toMatch(/isRealTest && allSent/);
  });
});
