// Helpers puros (client-safe) do módulo de agente de IA.
// Regra do produto: o DONO é o proprietário das informações e do prompt.
// A geração automática só ESTRUTURA — nunca inventa, resume, substitui ou apaga
// informação já confirmada pelo usuário.

export const PENDENTE = "[PENDENTE]";

/** true quando o texto é vazio ou apenas o marcador de pendência. */
export function isPendingOrEmpty(v: unknown): boolean {
  const t = String(v ?? "").trim();
  return !t || t.toUpperCase() === PENDENTE || /^\[PENDENTE\b/i.test(t);
}

/** Literais que NUNCA podem ser perdidos: URLs, valores, telefones/chaves, percentuais. */
export function extractLiterals(text: string): string[] {
  const t = String(text ?? "");
  const out = new Set<string>();
  for (const m of t.match(/https?:\/\/[^\s)"'<>]+/gi) ?? []) out.add(m.replace(/[.,;]$/, ""));
  for (const m of t.match(/R\$\s?\d[\d.,]*/gi) ?? []) out.add(m.replace(/\s+/g, "").toUpperCase());
  for (const m of t.match(/\d[\d.,]*\s?%/g) ?? []) out.add(m.replace(/\s+/g, ""));
  for (const m of t.match(/\d[\d.\-/]{3,}\d/g) ?? []) out.add(m);
  return [...out];
}

function keepsAllLiterals(current: string, next: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  const target = norm(next);
  return extractLiterals(current).every((lit) => target.includes(norm(lit)));
}

export type MergeResult<T extends Record<string, any>> = {
  /** Config final: nunca perde informação confirmada. */
  config: T;
  /** Campos em que o valor novo conflita com o antigo — pendem de confirmação do usuário. */
  conflitos: string[];
};

/**
 * Mescla a saída da IA sobre a config atual de forma NÃO destrutiva:
 * - valor gerado vazio ou "[PENDENTE]" → mantém o valor atual;
 * - campo atual vazio → aceita o gerado;
 * - gerado preserva todos os literais (preços, links, telefones) do atual → aceita (enriquecimento);
 * - caso contrário → mantém o atual e registra conflito para o usuário confirmar.
 */
export function mergeGeneratedConfig<T extends Record<string, any>>(
  current: Partial<T> | null | undefined,
  generated: Partial<T>,
  fields: (keyof T & string)[],
): MergeResult<Record<string, string>> {
  const config: Record<string, string> = {};
  const conflitos: string[] = [];

  for (const key of fields) {
    const cur = String((current as any)?.[key] ?? "").trim();
    const gen = String((generated as any)?.[key] ?? "").trim();

    if (isPendingOrEmpty(gen)) {
      config[key] = cur || (isPendingOrEmpty(gen) && gen ? gen : "");
      continue;
    }
    if (!cur || isPendingOrEmpty(cur)) {
      config[key] = gen;
      continue;
    }
    if (cur === gen) {
      config[key] = cur;
      continue;
    }
    if (keepsAllLiterals(cur, gen)) {
      config[key] = gen;
      continue;
    }
    config[key] = cur;
    conflitos.push(key);
  }

  return { config, conflitos };
}

/** MODO MANUAL: prompt_custom preenchido tem prioridade absoluta. */
export function isManualPromptMode(promptCustom: unknown): boolean {
  return String(promptCustom ?? "").trim().length > 0;
}

/** Regeneração precisa de confirmação explícita quando existe prompt manual. */
export function requiresManualOverrideConfirm(promptCustom: unknown): boolean {
  return isManualPromptMode(promptCustom);
}

export const MANUAL_OVERRIDE_CONFIRM_MESSAGE =
  "Esta ação pode substituir alterações feitas manualmente. Deseja continuar?";

/**
 * Onboarding / entrevista: remove perguntas cujo campo já está preenchido
 * (na config salva ou nas respostas anteriores).
 */
export function filterAnsweredQuestions<Q extends { id: string; campo?: string }>(
  perguntas: Q[],
  preenchidos: Record<string, unknown>,
  respostas: Record<string, unknown> = {},
): Q[] {
  const filled = (v: unknown) => !isPendingOrEmpty(v);
  return (perguntas ?? []).filter((q) => {
    if (filled(respostas?.[q.id])) return false;
    const campo = q.campo && q.campo !== "extra" ? q.campo : null;
    if (campo && filled(preenchidos?.[campo])) return false;
    return true;
  });
}

/** Campos já preenchidos, em texto, para a IA não perguntar de novo. */
export function describeFilledFields(preenchidos: Record<string, unknown>): string {
  return Object.entries(preenchidos ?? {})
    .filter(([, v]) => !isPendingOrEmpty(v))
    .map(([k, v]) => `- ${k}: ${String(v).trim().slice(0, 400)}`)
    .join("\n");
}
