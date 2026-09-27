// Adaptador ÚNICO de IA da plataforma: OpenAI com a chave do servidor (OPENAI_API_KEY).
// O nome do arquivo e as assinaturas foram mantidos para não refatorar o resto do sistema.
// Valores antigos de provider/model/chave por empresa são IGNORADOS de propósito.
// Sem fallback para outro provedor: se a OpenAI falhar, o erro sobe com mensagem clara.

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Mantido por compatibilidade: todos os campos são ignorados. */
export interface AiProviderConfig {
  provider?: string;
  model?: string;
  openaiKey?: string;
  anthropicKey?: string;
}

export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export class AiUnavailableError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiUnavailableError";
    this.status = status;
  }
}

/** Chave da plataforma — lida apenas no servidor, em tempo de chamada. */
export function getPlatformOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AiUnavailableError("IA indisponível: OPENAI_API_KEY não configurada no servidor.");
  return key;
}

/** Modelo central da plataforma, configurável por variável de ambiente. */
export function getPlatformModel(kind: "chat" | "vision" | "audio" = "chat"): string {
  if (kind === "audio") return process.env.OPENAI_AUDIO_MODEL?.trim() || "gpt-4o-mini-transcribe";
  if (kind === "vision") return process.env.OPENAI_VISION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export async function openAiRequest(body: any): Promise<any> {
  const key = getPlatformOpenAiKey();
  let res: Response;
  try {
    res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    throw new AiUnavailableError(`IA indisponível (OpenAI sem resposta): ${e?.message ?? e}`);
  }
  if (!res.ok) {
    const t = (await res.text()).slice(0, 200);
    if (res.status === 429) throw new AiUnavailableError("IA ocupada no momento (limite da OpenAI). Tente em alguns minutos.", 429);
    if (res.status === 401) throw new AiUnavailableError("IA indisponível: chave OpenAI da plataforma inválida.", 401);
    throw new AiUnavailableError(`OpenAI ${res.status}: ${t}`, res.status);
  }
  return res.json();
}

export async function lovableAiChat(
  messages: ChatMsg[] | any[],
  _modelOrConfig?: string | AiProviderConfig,
): Promise<string> {
  const data = await openAiRequest({ model: getPlatformModel("chat"), messages });
  return data?.choices?.[0]?.message?.content?.toString().trim() || "";
}

// ============================================================================
// Tool calling (formato interno { text, toolCalls[] }). Regra de negócio fica no dispatcher.
// ============================================================================

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
}

export interface AgentMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolTurn {
  text: string;
  toolCalls: ToolCall[];
}

function toOpenAiMessages(messages: AgentMsg[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function parseOpenAiTurn(data: any): ToolTurn {
  const msg = data?.choices?.[0]?.message ?? {};
  const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  return {
    text: (msg.content ?? "").toString().trim(),
    toolCalls: calls.map((c: any, i: number) => {
      let args: any = {};
      try {
        args = c?.function?.arguments ? JSON.parse(c.function.arguments) : {};
      } catch {
        args = {};
      }
      return { id: c?.id || `call_${i}`, name: c?.function?.name || "", args };
    }),
  };
}

export async function aiTurnWithTools(
  messages: AgentMsg[],
  _modelOrConfig: string | AiProviderConfig | undefined,
  tools: ToolSpec[] = [],
): Promise<ToolTurn> {
  const body: any = { model: getPlatformModel("chat"), messages: toOpenAiMessages(messages) };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }
  return parseOpenAiTurn(await openAiRequest(body));
}
