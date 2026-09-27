// Dados fictícios do modo demonstração público (/demo/*). NÃO acessa o banco,
// não envia mensagens e não chama IA. Todas as telas da demo leem daqui para
// contar a mesma história.
//
// DATAS RELATIVAS: tudo é calculado a partir de `demoNow` (hora atual
// arredondada para a hora cheia, para o servidor e o navegador gerarem o mesmo
// valor). Assim a demonstração nunca fica com datas antigas.
export const demoCompany = {
  nome: "Clínica Vitalis",
  segmento: "Estética & Bem-estar",
  primary_color: "#7C3AED",
};

const HOUR = 3600000;
const DAY = 86400000;
const SP_OFFSET_H = 3; // America/Sao_Paulo = UTC-3 (sem horário de verão)

export const demoNow = Math.floor(Date.now() / HOUR) * HOUR;
/** há N minutos */
export const minutosAtras = (min: number) => new Date(demoNow - min * 60000);
/** há N horas */
export const horasAtras = (h: number) => new Date(demoNow - h * HOUR);
/** há N dias (mesmo horário) */
export const diasAtras = (days: number) => new Date(demoNow - days * DAY);
/** daqui a N dias, no horário de São Paulo "HH:MM" (ex.: emDias(1, "15:00") = amanhã às 15h) */
export function emDias(days: number, hhmm: string): Date {
  const sp = new Date(demoNow - SP_OFFSET_H * HOUR + days * DAY);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), h + SP_OFFSET_H, mi));
}
/** Texto curto para datas: "hoje 15:00", "amanhã 10:00", "sex., 03/10 16:00". */
export function rotuloData(d: Date): string {
  const tz = "America/Sao_Paulo";
  const dia = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: tz });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const hoje = new Date(demoNow);
  if (dia(d) === dia(hoje)) return `hoje ${hora}`;
  if (dia(d) === dia(new Date(demoNow + DAY))) return `amanhã ${hora}`;
  if (dia(d) === dia(new Date(demoNow - DAY))) return `ontem ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: tz })} ${hora}`;
}
const m = minutosAtras;
const d = diasAtras;

// Setores permitidos pelo produto real (src/lib/setores.ts).
export type DemoSetor = "Recepção" | "Comercial" | "Agendamento" | "Financeiro" | "Suporte" | "Responsável";

export type DemoMsg = {
  id: string; numero: string; nome: string;
  direcao: "entrada" | "saida"; autor: "ia" | "humano" | "contato";
  texto: string; quando: Date;
  /** Marcador de sistema exibido na conversa (lembrete, follow-up, transferência). */
  sistema?: string;
};

// Números claramente fictícios (faixa 90000-00xx).
const C = {
  mariana: { numero: "5511900000001", nome: "Mariana Costa" },
  juliana: { numero: "5511900000002", nome: "Juliana Almeida" },
  rafael: { numero: "5511900000003", nome: "Rafael Tavares" },
  camila: { numero: "5511900000004", nome: "Camila Ribeiro" },
  beatriz: { numero: "5511900000005", nome: "Beatriz Souza" },
  patricia: { numero: "5511900000006", nome: "Patrícia Rocha" },
  leticia: { numero: "5511900000007", nome: "Letícia Moreira" },
  fernanda: { numero: "5511900000008", nome: "Fernanda Lima" },
};

// Agendamentos (fonte única para Dashboard, Agenda, Conversas e CRM).
export type DemoAgenda = {
  id: string; numero: string; cliente: string; procedimento: string; profissional: string;
  quando: Date; status: "confirmado" | "cancelado"; nota?: string;
};
export const demoAgendamentos: DemoAgenda[] = [
  { id: "ag1", numero: C.mariana.numero, cliente: C.mariana.nome, procedimento: "Limpeza de pele profunda", profissional: "Dra. Helena", quando: emDias(1, "15:00"), status: "confirmado", nota: "Agendado pela IA · lembrete 24h antes" },
  { id: "ag2", numero: C.juliana.numero, cliente: C.juliana.nome, procedimento: "Avaliação de drenagem linfática", profissional: "Esteticista Paula", quando: emDias(3, "10:00"), status: "confirmado", nota: "Reagendado pela IA (antes: amanhã 10:00)" },
  { id: "ag3", numero: C.patricia.numero, cliente: C.patricia.nome, procedimento: "Avaliação de peeling", profissional: "Dra. Helena", quando: emDias(2, "16:00"), status: "cancelado", nota: "Cancelado pela cliente via WhatsApp" },
];
const ag = (id: string) => demoAgendamentos.find((a) => a.id === id)!;
/** Agendamentos futuros confirmados, em ordem. */
export const demoProximosAgendamentos = demoAgendamentos
  .filter((a) => a.status === "confirmado" && +a.quando > demoNow)
  .sort((a, b) => +a.quando - +b.quando);

