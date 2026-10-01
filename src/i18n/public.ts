// Idioma das páginas públicas (sem conta): escolha salva no navegador → idioma do navegador → pt-BR.
import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "./resolve";

export const PUBLIC_LANG_KEY = "atendai_lang";

export function getPublicLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const saved = normalizeLocale(localStorage.getItem(PUBLIC_LANG_KEY));
    if (saved) return saved;
  } catch {}
  return (navigator.languages ?? []).map((l) => normalizeLocale(l)).find(Boolean) ?? DEFAULT_LOCALE;
}

export function setPublicLocale(l: Locale) {
  try { localStorage.setItem(PUBLIC_LANG_KEY, l); } catch {}
}

/** Leitura após hidratação (seguro em rotas com SSR). */
export function usePublicLocale(): Locale {
  const [l, setL] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => { setL(getPublicLocale()); }, []);
  return l;
}
