// Checklist operacional (dashboard + Assistente AtendAi). Puro e client-safe.

export type ChecklistInput = {
  whatsappConectado: boolean;
  agenteAtivo: boolean;
  agenteConfigurado: boolean;
  testeRealizado: boolean;
  etapasFunil: number;
  horariosConfigurados: boolean;
  agendaAtiva: boolean;
  agendaConfigurada: boolean;
  followupAtivo: boolean;
  followupConfigurado: boolean;
  transferenciaDisponivel: boolean;
};

export type ChecklistItem = { id: string; label: string; ok: boolean; to: string; opcional: boolean };

export const TESTE_FLAG_KEY = (companyId: string) => `atendai:testado:${companyId}`;

export function buildChecklist(i: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { id: "whatsapp", label: "WhatsApp conectado", ok: i.whatsappConectado, to: "/app/conexao", opcional: false },
    { id: "agente", label: "Atendente configurado e ativo", ok: i.agenteConfigurado && i.agenteAtivo, to: "/app/agente", opcional: false },
    { id: "teste", label: "Teste do atendente realizado", ok: i.testeRealizado, to: "/app/agente", opcional: true },
    { id: "funil", label: "Funil com etapas", ok: i.etapasFunil > 0, to: "/app/crm", opcional: false },
    { id: "horarios", label: "Horários de atendimento configurados", ok: i.horariosConfigurados, to: "/app/configuracoes", opcional: true },
    { id: "transferencia", label: "Transferência para humano definida", ok: i.transferenciaDisponivel, to: "/app/agente", opcional: false },
  ];
  if (i.agendaAtiva) items.push({ id: "agenda", label: "Agenda configurada", ok: i.agendaConfigurada, to: "/app/agenda", opcional: true });
  if (i.followupAtivo) items.push({ id: "followup", label: "Follow-up configurado", ok: i.followupConfigurado, to: "/app/agente", opcional: true });
  return items;
}