export const demoMensagens: DemoMsg[] = [
  // Mariana — atendimento inicial → preço cadastrado → agendamento → lembrete
  { id: "1", ...C.mariana, direcao: "entrada", autor: "contato", texto: "Oi! Vocês fazem limpeza de pele?", quando: m(95) },
  { id: "2", ...C.mariana, direcao: "saida", autor: "ia", texto: "Oi, Mariana! Aqui é a Vivi, da Clínica Vitalis 💜 Fazemos sim. A limpeza de pele profunda custa R$ 280 e dura cerca de 60 minutos. Quer agendar?", quando: m(94) },
  { id: "3", ...C.mariana, direcao: "entrada", autor: "contato", texto: "Quero! Tem amanhã à tarde?", quando: m(90) },
  { id: "4", ...C.mariana, direcao: "saida", autor: "ia", texto: `Tenho ${rotuloData(ag("ag1").quando)} com a Dra. Helena. Posso confirmar?`, quando: m(89) },
  { id: "5", ...C.mariana, direcao: "entrada", autor: "contato", texto: "Pode confirmar 💜", quando: m(85) },
  { id: "6", ...C.mariana, direcao: "saida", autor: "ia", texto: `Prontinho! Limpeza de pele confirmada para ${rotuloData(ag("ag1").quando)}. Vou te mandar um lembrete um dia antes ✨`, quando: m(84), sistema: "Agendamento criado · lembrete 24h programado" },

  // Juliana — reagendamento
  { id: "7", ...C.juliana, direcao: "entrada", autor: "contato", texto: "Oi, tenho avaliação de drenagem amanhã às 10h, mas não vou conseguir ir. Dá pra remarcar?", quando: m(180) },
  { id: "8", ...C.juliana, direcao: "saida", autor: "ia", texto: "Claro, Juliana! Tenho horários livres nos próximos dias. Qual dia fica melhor pra você?", quando: m(179) },
  { id: "9", ...C.juliana, direcao: "entrada", autor: "contato", texto: `Pode ser ${rotuloData(ag("ag2").quando).split(" ")[0]} no mesmo horário?`, quando: m(170) },
  { id: "10", ...C.juliana, direcao: "saida", autor: "ia", texto: `Remarquei para ${rotuloData(ag("ag2").quando)} com a Esteticista Paula. Qualquer coisa é só chamar 💜`, quando: m(169), sistema: "Agendamento reagendado" },

  // Rafael — qualificação → follow-up → respondeu (follow-up interrompido)
  { id: "11", ...C.rafael, direcao: "entrada", autor: "contato", texto: "Vocês fazem botox?", quando: d(2) },
  { id: "12", ...C.rafael, direcao: "saida", autor: "ia", texto: "Fazemos, Rafael! A aplicação é a partir de R$ 1.200 e começa com uma avaliação com a Dra. Helena, que indica o que faz sentido pra você. É sua primeira vez?", quando: d(2) },
  { id: "13", ...C.rafael, direcao: "entrada", autor: "contato", texto: "Primeira vez. Vou pensar e retorno.", quando: d(2) },
  { id: "14", ...C.rafael, direcao: "saida", autor: "ia", texto: "Oi, Rafael! Passando pra saber se ficou alguma dúvida sobre a avaliação de botox 😊", quando: d(1), sistema: "Follow-up automático · etapa 1" },
  { id: "15", ...C.rafael, direcao: "entrada", autor: "contato", texto: "Ficou sim, dá pra parcelar?", quando: m(40), sistema: "Contato respondeu · follow-up interrompido" },
  { id: "16", ...C.rafael, direcao: "saida", autor: "ia", texto: "Dá sim: no cartão em até 12x. Quer que eu veja um horário de avaliação pra você?", quando: m(39) },

  // Camila — fora do escopo (perda), sem inventar serviço
  { id: "17", ...C.camila, direcao: "entrada", autor: "contato", texto: "Vocês fazem cirurgia plástica?", quando: d(1) },
  { id: "18", ...C.camila, direcao: "saida", autor: "ia", texto: "Não fazemos cirurgias, Camila. Trabalhamos só com procedimentos estéticos não invasivos, como limpeza de pele e drenagem. Posso te ajudar com algum deles?", quando: d(1) },
  { id: "19", ...C.camila, direcao: "entrada", autor: "contato", texto: "Não, obrigada.", quando: d(1) },

  // Beatriz — negociação → transferência para o Comercial
  { id: "20", ...C.beatriz, direcao: "entrada", autor: "contato", texto: "Quero depilação a laser de axilas e virilha. Quanto fica?", quando: m(150) },
  { id: "21", ...C.beatriz, direcao: "saida", autor: "ia", texto: "O pacote de 8 sessões de axilas + virilha custa R$ 2.400, em até 12x no cartão.", quando: m(149) },
  { id: "22", ...C.beatriz, direcao: "entrada", autor: "contato", texto: "Consigo um valor melhor se fechar dois pacotes, pra mim e pra minha irmã?", quando: m(60) },
  { id: "23", ...C.beatriz, direcao: "saida", autor: "ia", texto: "Boa pergunta! Condições para mais de um pacote quem define é nossa equipe comercial. Já passei seu pedido pra eles, tá? Em breve alguém te responde por aqui 💜", quando: m(59), sistema: "Transferido para Comercial · IA pausada" },

  // Patrícia — cancelamento → follow-up de retomada programado
  { id: "24", ...C.patricia, direcao: "entrada", autor: "contato", texto: "Preciso cancelar minha avaliação de peeling, surgiu um imprevisto.", quando: m(220) },
  { id: "25", ...C.patricia, direcao: "saida", autor: "ia", texto: "Tudo bem, Patrícia, cancelei sua avaliação. Quando quiser remarcar, é só me chamar por aqui 💜", quando: m(219), sistema: "Agendamento cancelado · follow-up de retomada programado" },

  // Letícia — pergunta de saúde → sem diagnóstico → transferida para Responsável
  { id: "26", ...C.leticia, direcao: "entrada", autor: "contato", texto: "Estou grávida de 4 meses, posso fazer harmonização facial?", quando: m(25) },
  { id: "27", ...C.leticia, direcao: "saida", autor: "ia", texto: "Obrigada por avisar, Letícia! Essa avaliação precisa ser feita pela nossa responsável técnica, então não consigo te orientar por aqui. Já encaminhei sua mensagem pra ela 💜", quando: m(24), sistema: "Transferido para Responsável · IA pausada" },

  // Fernanda — atendimento inicial e qualificação em andamento
  { id: "28", ...C.fernanda, direcao: "entrada", autor: "contato", texto: "Oi, boa tarde! Queria saber mais sobre os tratamentos de vocês.", quando: m(15) },
  { id: "29", ...C.fernanda, direcao: "saida", autor: "ia", texto: "Oi, Fernanda! Aqui é a Vivi, da Clínica Vitalis 💜 Você procura algo para o rosto ou para o corpo?", quando: m(14) },
  { id: "30", ...C.fernanda, direcao: "entrada", autor: "contato", texto: "Pro rosto, tenho manchas.", quando: m(10) },
  { id: "31", ...C.fernanda, direcao: "saida", autor: "ia", texto: "Entendi! Para manchas, o primeiro passo é uma avaliação com a Dra. Helena, que indica o tratamento certo pra sua pele. Quer que eu veja um horário?", quando: m(9) },
];

