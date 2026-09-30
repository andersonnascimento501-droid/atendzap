export type Locale = "pt-BR" | "es-ES";
export const LOCALES: Locale[] = ["pt-BR", "es-ES"];
export const DEFAULT_LOCALE: Locale = "pt-BR";

/** Nomes iniciais sugeridos pelo sistema (etapas/setores). Só usado na criação. */
const SEED_ES: Record<string, string> = {
  novo: "Nuevo", "em atendimento": "En atención", qualificado: "Cualificado", agendado: "Cita programada",
  perdido: "Perdido", ganho: "Ganado", proposta: "Propuesta", recepcao: "Recepción", agendamento: "Citas",
  financeiro: "Administración", suporte: "Soporte", responsavel: "Responsable", vendas: "Ventas",
};
export function seedName(locale: Locale, nome: string): string {
  if (locale !== "es-ES") return nome;
  const k = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return SEED_ES[k] ?? nome;
}

