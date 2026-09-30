import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ptBR } from "./pt-BR";
import { esES } from "./es-ES";

export * from "./resolve";
import { DEFAULT_LOCALE, type Locale } from "./resolve";

export type Dict = typeof ptBR;
export type TKey = keyof Dict;
const DICTS: Record<Locale, Dict> = { "pt-BR": ptBR, "es-ES": esES };

export function translate(locale: Locale, key: TKey, vars?: Record<string, string | number>): string {
  let s = DICTS[locale]?.[key] ?? ptBR[key] ?? String(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
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