export type DemoCard = {
  id: string; numero: string; nome: string;
  status: "conversas" | "negociando" | "ganho" | "perda";
  interesse: string;
  ultima_mensagem: string; ultima_em: Date;
  valor?: number; observacao?: string; tags?: string[];
  /** Transferência (custom_data.setor_destino no produto real). */
  setor_destino?: DemoSetor; transfer_motivo?: string; transfer_resumo?: string;
  precisa_humano?: boolean;
  proxima_acao?: string; follow_up?: Date;
  agendamento?: Date;
};

const last = (numero: string) =>
  [...demoMensagens].filter((x) => x.numero === numero).sort((a, b) => +b.quando - +a.quando)[0];
const card = (c: Omit<DemoCard, "ultima_mensagem" | "ultima_em">): DemoCard => {
  const l = last(c.numero);
  return { ...c, ultima_mensagem: l.texto, ultima_em: l.quando };
};

export const demoCards: DemoCard[] = [
  card({ id: "c1", ...C.mariana, status: "ganho", interesse: "Limpeza de pele", valor: 280, agendamento: ag("ag1").quando, observacao: "Limpeza de pele profunda com Dra. Helena.", tags: ["facial"], proxima_acao: "Lembrete 24h antes (automático)", follow_up: new Date(+ag("ag1").quando - DAY) }),
  card({ id: "c2", ...C.juliana, status: "ganho", interesse: "Drenagem linfática", valor: 1890, agendamento: ag("ag2").quando, observacao: "Avaliação para pacote de 10 sessões. Reagendada pela IA.", tags: ["corporal", "pacote"], proxima_acao: "Lembrete 24h antes (automático)", follow_up: new Date(+ag("ag2").quando - DAY) }),
  card({ id: "c3", ...C.rafael, status: "negociando", interesse: "Botox", valor: 1200, observacao: "Primeira vez. Respondeu ao follow-up perguntando sobre parcelamento.", tags: ["botox"], proxima_acao: "Oferecer horário de avaliação" }),
  card({ id: "c4", ...C.camila, status: "perda", interesse: "Cirurgia plástica", observacao: "Procurava cirurgia (não atendemos).", tags: ["fora-escopo"] }),
  card({ id: "c5", ...C.beatriz, status: "negociando", interesse: "Depilação a laser", valor: 2400, tags: ["laser", "pacote"], setor_destino: "Comercial", precisa_humano: true, transfer_motivo: "Pediu condição especial para dois pacotes", transfer_resumo: "Quer pacote de 8 sessões axilas + virilha (R$ 2.400) para ela e a irmã. Pergunta se há valor melhor para 2 pacotes." }),
  card({ id: "c6", ...C.patricia, status: "conversas", interesse: "Peeling", observacao: "Cancelou a avaliação por imprevisto.", tags: ["retomar"], proxima_acao: "Follow-up de retomada", follow_up: emDias(2, "10:00") }),
  card({ id: "c7", ...C.leticia, status: "conversas", interesse: "Harmonização facial", tags: ["harmonizacao"], setor_destino: "Responsável", precisa_humano: true, transfer_motivo: "Pergunta de saúde (gestante) — IA não orienta", transfer_resumo: "Gestante de 4 meses perguntando se pode fazer harmonização facial. Precisa de orientação da responsável técnica." }),
  card({ id: "c8", ...C.fernanda, status: "conversas", interesse: "Manchas no rosto", tags: ["facial", "novo"], proxima_acao: "IA oferecendo avaliação" }),
];

