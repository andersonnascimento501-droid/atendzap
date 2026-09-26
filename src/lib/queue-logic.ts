// Regras puras (testáveis) da fila de mensagens: contexto da IA e classificação de falhas de envio.

export type HistMsg = { id?: string; autor: string; direcao: string; texto: string; created_at: string; send_status?: string | null };
export type ChatMsg = { role: "user" | "assistant"; content: string };

export const HISTORY_LIMIT = 25;

/**
 * Monta o contexto: histórico ANTERIOR ao lote (até HISTORY_LIMIT, em ordem) + o lote
 * inteiro consolidado numa única mensagem do cliente, uma vez só.
 * Saídas de atendente humano são marcadas para a IA distinguir de si mesma.
 */
export function buildContextMessages(historyBeforeBatch: HistMsg[], batch: Array<{ id: string; texto: string }>): ChatMsg[] {
  const batchIds = new Set(batch.map((b) => b.id));
  const hist = historyBeforeBatch
    .filter((m) => !(m.id && batchIds.has(m.id)))
    .filter((m) => (m.texto || "").trim())
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-HISTORY_LIMIT)
    .map<ChatMsg>((m) =>
      m.direcao === "entrada"
        ? { role: "user", content: m.texto }
        : { role: "assistant", content: m.autor === "humano" ? `[Atendente humano] ${m.texto}` : m.texto },
    );
  const lote = batch.map((b) => (b.texto || "").trim()).filter(Boolean).join("\n");
  if (lote) hist.push({ role: "user", content: lote });
  return hist;
}

/**
 * true  => o provedor RESPONDEU recusando (HTTP 4xx) ou o canal nem está configurado: seguro reenviar depois.
 * false => falha de rede / 5xx / desconhecida: a mensagem PODE ter sido entregue. Não reenviar às cegas.
 */
export function isDefinitiveSendFailure(err: any): boolean {
  const status = Number(err?.providerStatus);
  if (Number.isFinite(status) && status >= 400 && status < 500) return true;
  const msg = String(err?.message ?? "");
  return /não conectado|não configurado/i.test(msg);
}
