// Server-only: interpretação de mídia recebida no WhatsApp (áudio, imagem, documento).
// Converte cada mídia em TEXTO para seguir pelo mesmo pipeline de texto já existente.
// IA única: OpenAI com a chave da plataforma (OPENAI_API_KEY). Sem fallback para outro provedor.

import { getPlatformModel, getPlatformOpenAiKey, openAiRequest, AiUnavailableError } from "./lovable-ai.server";

export type MediaKind = "audio" | "image" | "document";

export type IncomingMedia = {
  kind: MediaKind;
  mimetype: string;
  fileName: string | null;
  caption: string | null;
};

/** Detecta mídia na mensagem crua da Evolution. Retorna null para texto puro. */
export function detectMedia(msg: any): IncomingMedia | null {
  if (!msg || typeof msg !== "object") return null;
  const audio = msg.audioMessage ?? msg.pttMessage;
  if (audio) {
    return { kind: "audio", mimetype: audio.mimetype || "audio/ogg", fileName: null, caption: null };
  }
  const image = msg.imageMessage;
  if (image) {
    return {
      kind: "image",
      mimetype: image.mimetype || "image/jpeg",
      fileName: null,
      caption: typeof image.caption === "string" && image.caption.trim() ? image.caption.trim() : null,
    };
  }
  const doc = msg.documentMessage ?? msg.documentWithCaptionMessage?.message?.documentMessage;
  if (doc) {
    return {
      kind: "document",
      mimetype: doc.mimetype || "application/octet-stream",
      fileName: doc.fileName || doc.title || null,
      caption: typeof doc.caption === "string" && doc.caption.trim() ? doc.caption.trim() : null,
    };
  }
  return null;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const clean = base64.includes("base64,") ? base64.split("base64,").pop()! : base64;
  const bin = atob(clean.replace(/\s/g, ""));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function extFromMime(mime: string) {
  const m = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3",
    "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav",
    "audio/webm": "webm", "audio/amr": "amr",
  };
  return map[m] || "ogg";
}

async function chat(content: any[], system: string): Promise<string> {
  const data = await openAiRequest({
    model: getPlatformModel("vision"),
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
  });
  return data?.choices?.[0]?.message?.content?.toString().trim() || "";
}

/** Transcreve áudio com a OpenAI da plataforma. */
export async function transcribeAudio(base64: string, mimetype: string, _legacyKey?: string): Promise<string> {
  const key = getPlatformOpenAiKey();
  const bytes = base64ToBytes(base64);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimetype.split(";")[0] }), `audio.${extFromMime(mimetype)}`);
  form.append("model", getPlatformModel("audio"));
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (e: any) {
    throw new AiUnavailableError(`Transcrição indisponível: ${e?.message ?? e}`);
  }
  if (!res.ok) throw new AiUnavailableError(`OpenAI áudio: ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
  const data: any = await res.json();
  return (data?.text ?? "").toString().trim();
}

/** Descreve uma imagem de forma objetiva e útil para o atendimento. */
export async function describeImage(base64: string, mimetype: string, caption: string | null, _legacyKey?: string): Promise<string> {
  const clean = base64.includes("base64,") ? base64.split("base64,").pop()! : base64;
  const dataUrl = `data:${mimetype.split(";")[0]};base64,${clean}`;
  const system =
    "Você analisa imagens enviadas por clientes no WhatsApp de uma empresa. " +
    "Descreva objetivamente o que a imagem contém, incluindo textos visíveis, valores, produtos, comprovantes ou documentos. " +
    "Seja curto (até 80 palavras) e factual, sem cumprimentar e sem falar com o cliente.";
  return chat(
    [
      { type: "text", text: caption ? `Legenda enviada pelo cliente: "${caption}". Descreva a imagem.` : "Descreva a imagem." },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
    system,
  );
}

const TEXTUAL_MIMES = ["text/", "application/json", "application/xml", "application/csv"];

export function isSupportedDocument(mimetype: string, fileName: string | null) {
  const m = (mimetype || "").split(";")[0].toLowerCase();
  if (m === "application/pdf") return true;
  if (TEXTUAL_MIMES.some((t) => m.startsWith(t))) return true;
  return /\.(pdf|txt|csv|md|json|xml)$/.test((fileName || "").toLowerCase());
}

/** Extrai/resume o conteúdo de um documento (PDF ou texto). */
export async function readDocument(
  base64: string,
  mimetype: string,
  fileName: string | null,
  caption: string | null,
  _legacyKey?: string,
): Promise<string> {
  const clean = base64.includes("base64,") ? base64.split("base64,").pop()! : base64;
  const mime = (mimetype || "application/pdf").split(";")[0];
  const system =
    "Você lê documentos enviados por clientes no WhatsApp. " +
    "Extraia o conteúdo relevante (dados, valores, datas, nomes, pedidos) em até 150 palavras, de forma factual. " +
    "Não fale com o cliente, apenas relate o conteúdo.";

  if (TEXTUAL_MIMES.some((t) => mime.startsWith(t))) {
    const text = new TextDecoder().decode(base64ToBytes(clean)).slice(0, 20000);
    return chat([{ type: "text", text: `Documento "${fileName ?? "arquivo"}"${caption ? ` (legenda: ${caption})` : ""}:\n\n${text}` }], system);
  }
  return chat(
    [
      { type: "text", text: `Leia o documento "${fileName ?? "arquivo.pdf"}"${caption ? ` (legenda do cliente: ${caption})` : ""} e relate o conteúdo.` },
      { type: "file", file: { filename: fileName || "documento.pdf", file_data: `data:${mime};base64,${clean}` } },
    ],
    system,
  );
}
