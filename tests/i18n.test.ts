import { describe, expect, test } from "bun:test";
import { translate } from "../src/i18n";
import { fillDays } from "../src/lib/atendai-plan";
import { readFileSync } from "node:fs";
import { resolveLocale, seedName, normalizeLocale } from "../src/i18n/resolve";
import { ptBR } from "../src/i18n/pt-BR";
import { esES } from "../src/i18n/es-ES";
import { buildSystemPrompt, hasLanguageInstruction } from "../src/lib/ai-prompt";
import { buildAssistantMessages } from "../src/lib/assistant.server";

describe("i18n — preferência", () => {
  test("usuário/empresa existentes sem escolha ficam em pt-BR", () => {
    expect(resolveLocale({ user: null, company: "pt-BR", browser: ["es-ES"] })).toBe("pt-BR");
    expect(resolveLocale({})).toBe("pt-BR");
  });
  test("escolha salva do usuário vence (qualquer dispositivo/login lê do banco)", () => {
    expect(resolveLocale({ user: "es-ES", company: "pt-BR", browser: ["pt-BR"] })).toBe("es-ES");
  });
  test("ordem: empresa → navegador → pt-BR", () => {
    expect(resolveLocale({ company: "es-ES" })).toBe("es-ES");
    expect(resolveLocale({ browser: ["fr-FR", "es-MX"] })).toBe("es-ES");
    expect(normalizeLocale("xx")).toBeNull();
  });
  test("preferência é lida do banco, não do localStorage", () => {
    const app = readFileSync("src/routes/app.tsx", "utf8");
    const card = readFileSync("src/components/config/idioma-card.tsx", "utf8");
    expect(app).toMatch(/from\("profiles"\)\.select\("idioma"\)/);
    expect(card).toMatch(/from\("profiles"\)\.update\(\{ idioma/);
    expect(card + app).not.toMatch(/localStorage/);
  });
  test("dicionários têm as mesmas chaves", () => {
    expect(Object.keys(esES).sort()).toEqual(Object.keys(ptBR).sort());
  });
});

describe("i18n — dados do cliente", () => {
  test("textos iniciais em espanhol só para nomes padrão do sistema", () => {
    expect(seedName("es-ES", "Em atendimento")).toBe("En atención");
    expect(seedName("es-ES", "Qualificado")).toBe("Cualificado");
    expect(seedName("es-ES", "Minha etapa VIP")).toBe("Minha etapa VIP");
    expect(seedName("pt-BR", "Novo")).toBe("Novo");
  });
  test("trocar idioma do usuário só atualiza a coluna idioma", () => {
    const card = readFileSync("src/components/config/idioma-card.tsx", "utf8");
    expect(card).not.toMatch(/crm_stage|agent_config|prompt_custom/);
  });
});

describe("i18n — agente", () => {
  const base: any = { nome_agente: "Ana", sobre_empresa: "x", prompt_custom: "Texto manual EXATO 123" };
  test("prompt manual permanece idêntico em qualquer idioma", () => {
    for (const idioma of ["auto", "pt-BR", "es-ES"]) {
      expect(buildSystemPrompt({ ...base, idioma }, {} as any)).toContain("Texto manual EXATO 123");
    }
  });
  test("automático instrui responder no idioma da mensagem (pt ou es)", () => {
    const p = buildSystemPrompt({ ...base, idioma: "auto" }, {} as any);
    expect(p).toMatch(/mesmo idioma da mensagem atual do cliente/);
  });
  test("espanhol fixo", () => {
    expect(buildSystemPrompt({ ...base, idioma: "es-ES" }, {} as any)).toMatch(/Escreva SEMPRE em Espanhol da Espanha/);
    expect(buildSystemPrompt({ ...base, idioma: "pt-BR" }, {} as any)).toMatch(/Escreva SEMPRE em Português do Brasil/);
  });
  test("aviso de conflito no prompt manual", () => {
    expect(hasLanguageInstruction("Responda sempre em português")).toBe(true);
    expect(hasLanguageInstruction("Somos uma padaria")).toBe(false);
  });
});

describe("i18n — Assistente", () => {
  test("responde no idioma do usuário; crédito inalterado", () => {
    expect(buildAssistantMessages({}, "hola", "es-ES")[0]!.content).toMatch(/espanhol da Espanha/);
    expect(buildAssistantMessages({}, "oi")[0]!.content).toMatch(/Responda em português/);
    const fn = readFileSync("src/lib/assistant.functions.ts", "utf8");
    expect(fn).toMatch(/withChargedCredit\(ref/);
  });
});

describe("i18n — etapa 2 (páginas públicas)", () => {
  test("página de vendas tem as mesmas seções nos dois idiomas", async () => {
    const { LANDING } = await import("../src/i18n/landing");
    const pt = LANDING["pt-BR"], es = LANDING["es-ES"];
    expect(Object.keys(es).sort()).toEqual(Object.keys(pt).sort());
    for (const k of ["steps", "features", "faq", "segments", "bubbles", "bubbleChannels", "stats", "flowSteps"] as const) expect(es[k].length).toBe(pt[k].length);
    expect(pt.bubbles).toHaveLength(4);
    expect(pt.bubbleChannels).toEqual(["WhatsApp", "", "Instagram Direct", ""]);
    expect(fillDays(es, 7).ctaTrial).toBe("Empezar 7 días gratis");
    expect(fillDays(pt, 7).ctaTrial).toBe("Começar 7 dias grátis");
    expect(fillDays(pt, 7).noCard).toBe("7 dias grátis, sem cartão.");
    expect(fillDays(es, 1).ctaTrial).toBe("Empezar 1 día gratis");
    expect(translate("pt-BR", "trial.ativo" as any, { dias: 1 })).toContain("termina em 1 dia.");
    expect(translate("es-ES", "trial.ativo" as any, { dias: 7 })).toContain("termina en 7 días.");
    expect(JSON.stringify(pt) + JSON.stringify(es)).not.toMatch(/cancel[ea] antes/);
  });
  test("entrar/senha/demo têm tradução", () => {
    for (const k of Object.keys(ptBR).filter((k) => /^(auth|senha|demo)\./.test(k))) expect((esES as any)[k]).toBeTruthy();
    expect(esES["auth.criarConta"]).toBe("Crear cuenta gratis");
  });
});
