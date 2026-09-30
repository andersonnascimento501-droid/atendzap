export type Locale = "pt-BR" | "es-ES";
export const LOCALES: Locale[] = ["pt-BR", "es-ES"];
export const DEFAULT_LOCALE: Locale = "pt-BR";

export function normalizeLocale(v?: string | null): Locale | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "pt-br" || s === "pt") return "pt-BR";
  if (s === "es-es" || s === "es" || s.startsWith("es-")) return "es-ES";
  return null;
}

/** Prioridade: usuário → empresa → navegador → pt-BR. */
export function resolveLocale(input: { user?: string | null; company?: string | null; browser?: readonly string[] | string | null }): Locale {
  const browsers = Array.isArray(input.browser) ? input.browser : input.browser ? [input.browser as string] : [];
  return (
    normalizeLocale(input.user) ??
    normalizeLocale(input.company) ??
    browsers.map((b) => normalizeLocale(b)).find(Boolean) ??
    DEFAULT_LOCALE
  );
}

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