const hojeSP = new Date(demoNow).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const ehHoje = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === hojeSP;

export const demoStats = {
  conversas: demoCards.filter((c) => c.status === "conversas").length,
  negociando: demoCards.filter((c) => c.status === "negociando").length,
  ganho: demoCards.filter((c) => c.status === "ganho").length,
  perda: demoCards.filter((c) => c.status === "perda").length,
  /** contatos com mensagem recebida hoje */
  conversasHoje: new Set(demoMensagens.filter((x) => x.direcao === "entrada" && ehHoje(x.quando)).map((x) => x.numero)).size,
  /** respostas da IA hoje */
  respostasIaHoje: demoMensagens.filter((x) => x.autor === "ia" && ehHoje(x.quando)).length,
  /** qualificados = em negociação ou agendados */
  qualificados: demoCards.filter((c) => c.status === "negociando" || c.status === "ganho").length,
  aguardandoHumano: demoCards.filter((c) => c.precisa_humano).length,
  proximosAgendamentos: demoProximosAgendamentos.length,
  valorAgendado: demoCards.filter((c) => c.status === "ganho").reduce((a, c) => a + (c.valor ?? 0), 0),
};

// Follow-ups e lembretes (representação do que o produto já faz).
export type DemoFollowup = {
  id: string; nome: string; tipo: string; quando: Date;
  status: "programado" | "enviado" | "interrompido";
  detalhe: string;
};
export const demoFollowups: DemoFollowup[] = [
  { id: "f1", nome: C.mariana.nome, tipo: "Lembrete de compromisso", quando: new Date(+ag("ag1").quando - DAY), status: "programado", detalhe: "24h antes da limpeza de pele" },
  { id: "f2", nome: C.juliana.nome, tipo: "Confirmação de agendamento", quando: new Date(+ag("ag2").quando - DAY), status: "programado", detalhe: "Pede confirmação 24h antes" },
  { id: "f3", nome: C.patricia.nome, tipo: "Retomada de contato", quando: emDias(2, "10:00"), status: "programado", detalhe: "Após cancelamento da avaliação" },
  { id: "f4", nome: C.rafael.nome, tipo: "Acompanhamento de proposta", quando: d(1), status: "interrompido", detalhe: "Contato respondeu — sequência parada" },
];

