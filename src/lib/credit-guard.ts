// Regras puras (testáveis) de cobrança/estorno e do checklist. Sem dependências de servidor.

export type ChargeDeps = {
  /** true se já existe cobrança desta ref ainda não estornada (retry da mesma solicitação). */
  alreadyCharged: (ref: string) => Promise<boolean>;
  consume: (ref: string) => Promise<boolean>;
  /** Estorno atômico/idempotente no banco (refund_ai_credit). */
  refund: (ref: string) => Promise<boolean>;
};

/** Cobra 1 crédito pela ref, executa `work`; em qualquer falha após a cobrança, estorna a mesma ref e relança o erro original. */
export async function withChargedCredit<T>(ref: string, deps: ChargeDeps, work: () => Promise<T>): Promise<T> {
  const reuse = await deps.alreadyCharged(ref);
  if (!reuse) {
    const ok = await deps.consume(ref);
    if (!ok) throw new Error("Seus créditos acabaram. Veja seu plano em /app/checkout.");
  }
  try {
    return await work();
  } catch (e) {
    try { await deps.refund(ref); } catch { /* erro original tem prioridade */ }
    throw e;
  }
}

/** Espelha refund_ai_credit_for_job: só marca estornado se devolveu agora ou o histórico comprova estorno anterior. */
export function shouldMarkRefunded(refundedNow: boolean, ledger: { charged: boolean; refunded: boolean }): boolean {
  if (refundedNow) return true;
  return ledger.charged && ledger.refunded;
}

/** Teste do agente é considerado realizado somente pelo campo salvo no banco. */
export function isAgentTested(company: { agent_tested_at?: string | null } | null | undefined): boolean {
  return !!company?.agent_tested_at;
}
