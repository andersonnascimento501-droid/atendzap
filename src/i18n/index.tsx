import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ptBR } from "./pt-BR";
import { esES } from "./es-ES";

export type Locale = "pt-BR" | "es-ES";
export const LOCALES: Locale[] = ["pt-BR", "es-ES"];
export const DEFAULT_LOCALE: Locale = "pt-BR";

export type Dict = typeof ptBR;
export type TKey = keyof Dict;
const DICTS: Record<Locale, Dict> = { "pt-BR": ptBR, "es-ES": esES };

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

export function translate(locale: Locale, key: TKey, vars?: Record<string, string | number>): string {
  let s = DICTS[locale]?.[key] ?? ptBR[key] ?? String(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
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

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

export function useT() {
  const locale = useContext(Ctx);
  return useMemo(() => (key: TKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
}