export const demoAgentConfig = {
  nome_agente: "Vivi (assistente da Vitalis)",
  nome_empresa: "Clínica Vitalis",
  papel_objetivo: "Atender clientes no WhatsApp, tirar dúvidas de procedimentos, qualificar contatos e agendar avaliações.",
  estilo_comunicacao: "Acolhedor, elegante e profissional. Usa emojis com moderação (💜 ✨).",
  sobre_empresa: "Clínica fictícia de estética e bem-estar em São Paulo. Equipe dermato + esteticistas. Foco em pele, corpo e harmonização.",
  produtos_servicos: "Limpeza de pele, botox, preenchimento, harmonização facial, drenagem linfática, depilação a laser, peeling.",
  pode_fazer: "Informar procedimentos e preços cadastrados, agendar, reagendar e cancelar avaliações.",
  nao_pode_fazer: "Não diagnostica, não prescreve, não promete resultado, não oferece desconto não cadastrado.",
  telefone_transferencia: "+55 11 90000-0000",
  palavra_pausar: "/pausar",
  palavra_despausar: "/despausar",
};

// ===== Campanhas =====
// Status por destinatário existentes no produto: enviado, incerto, falhou, pulado.
export type DemoCampanha = {
  id: string; nome: string; status: "rascunho" | "agendada" | "enviando" | "concluida";
  segmento: string; quando: Date; total: number; enviados: number; incertos: number; falharam: number; pulados: number;
};
export const demoCampanhas: DemoCampanha[] = [
  { id: "cmp1", nome: "Novidade: avaliação de manchas", status: "concluida", segmento: "Tag: facial · com autorização", quando: diasAtras(6), total: 48, enviados: 44, incertos: 1, falharam: 1, pulados: 2 },
  { id: "cmp2", nome: "Retomada de clientes sem visita há 90 dias", status: "concluida", segmento: "Etapa: Perda · com autorização", quando: diasAtras(2), total: 31, enviados: 29, incertos: 0, falharam: 1, pulados: 1 },
  { id: "cmp3", nome: "Horários extras de drenagem", status: "agendada", segmento: "Tag: corporal · com autorização", quando: emDias(1, "10:00"), total: 22, enviados: 0, incertos: 0, falharam: 0, pulados: 0 },
  { id: "cmp4", nome: "Aniversariantes do mês", status: "rascunho", segmento: "Lista importada · com autorização", quando: emDias(7, "09:00"), total: 18, enviados: 0, incertos: 0, falharam: 0, pulados: 0 },
];

// ===== Templates (Fase 1) =====
export type DemoTemplate = { id: string; atalho: string; titulo: string; conteudo: string };
export const demoTemplates: DemoTemplate[] = [
  { id: "t1", atalho: "/precos", titulo: "Tabela de preços", conteudo: "Olá! Segue nossa tabela:\n• Limpeza de pele — R$ 280\n• Botox — a partir de R$ 1.200\n• Drenagem (10 sessões) — R$ 1.890\n• Laser axilas+virilha (8x) — R$ 2.400\n\nQuer agendar uma avaliação? 💜" },
  { id: "t2", atalho: "/endereco", titulo: "Endereço da clínica", conteudo: "Estamos na Rua Exemplo, 100 — São Paulo/SP (endereço fictício de demonstração). 📍" },
  { id: "t3", atalho: "/horario", titulo: "Horário de atendimento", conteudo: "Funcionamos seg a sex 9h-20h e sáb 9h-15h. Atendimento só com hora marcada. ✨" },
  { id: "t4", atalho: "/pix", titulo: "Pagamento Pix", conteudo: "Aceitamos Pix, cartão e dinheiro. A chave Pix é enviada pela recepção na confirmação." },
  { id: "t5", atalho: "/preparo-laser", titulo: "Preparo p/ laser", conteudo: "Pra sessão de laser:\n1) Não se depilar 30 dias antes (só raspar)\n2) Sem sol nos 7 dias prévios\n3) Vir sem hidratante na região\n\nDúvida? Me chama!" },
];

