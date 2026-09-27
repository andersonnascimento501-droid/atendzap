// Destinos fixos de transferência (client-safe). A IA só pode usar estes valores.
export const SETORES_DESTINO = ["Recepção", "Comercial", "Agendamento", "Financeiro", "Suporte", "Responsável"] as const;
export type SetorDestino = (typeof SETORES_DESTINO)[number];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Normaliza o valor enviado pela IA; qualquer coisa fora da lista vira null. */
export function normalizeSetor(v: unknown): SetorDestino | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = norm(v);
  return SETORES_DESTINO.find((s) => norm(s) === n) ?? null;
}
