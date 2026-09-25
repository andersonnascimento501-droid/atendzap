import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "../src/lib/ai-prompt";
import { cleanGeneratedField } from "../src/lib/agent-ai.functions";
import { toReadableText } from "../src/lib/structured-text";

describe("serialização segura do prompt", () => {
  test("transforma todos os campos estruturados em texto legível", () => {
    const promptFinal = buildSystemPrompt(
      {
        nome_agente: "Rafa",
        nome_empresa: "Pedro Bahia",
        papel_objetivo: "Qualificar e orientar a contratação do plano adequado.",
        estilo_comunicacao: "Direto, acolhedor e uma pergunta por vez.",
        sobre_empresa: "Assessoria de treino online e presencial.",
        produtos_servicos: [
          { nome: "Consultoria trimestral", valor: "R$397", duracao: "90 dias" },
        ] as unknown as string,
        formas_pagamento: {
          cartao: "até 3x",
          pix: "R$397",
          link: "https://pay.pedrobahia.com/trimestral",
        } as unknown as string,
        objecoes: [{ objecao: "Está caro", resposta: "Explique o acompanhamento incluído." }] as unknown as string,
        faq: [{ pergunta: "É online?", resposta: "Há opção online ou presencial." }] as unknown as string,
        politicas: { cancelamento: "Conforme a condição informada na contratação." } as unknown as string,
        pode_fazer: "Consultar e gerenciar agendamentos pelas ferramentas reais.",
        nao_pode_fazer: "Não tratar comprovante como pagamento confirmado.",
        telefone_transferencia: "",
        palavra_pausar: "/pausar",
        palavra_despausar: "/despausar",
        como_vender: "1. Perguntar o objetivo.\n2. Saber se já treina ou está retornando.\n3. Perguntar frequência.\n4. Identificar dores ou limitações.\n5. Confirmar online ou presencial.\n6. Recomendar plano e orientar pagamento.",
        apresentacao: "Opa! Tudo bem? Me conta, qual é seu principal objetivo hoje com o treino? 💪",
        agendamento_ativo: true,
        perguntar_uma_por_vez: true,
      },
      {
        responderEmPartes: true,
        agendaTools: true,
        stages: [
          { nome: "Conversas", tipo: "normal" },
          { nome: "Negociando", tipo: "normal" },
          { nome: "Ganho", tipo: "ganho" },
          { nome: "Perda", tipo: "perda" },
        ],
      },
    );

    expect(promptFinal.includes("[object Object]")).toBe(false);
    expect(promptFinal).toContain("consultar_disponibilidade");
    expect(promptFinal).toContain("criar_agendamento");
    expect(promptFinal).toContain("consultar_agendamento");
    expect(promptFinal).toContain("reagendar_agendamento");
    expect(promptFinal).toContain("cancelar_agendamento");
    expect(promptFinal).toContain("[ESTAGIO: Conversas | Negociando | Ganho | Perda]");
  });

  test("não deixa marcador legado sobreviver dentro de estruturas", () => {
    expect(toReadableText({ produto: "[object Object]", valor: "R$397" })).toBe("Valor: R$397");
  });

  test("monta o fluxo real da consultoria sem ações genéricas nem ficha inventada", () => {
    const prompt = buildSystemPrompt({
      nome_agente: "Pedro",
      nome_empresa: "Consultoria Pedro Bahia",
      papel_objetivo: "Atender interessados, apresentar os planos e conduzir até o pagamento real.",
      estilo_comunicacao: "Próximo, seguro e profissional.",
      sobre_empresa: "Consultoria fitness online.",
      produtos_servicos: "Trimestral: R$397. Semestral: R$599.",
      formas_pagamento: "[PENDENTE] — dados de Pix e links de cartão ainda não cadastrados.",
      como_vender: "Novo contato → Entender objetivo principal → Apresentar a consultoria → Cliente escolheu → Enviar forma de pagamento correta → Aguardando pagamento → Confirmar pagamento REAL → Pago / ficha enviada → Encerrar atendimento comercial",
      posvenda_msg: "Após confirmação real, enviar a ficha inicial e encerrar o atendimento comercial.",
      pode_fazer: "Explicar a consultoria.",
      nao_pode_fazer: "Não inventar informações.",
      quando_transferir: "quando faltar uma informação necessária",
      telefone_transferencia: "",
      palavra_pausar: "/pausar",
      palavra_despausar: "/despausar",
    }, { materialsAvailable: false });

    expect(prompt).toContain("Consultoria Pedro Bahia");
    expect(prompt).toContain("Novo contato → Entender objetivo principal");
    expect(prompt).toContain("encerrar o atendimento comercial");
    expect(prompt).toContain("Não há ficha, formulário ou material cadastrado");
    expect(prompt).toContain("Nunca invente, deduza ou crie link de ficha");
    expect(prompt).toContain("transferir_humano");
    expect(prompt).not.toContain("agendar, enviar proposta, confirmar pedido, marcar visita");
    expect(prompt).not.toContain("Estilo de comunicação extra");
  });

  test("não cita fluxo definido quando o fluxo está vazio", () => {
    const prompt = buildSystemPrompt({
      nome_agente: "Ana", nome_empresa: "Empresa", papel_objetivo: "Atender",
      estilo_comunicacao: "Direto", sobre_empresa: "Serviços", produtos_servicos: "Serviço",
      pode_fazer: "Responder", nao_pode_fazer: "Inventar", telefone_transferencia: "",
      palavra_pausar: "/pausar", palavra_despausar: "/despausar", como_vender: "",
    });
    expect(prompt).not.toContain("FLUXO COMERCIAL DEFINIDO PELA EMPRESA");
    expect(prompt).toContain("Não existe fluxo comercial confirmado");
  });

  test("remove texto editorial do objetivo gerado", () => {
    expect(cleanGeneratedField(
      "papel_objetivo",
      "Para preencher esses campos do atendimento do Pedro, eu colocaria assim:\nO que ele precisa fazer no atendimento?\nAtender leads e conduzir ao pagamento.",
    )).toBe("Atender leads e conduzir ao pagamento.");
  });
});
describe("empresa e idioma no prompt", () => {
  test("company é a fonte oficial do nome e entra com os dados cadastrais", () => {
    const prompt = buildSystemPrompt(
      { nome_agente: "Lia", nome_empresa: "Empresa de nordestehiper", papel_objetivo: "Atender" },
      {
        company: {
          nome: "Consultoria Pedro Bahia",
          telefone: "(71) 99999-0000",
          cidade: "Salvador",
          estado: "BA",
        },
      },
    );
    expect(prompt).toContain("Consultoria Pedro Bahia");
    expect(prompt).not.toContain("Empresa de nordestehiper");
    expect(prompt).toContain("(71) 99999-0000");
    expect(prompt).toContain("Salvador");
  });

  test("idioma configurado é respeitado", () => {
    const prompt = buildSystemPrompt({ nome_agente: "Lia", idioma: "es" }, {});
    expect(prompt).toContain("Espanhol");
    expect(prompt).not.toContain("SEMPRE em Português do Brasil");
  });
});