// ===== Horários (Fase 1) =====
export type DemoHora = { dia: string; ativo: boolean; abre: string; fecha: string };
export const demoHorarios: DemoHora[] = [
  { dia: "Segunda", ativo: true, abre: "09:00", fecha: "20:00" },
  { dia: "Terça", ativo: true, abre: "09:00", fecha: "20:00" },
  { dia: "Quarta", ativo: true, abre: "09:00", fecha: "20:00" },
  { dia: "Quinta", ativo: true, abre: "09:00", fecha: "20:00" },
  { dia: "Sexta", ativo: true, abre: "09:00", fecha: "20:00" },
  { dia: "Sábado", ativo: true, abre: "09:00", fecha: "15:00" },
  { dia: "Domingo", ativo: false, abre: "09:00", fecha: "18:00" },
];
export const demoMsgForaHorario = "Oi! Recebemos sua mensagem 💜 Nossa equipe responde de seg a sex 9h-20h e sáb até 15h. Já já te chamamos!";

// ===== CSAT (Fase 3) =====
export type DemoCsat = { id: string; nome: string; score: number; comentario?: string; quando: Date };
export const demoCsat: DemoCsat[] = [
  { id: "s1", nome: "Mariana Costa", score: 5, comentario: "Atendimento perfeito, a Vivi me ajudou super rápido!", quando: m(120) },
  { id: "s2", nome: "Juliana Almeida", score: 5, comentario: "Adorei a estrutura, recomendo.", quando: d(1) },
  { id: "s3", nome: "Patrícia Rocha", score: 4, quando: d(2) },
  { id: "s4", nome: "Beatriz Souza", score: 5, comentario: "Equipe nota 10 💜", quando: d(3) },
  { id: "s5", nome: "Rafael Tavares", score: 3, comentario: "Queria um horário no domingo, mas entendi que não abrem.", quando: d(4) },
];

// ===== Audit log (Fase 5) =====
export type DemoAudit = { id: string; acao: string; recurso?: string; actor: string; quando: Date };
export const demoAuditLog: DemoAudit[] = [
  { id: "a1", acao: "config.update", recurso: "business_hours", actor: "ana@clinicavitalis.com.br", quando: m(15) },
  { id: "a2", acao: "template.create", recurso: "/preparo-laser", actor: "ana@clinicavitalis.com.br", quando: m(60) },
  { id: "a3", acao: "campaign.send", recurso: "Reativação clientes inativos 90d", actor: "helena@clinicavitalis.com.br", quando: d(3) },
  { id: "a4", acao: "user.invite", recurso: "recepcao@clinicavitalis.com.br", actor: "ana@clinicavitalis.com.br", quando: d(5) },
  { id: "a5", acao: "contact.export", actor: "ana@clinicavitalis.com.br", quando: d(7) },
  { id: "a6", acao: "agent.update", recurso: "Vivi", actor: "ana@clinicavitalis.com.br", quando: d(10) },
];

// ===== Webhooks (Fase 4) =====
export type DemoWebhook = { id: string; url: string; eventos: string[]; ativo: boolean; ultimo: Date };
export const demoWebhooks: DemoWebhook[] = [
  { id: "w1", url: "https://exemplo.com/webhooks/crm", eventos: ["lead.created", "csat.responded"], ativo: true, ultimo: m(30) },
  { id: "w2", url: "https://exemplo.com/webhooks/vitalis", eventos: ["message.received"], ativo: true, ultimo: m(120) },
];

// ===== API tokens (Fase 4) =====
export type DemoToken = { id: string; nome: string; prefixo: string; criado: Date; ultimoUso?: Date };
export const demoTokens: DemoToken[] = [
  { id: "tk1", nome: "Integração CRM", prefixo: "azp_live_4F7•••••KQ2", criado: d(45), ultimoUso: m(5) },
  { id: "tk2", nome: "Zapier", prefixo: "azp_live_9B2•••••XT8", criado: d(20), ultimoUso: m(180) },
];

