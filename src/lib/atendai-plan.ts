// Plano AtendAi: um único produto, três períodos. Fonte oficial = tabela `plan`
// (linhas atendai-mensal / atendai-trimestral / atendai-semestral).
import { supabase } from "@/integrations/supabase/client";

export type AtendaiPeriodo = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  periodo_meses: number;
  trial_days: number;
  destaque: boolean;
  limite_mensagens: number;
  limite_usuarios: number;
  limite_contatos: number;
  checkout_url: string | null;
};

export const DEFAULT_PERIODO_SLUG = "atendai-semestral";

export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function precoMensalEquivalente(p: { preco_cents: number; periodo_meses: number }) {
  return Math.round(p.preco_cents / Math.max(1, p.periodo_meses));
}

export function periodoResumo(p: { preco_cents: number; periodo_meses: number }) {
  if (p.periodo_meses <= 1) return "Cobrança mensal.";
  return `Pagamento referente a ${p.periodo_meses} meses. Equivalente a ${formatBRL(precoMensalEquivalente(p))} por mês.`;
}

export async function fetchAtendaiPeriodos(): Promise<AtendaiPeriodo[]> {
  const { data, error } = await supabase
    .from("plan")
    .select("id, slug, nome, descricao, preco_cents, periodo_meses, trial_days, destaque, limite_mensagens, limite_usuarios, limite_contatos, checkout_url")
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as AtendaiPeriodo[];
}
