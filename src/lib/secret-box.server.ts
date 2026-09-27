// Criptografia autenticada (AES-256-GCM) para segredos de integrações por empresa.
// Server-only. Usa WebCrypto (disponível no runtime do servidor e no Node).
// A chave vem de INTEGRATIONS_ENCRYPTION_KEY — exclusiva para isso; NUNCA reutiliza
// SUPABASE_SERVICE_ROLE_KEY. Sem a chave, recusa (sem fallback inseguro).

const PREFIX = "v1";

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("Criptografia do servidor não configurada. Não foi possível salvar a chave com segurança.");
  }
}

function readKeyMaterial(): string {
  const raw = (process.env["INTEGRATIONS_ENCRYPTION_KEY"] || "").trim();
  if (raw.length < 32) throw new MissingEncryptionKeyError();
  return raw;
}

async function importKey(material: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(plain: string): Promise<string> {
  if (!plain) throw new Error("Segredo vazio.");
  const key = await importKey(readKeyMaterial());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  return `${PREFIX}:${toB64(iv)}:${toB64(ct)}`;
}

export async function decryptSecret(box: string | null | undefined): Promise<string | null> {
  if (!box) return null;
  const [v, ivB64, ctB64] = String(box).split(":");
  if (v !== PREFIX || !ivB64 || !ctB64) return null;
  const key = await importKey(readKeyMaterial());
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) as BufferSource },
      key,
      fromB64(ctB64) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null; // adulterado ou chave trocada
  }
}

/** Token aleatório forte (hex). */
export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
