import { describe, expect, it } from "bun:test";
import { buildSystemPrompt } from "../src/lib/ai-prompt";

const base = {
  nome_agente: "Rafa",
  nome_empresa: "Clínica X",
  papel_objetivo: "Atender e agendar",
  estilo_comunicacao: "Cordial",
  sobre_empresa: "Clínica de fisioterapia",
  produtos_servicos: "Sessões",
  pode_fazer: "Tirar dúvidas",
  nao_pode_fazer: "Não inventar preço",
  telefone_transferencia: "",
  palavra_pausar: "pausar",
  palavra_despausar: "voltar",
};

const REGRA = "quando o cliente pedir uma pessoa ou houver reclamação séria";

describe("regra de transferência para humano", () => {
  it("entra de forma afirmativa e ligada à tool transferir_humano", () => {
    const p = buildSystemPrompt({ ...base, quando_transferir: REGRA } as any);
    expect(p).toContain("QUANDO CHAMAR UMA PESSOA DO TIME");
    expect(p).toContain(REGRA);
    expect(p).toContain("transferir_humano");
    // a regra nunca pode aparecer dentro do bloco de proibições
    const proibicoes = p.slice(p.indexOf("O QUE VOCÊ NÃO PODE FAZER"), p.indexOf("QUANDO CHAMAR UMA PESSOA DO TIME"));
    expect(proibicoes).not.toContain(REGRA);
  });

  it("continua presente quando o cliente escreve prompt manual", () => {
    const p = buildSystemPrompt({ ...base, prompt_custom: "Fale como a Rafa.", quando_transferir: REGRA } as any);
    expect(p).toContain("Fale como a Rafa.");
    expect(p).toContain("QUANDO CHAMAR UMA PESSOA DO TIME");
    expect(p).toContain(REGRA);
  });

  it("sem regra definida, mantém um padrão afirmativo", () => {
    const p = buildSystemPrompt(base as any);
    expect(p).toContain("QUANDO CHAMAR UMA PESSOA DO TIME");
    expect(p).toContain("Transferir é PERMITIDO");
  });

  it("não sugere telefone quando a empresa não informou", () => {
    const p = buildSystemPrompt(base as any);
    expect(p).toContain("Nunca invente telefone");
  });
});
