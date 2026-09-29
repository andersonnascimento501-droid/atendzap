// Modo de teste real pelo WhatsApp — regras puras (sem banco), usadas pelo webhook e pelo worker.

/** Normaliza para E.164 sem "+" (apenas dígitos). Aceita +, espaços, parênteses e traços. */
export function normalizeTestPhone(input: string | null | undefined): string | null {
  const raw = String(input ?? "").split("@")[0]!.split(":")[0]!;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`; // número brasileiro sem código do país
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

/** Variantes equivalentes: celulares brasileiros podem chegar com ou sem o 9º dígito. */
function variants(d: string): string[] {
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") return [d, d.slice(0, 4) + d.slice(5)];
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4]!)) return [d, d.slice(0, 4) + "9" + d.slice(4)];
  return [d];
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeTestPhone(a);
  const nb = normalizeTestPhone(b);
  if (!na || !nb) return false;
  const vb = new Set(variants(nb));
  return variants(na).some((v) => vb.has(v));
}

export type TestModeCompany = { agent_test_mode?: boolean | null; agent_test_phone?: string | null };

/** true => a IA pode atuar para este remetente. Modo de teste só vale para WhatsApp. */
export function testModeAllows(company: TestModeCompany | null | undefined, sender: string, channel: string): boolean {
  if (channel !== "whatsapp") return true;
  if (!company?.agent_test_mode) return true;
  return samePhone(sender, company.agent_test_phone);
}

export function phoneLast4(p: string | null | undefined): string {
  return String(p ?? "").replace(/\D/g, "").slice(-4);
}
