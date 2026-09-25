import { describe, expect, test } from "bun:test";
import {
  PENDENTE,
  extractLiterals,
  filterAnsweredQuestions,
  isManualPromptMode,
  mergeGeneratedConfig,
  requiresManualOverrideConfirm,
} from "../src/lib/agent-generation";
import { buildSystemPrompt } from "../src/lib/ai-prompt";

const FIELDS = [
  "produtos_servicos",
  "formas_pagamento",
  "politicas",
  "faq",
  "objecoes",
  "como_vender",
  "sobre_empresa",
];

describe("geração não destrutiva do agente", () => {
  test("(a) preço informado permanece idêntico após regeneração", () => {
    const atual = { produtos_servicos: "Consultoria trimestral — R$397 em 3x" };
    const gerado = { produtos_servicos: "Consultoria trimestral a partir de R$ 297" };
    const { config, conflitos } = mergeGeneratedConfig(atual, gerado, FIELDS as any);
    expect(config.produtos_servicos).toBe(atual.produtos_servicos);
    expect(conflitos).toContain("produtos_servicos");
  });

  test("(b) URL informada permanece idêntica após regeneração", () => {
    const atual = { formas_pagamento: "Pix ou link: https://pay.pedrobahia.com/trimestral" };
    const gerado = { formas_pagamento: "Aceitamos Pix e cartão." };
    const { config } = mergeGeneratedConfig(atual, gerado, FIELDS as any);
    expect(config.formas_pagamento).toContain("https://pay.pedrobahia.com/trimestral");
    expect(extractLiterals(atual.formas_pagamento)).toContain("https://pay.pedrobahia.com/trimestral");
  });

  test("(b2) enriquecimento é aceito quando preserva os literais", () => {
    const atual = { formas_pagamento: "Pix R$397 — link https://pay.x.com/a" };
    const gerado = { formas_pagamento: "Pix R$397 (à vista) ou cartão em até 3x — link https://pay.x.com/a" };
    const { config, conflitos } = mergeGeneratedConfig(atual, gerado, FIELDS as any);
    expect(config.formas_pagamento).toBe(gerado.formas_pagamento);
    expect(conflitos).toHaveLength(0);
  });

  test("(c) política ausente vira [PENDENTE] e nunca política inventada", () => {
    const { config } = mergeGeneratedConfig({ politicas: "" }, { politicas: PENDENTE }, FIELDS as any);
    expect(config.politicas).toBe(PENDENTE);
    expect(config.politicas.toLowerCase()).not.toContain("7 dias");
  });

  test("(c2) valor gerado vazio não apaga política confirmada", () => {
    const atual = { politicas: "Cancelamento até 24h antes, sem multa." };
    const { config } = mergeGeneratedConfig(atual, { politicas: "" }, FIELDS as any);
    expect(config.politicas).toBe(atual.politicas);
  });

  test("(f) ao adicionar nova informação, campos anteriores continuam intactos", () => {
    const atual = {
      produtos_servicos: "Plano mensal R$197",
      politicas: "Sem multa de cancelamento.",
      sobre_empresa: "Assessoria de treino online.",
    };
    const gerado = { faq: "Pergunta: é online? / Resposta: sim, online." };
    const { config, conflitos } = mergeGeneratedConfig(atual, gerado, FIELDS as any);
    expect(config.produtos_servicos).toBe(atual.produtos_servicos);
    expect(config.politicas).toBe(atual.politicas);
    expect(config.sobre_empresa).toBe(atual.sobre_empresa);
    expect(config.faq).toBe(gerado.faq);
    expect(conflitos).toHaveLength(0);
  });
});

describe("modo manual do prompt", () => {
  const manual = "Você é a Rafa. Nunca prometa prazo. Preço do plano: R$397.";

  test("(d) prompt_custom é instrução EXTRA: soma-se aos dados estruturados", () => {
    const prompt = buildSystemPrompt(
      {
        prompt_custom: manual,
        nome_agente: "Rafa",
        nome_empresa: "Pedro Bahia",
        papel_objetivo: "Vender",
        estilo_comunicacao: "Direto",
        sobre_empresa: "Assessoria",
        produtos_servicos: "Plano mensal R$197",
        pode_fazer: "",
        nao_pode_fazer: "",
        telefone_transferencia: "",
        palavra_pausar: "/pausar",
        palavra_despausar: "/despausar",
      },
      { responderEmPartes: false },
    );
    expect(prompt).toContain(manual);
    // Nada estruturado é perdido quando o cliente escreve instruções próprias.
    expect(prompt).toContain("Plano mensal R$197");
    expect(prompt).toContain("Pedro Bahia");
    expect(prompt).toContain("PERSONALIDADE E ESTILO DE COMUNICAÇÃO");
    expect(isManualPromptMode(manual)).toBe(true);
  });


  test("(e) regeneração com prompt manual exige confirmação", () => {
    expect(requiresManualOverrideConfirm(manual)).toBe(true);
    expect(requiresManualOverrideConfirm("")).toBe(false);
    expect(requiresManualOverrideConfirm("   ")).toBe(false);
  });

  test("a geração nunca devolve prompt_custom", () => {
    const { config } = mergeGeneratedConfig(
      { prompt_custom: manual, politicas: "X" },
      { politicas: "X", prompt_custom: "texto da IA" } as any,
      FIELDS as any,
    );
    expect("prompt_custom" in config).toBe(false);
  });
});

describe("onboarding / entrevista", () => {
  const perguntas = [
    { id: "q_pagamento", campo: "formas_pagamento" },
    { id: "q_politica", campo: "politicas" },
    { id: "q_extra", campo: "extra" },
  ];

  test("(g) não pergunta de novo campo já preenchido", () => {
    const out = filterAnsweredQuestions(perguntas, {
      formas_pagamento: "Pix e cartão em 3x",
      politicas: "",
    });
    expect(out.map((q) => q.id)).toEqual(["q_politica", "q_extra"]);
  });

  test("(g2) campo salvo como [PENDENTE] continua sendo perguntado", () => {
    const out = filterAnsweredQuestions(perguntas, { formas_pagamento: PENDENTE });
    expect(out.map((q) => q.id)).toContain("q_pagamento");
  });

  test("(g3) pergunta já respondida na entrevista não repete", () => {
    const out = filterAnsweredQuestions(perguntas, {}, { q_extra: "resposta dada" });
    expect(out.map((q) => q.id)).toEqual(["q_pagamento", "q_politica"]);
  });
});

describe("prompt automático sem defaults comerciais", () => {
  test("objetivo ausente vira [PENDENTE], sem meta de venda inventada", () => {
    const prompt = buildSystemPrompt(
      {
        nome_agente: "Rafa",
        nome_empresa: "",
        papel_objetivo: "",
        estilo_comunicacao: "",
        sobre_empresa: "",
        produtos_servicos: "",
        pode_fazer: "",
        nao_pode_fazer: "",
        telefone_transferencia: "",
        palavra_pausar: "/pausar",
        palavra_despausar: "/despausar",
      },
      { responderEmPartes: false },
    );
    expect(prompt).toContain("[PENDENTE]");
    expect(prompt).not.toContain("ajudar a fechar a venda.");
    expect(prompt).toContain("NUNCA invente preço, prazo, política, estoque, endereço");
  });
});
