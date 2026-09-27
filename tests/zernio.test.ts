import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import {
  verifyZernioSignature,
  hmacSha256Hex,
  parseZernioInbound,
  eventAccount,
  zernioMessageKey,
  isSafeMediaUrl,
  redact,
  zernioDefinitiveStatus,
} from "../src/lib/zernio-logic";
import { isDefinitiveSendFailure } from "../src/lib/queue-logic";

process.env["INTEGRATIONS_ENCRYPTION_KEY"] = "t".repeat(64);

// ---------- Fake genérico do cliente Supabase (tabelas em memória, filtros eq/neq/not/in)
function fakeDb(tables: Record<string, any[]>, opts: { uniqueOn?: Record<string, string[]> } = {}) {
  const log: any[] = [];
  const db: any = {
    tables,
    log,
    rpc: async (name: string, args: any) => {
      log.push({ rpc: name, args });
      return { data: true, error: null };
    },
    from(table: string) {
      const rows = (tables[table] ??= []);
      let filters: Array<(r: any) => boolean> = [];
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: any = null;
      let orderDesc = false;
      const q: any = {
        select: () => q,
        insert: (p: any) => ((op = "insert"), (payload = p), q),
        update: (p: any) => ((op = "update"), (payload = p), q),
        upsert: (p: any) => ((op = "upsert"), (payload = p), q),
        eq: (k: string, v: any) => (filters.push((r) => r[k] === v), q),
        neq: (k: string, v: any) => (filters.push((r) => r[k] !== v), q),
        in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), q),
        not: (k: string, _o: string, _v: any) => (filters.push((r) => r[k] != null), q),
        or: () => q,
        order: (_k: string, o?: any) => ((orderDesc = !!o && o.ascending === false), q),
        limit: () => q,
        maybeSingle: () => run(true),
        then: (res: any, rej: any) => run(false).then(res, rej),
      };
      const run = async (single: boolean) => {
        const match = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "insert") {
          const uniq = opts.uniqueOn?.[table] ?? [];
          if (uniq.length && payload[uniq[1]!] != null && rows.some((r) => uniq.every((k) => r[k] === payload[k]))) {
            return { data: null, error: { code: "23505", message: "duplicate" } };
          }
          const row = { id: `id${rows.length + 1}`, created_at: new Date(Date.now() + rows.length).toISOString(), ...payload };
          rows.push(row);
          log.push({ insert: table, row });
          return { data: row, error: null };
        }
        if (op === "update") {
          match.forEach((r) => Object.assign(r, payload));
          log.push({ update: table, payload, n: match.length });
          return { data: null, error: null };
        }
        if (op === "upsert") {
          const ex = rows.find((r) => r.company_id === payload.company_id);
          if (ex) Object.assign(ex, payload);
          else rows.push({ ...payload });
          return { data: null, error: null };
        }
        const sorted = orderDesc ? [...match].reverse() : match;
        return { data: single ? sorted[0] ?? null : sorted, error: null };
      };
      return q;
    },
  };
  return db;
}

// ---------- fetch simulado
const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: any }> = [];
function mockFetch(handler: (url: string, init: any) => { status: number; body?: any }) {
  calls = [];
  (globalThis as any).fetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = handler(String(url), init);
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
  };
}
afterEach(() => {
  (globalThis as any).fetch = realFetch;
});

const KEY_A = "zk_live_AAAAAAAAAAAAAAAAAAAAAAAA";
const KEY_B = "zk_live_BBBBBBBBBBBBBBBBBBBBBBBB";

function inbound(overrides: any = {}) {
  return {
    id: "evt-1",
    event: "message.received",
    message: {
      id: "msg-1",
      conversationId: "conv-1",
      platform: "instagram",
      platformMessageId: "mid.1",
      direction: "incoming",
      text: "Oi!",
      attachments: [],
      sender: { id: "IGSID123", name: "Ana" },
      sentAt: "2026-09-27T10:00:00Z",
      ...(overrides.message ?? {}),
    },
    conversation: { id: "conv-1", platformConversationId: "IGSID123", status: "active" },
    account: { id: "acc-A", accountId: "acc-A", platform: "instagram", username: "loja", profileId: "prof-A", ...(overrides.account ?? {}) },
    timestamp: "2026-09-27T10:00:01Z",
  };
}

describe("Zernio — chave e criptografia", () => {
  test("T4: valor persistido não é a chave em texto puro e volta ao original", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/lib/secret-box.server");
    const box = await encryptSecret(KEY_A);
    expect(box).not.toContain(KEY_A);
    expect(box.startsWith("v1:")).toBe(true);
    expect(await decryptSecret(box)).toBe(KEY_A);
    // adulteração é detectada
    expect(await decryptSecret(box.slice(0, -4) + "AAAA")).toBeNull();
  });

  test("T20: sem chave de criptografia do servidor, salvar é recusado", async () => {
    const { encryptSecret } = await import("../src/lib/secret-box.server");
    const saved = process.env["INTEGRATIONS_ENCRYPTION_KEY"];
    delete process.env["INTEGRATIONS_ENCRYPTION_KEY"];
    await expect(encryptSecret(KEY_A)).rejects.toThrow(/Criptografia do servidor/);
    process.env["INTEGRATIONS_ENCRYPTION_KEY"] = saved;
    const fns = readFileSync("src/lib/zernio.functions.ts", "utf8");
    // a verificação acontece antes de qualquer gravação
    expect(fns.indexOf('await encryptSecret("probe")')).toBeLessThan(fns.indexOf('from("instagram_zernio").upsert'));
    expect(readFileSync("src/lib/secret-box.server.ts", "utf8")).not.toContain(`process.env["SUPABASE_SERVICE_ROLE_KEY"]`);
  });

  test("T2: chave inválida é recusada pela Zernio e nada é salvo", async () => {
    mockFetch(() => ({ status: 401, body: { error: "Invalid API key" } }));
    const { zernioListProfiles, isAuthError } = await import("../src/lib/zernio.server");
    const err = await zernioListProfiles(KEY_A).catch((e) => e);
    expect(isAuthError(err)).toBe(true);
    const fns = readFileSync("src/lib/zernio.functions.ts", "utf8");
    const save = fns.slice(fns.indexOf("export const zernioSaveKey"), fns.indexOf("export const zernioListProfilesFn"));
    // validação na Zernio acontece ANTES do upsert
    expect(save.indexOf("zernioListProfiles(data.apiKey)")).toBeLessThan(save.indexOf(".upsert("));
  });

  test("T3: chave nunca aparece em respostas nem em mensagens de erro", async () => {
    mockFetch(() => ({ status: 500, body: { message: `falhou com Bearer ${KEY_A} e ${KEY_A}` } }));
    const { zernioListProfiles } = await import("../src/lib/zernio.server");
    const err: any = await zernioListProfiles(KEY_A).catch((e) => e);
    expect(String(err.message)).not.toContain(KEY_A);
    expect(redact(`x ${KEY_A} y`, [KEY_A])).toBe("x [oculto] y");
    const fns = readFileSync("src/lib/zernio.functions.ts", "utf8");
    const pub = fns.slice(fns.indexOf("function publicStatus"), fns.indexOf("export const getZernioStatus"));
    for (const f of ["api_key_enc:", "webhook_secret_enc:", "account_id:", "profile_id:", "webhook_token:"]) expect(pub).not.toContain(f);
    // tabela sem acesso do navegador
    const mig = readFileSync("drizzle/migrations/0011_instagram_zernio_provider.sql", "utf8");
    expect(mig).toMatch(/REVOKE ALL ON public\.instagram_zernio FROM anon, authenticated/);
    expect(mig).not.toMatch(/GRANT[^;]*instagram_zernio[^;]*authenticated/);
  });

  test("T1: empresa B não lê nem usa a chave da empresa A", async () => {
    const { encryptSecret } = await import("../src/lib/secret-box.server");
    const db = fakeDb({
      instagram_integration: [
        { company_id: "A", instagram_provider: "zernio", conectado: true, user_id: "uA" },
        { company_id: "B", instagram_provider: "zernio", conectado: true, user_id: "uB" },
      ],
      instagram_zernio: [
        { company_id: "A", api_key_enc: await encryptSecret(KEY_A), account_id: "acc-A", status: "conectado" },
        { company_id: "B", api_key_enc: await encryptSecret(KEY_B), account_id: "acc-B", status: "conectado" },
      ],
      mensagens: [],
    });
    const { resolveChannelTarget } = await import("../src/lib/channels.server");
    const tB = await resolveChannelTarget(db, "B", "ig:X");
    expect(tB.zernio?.apiKey).toBe(KEY_B);
    expect(tB.zernio?.accountId).toBe("acc-B");
    const tC = await resolveChannelTarget(db, "C", "ig:X");
    expect(tC.ready).toBe(false);
    expect(tC.zernio ?? null).toBeNull();
  });
});

describe("Zernio — perfis e autorização", () => {
  test("T5/T6: lista só os perfis da chave e recusa profileId de outra conta", async () => {
    mockFetch((url, init) => {
      const auth = init.headers.Authorization;
      return { status: 200, body: { profiles: auth.includes("AAAA") ? [{ _id: "prof-A", name: "Loja A" }] : [{ _id: "prof-B", name: "Loja B" }] } };
    });
    const { zernioListProfiles } = await import("../src/lib/zernio.server");
    const a = await zernioListProfiles(KEY_A);
    expect(a.map((p) => p.id)).toEqual(["prof-A"]);
    expect(a.find((p) => p.id === "prof-B")).toBeUndefined();
    expect(calls[0]!.url.startsWith("https://zernio.com/api/v1/profiles")).toBe(true);
    const fns = readFileSync("src/lib/zernio.functions.ts", "utf8");
    expect(fns).toContain("Este perfil não pertence à sua conta da Zernio.");
  });

  test("T7: retorno da autorização é confirmado consultando a Zernio", async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        accounts: [
          { _id: "acc-A", platform: "instagram", profileId: "prof-A", username: "loja", isActive: true },
          { _id: "acc-X", platform: "instagram", profileId: "prof-OUTRO", username: "outra", isActive: true },
          { _id: "acc-F", platform: "facebook", profileId: "prof-A", isActive: true },
        ],
      },
    }));
    const { zernioListInstagramAccounts } = await import("../src/lib/zernio.server");
    const list = await zernioListInstagramAccounts(KEY_A, "prof-A");
    expect(list.map((x) => x.id)).toEqual(["acc-A"]);
    expect(calls[0]!.url).toContain("profileId=prof-A");
    const fns = readFileSync("src/lib/zernio.functions.ts", "utf8");
    const confirm = fns.slice(fns.indexOf("export const zernioConfirmConnection"), fns.indexOf("export const zernioVerify"));
    expect(confirm).toContain("zernioListInstagramAccounts(key, row.profile_id)");
    expect(confirm).toContain("accounts.find((x) => x.id === data.accountId)");
  });
});

describe("Zernio — webhook", () => {
  test("T8: assinatura inválida é recusada; válida é aceita", async () => {
    const raw = JSON.stringify(inbound());
    const good = await hmacSha256Hex("segredo", raw);
    expect(await verifyZernioSignature("segredo", raw, good)).toBe(true);
    expect(await verifyZernioSignature("segredo", raw, "00" + good.slice(2))).toBe(false);
    expect(await verifyZernioSignature("segredo", raw + " ", good)).toBe(false);
    expect(await verifyZernioSignature(null, raw, good)).toBe(false);
    expect(await verifyZernioSignature("segredo", raw, null)).toBe(false);
    const hook = readFileSync("src/routes/api/public/zernio-webhook.$token.ts", "utf8");
    // assinatura verificada antes de qualquer gravação/enfileiramento
    expect(hook.indexOf("verifyZernioSignature(secret, raw, sig)")).toBeLessThan(hook.indexOf("ingestInstagramInbound(admin"));
    expect(hook.indexOf("verifyZernioSignature(secret, raw, sig)")).toBeLessThan(hook.indexOf('.update({ send_status'));
  });

  test("T9: evento de outra conta não entra na empresa", () => {
    const hook = readFileSync("src/routes/api/public/zernio-webhook.$token.ts", "utf8");
    expect(hook).toContain("acc.accountId !== (z as any).account_id");
    expect(eventAccount(inbound({ account: { id: "acc-OUTRA", accountId: "acc-OUTRA" } })).accountId).toBe("acc-OUTRA");
    // empresa vem do token, nunca do payload
    expect(hook).toContain('.eq("webhook_token", token)');
    expect(hook).not.toMatch(/payload\??\.company_id/);
  });

  test("T10/T11: mensagem válida salva 1x e cria 1 job; reentrega não duplica", async () => {
    const db = fakeDb({ mensagens: [], crm_cards: [], agent_config: [] }, { uniqueOn: { mensagens: ["company_id", "whatsapp_message_id"] } });
    const { ingestInstagramInbound } = await import("../src/lib/instagram-ingest.server");
    const msg = parseZernioInbound(inbound())!;
    const input = {
      companyId: "A",
      userId: "uA",
      contactId: `ig:${msg.senderId}`,
      externalMessageId: zernioMessageKey(msg.accountId, msg.messageId),
      text: msg.text,
      media: null,
      providerConversationId: msg.conversationId,
    };
    expect(await ingestInstagramInbound(db, input)).toBe("queued");
    expect(await ingestInstagramInbound(db, input)).toBe("duplicate");
    expect(db.tables.mensagens.length).toBe(1);
    expect(db.tables.mensagens[0].whatsapp_message_id).toBe("zernio:acc-A:msg-1");
    expect(db.tables.mensagens[0].numero).toBe("ig:IGSID123");
    expect(db.tables.mensagens[0].provider_conversation_id).toBe("conv-1");
    // mq_enqueue é 1 job por conversa (idempotente); crédito/resposta só no worker
    expect(db.log.filter((l: any) => l.rpc === "mq_enqueue").every((l: any) => l.args._numero === "ig:IGSID123")).toBe(true);
  });

  test("T12: mensagem enviada (eco) não dispara a IA", () => {
    expect(parseZernioInbound(inbound({ message: { direction: "outgoing" } }))).toBeNull();
    expect(parseZernioInbound({ ...inbound(), event: "message.sent" })).toBeNull();
    expect(parseZernioInbound(inbound({ account: { platform: "facebook" } }))).toBeNull();
  });
});

describe("Zernio — envio", () => {
  async function target() {
    const { encryptSecret } = await import("../src/lib/secret-box.server");
    const db = fakeDb({
      instagram_integration: [{ company_id: "A", instagram_provider: "zernio", conectado: true, user_id: "uA" }],
      instagram_zernio: [{ company_id: "A", api_key_enc: await encryptSecret(KEY_A), account_id: "acc-A", status: "conectado" }],
      mensagens: [{ company_id: "A", numero: "ig:IGSID123", provider_conversation_id: "conv-1", created_at: "2026-01-01" }],
    });
    const { resolveChannelTarget } = await import("../src/lib/channels.server");
    return resolveChannelTarget(db, "A", "ig:IGSID123");
  }

  test("T13: texto usa a chave e a conversa corretas", async () => {
    const t = await target();
    mockFetch(() => ({ status: 200, body: { success: true, data: { messageId: "mid.out" } } }));
    const { sendChannelText } = await import("../src/lib/channels.server");
    const r = await sendChannelText(t, "Olá", { idempotencyKey: "job:1:0" });
    expect(r.message_id).toBe("mid.out");
    expect(calls[0]!.url).toBe("https://zernio.com/api/v1/inbox/conversations/conv-1/messages");
    expect(calls[0]!.init.headers.Authorization).toBe(`Bearer ${KEY_A}`);
    expect(calls[0]!.init.headers["Idempotency-Key"]).toBe("job:1:0");
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ accountId: "acc-A", message: "Olá" });
  });

  test("T14: imagem, vídeo e áudio saem pelo mesmo caminho", async () => {
    const t = await target();
    mockFetch(() => ({ status: 200, body: { success: true, data: { messageId: "m" } } }));
    const { sendChannelMedia } = await import("../src/lib/channels.server");
    for (const kind of ["image", "video", "audio"] as const) {
      await sendChannelMedia(t, { kind, url: "https://files.example.com/a" });
    }
    expect(calls.map((c) => JSON.parse(c.init.body).attachmentType)).toEqual(["image", "video", "audio"]);
    expect(calls.every((c) => c.url.endsWith("/conversations/conv-1/messages"))).toBe(true);
  });

  test("T15: falha incerta não é tratada como definitiva (sem reenvio)", async () => {
    const t = await target();
    const { sendChannelText } = await import("../src/lib/channels.server");
    (globalThis as any).fetch = async () => {
      throw new Error("socket hang up");
    };
    const netErr = await sendChannelText(t, "x").catch((e) => e);
    expect(isDefinitiveSendFailure(netErr)).toBe(false);
    mockFetch(() => ({ status: 409, body: { error: "processing" } }));
    const busy = await sendChannelText(t, "x").catch((e) => e);
    expect(isDefinitiveSendFailure(busy)).toBe(false);
    expect(zernioDefinitiveStatus(400)).toBe(true);
    expect(zernioDefinitiveStatus(500)).toBe(false);
  });
});

describe("Zernio — convivência com a Meta", () => {
  test("T16: Meta continua resolvendo, recebendo e enviando como antes", async () => {
    const db = fakeDb({ instagram_integration: [{ company_id: "A", conectado: true, page_access_token: "EAAtoken", user_id: "uA", instagram_provider: "meta" }] });
    const { resolveChannelTarget } = await import("../src/lib/channels.server");
    const t = await resolveChannelTarget(db, "A", "ig:1");
    expect(t.provider).toBe("meta");
    expect(t.token).toBe("EAAtoken");
    expect(t.ready).toBe(true);
    const igHook = readFileSync("src/routes/api/public/instagram-webhook.ts", "utf8");
    expect(igHook).toContain("x-hub-signature-256");
    expect(igHook).toContain("ingestInstagramInbound(supabaseAdmin");
  });

  test("T17: mesma conta não fica ativa por Meta e Zernio ao mesmo tempo", () => {
    const igHook = readFileSync("src/routes/api/public/instagram-webhook.ts", "utf8");
    expect(igHook).toContain('instagram_provider === "zernio") continue');
    const zHook = readFileSync("src/routes/api/public/zernio-webhook.$token.ts", "utf8");
    expect(zHook).toContain('instagram_provider !== "zernio"');
    const mig = readFileSync("drizzle/migrations/0011_instagram_zernio_provider.sql", "utf8");
    expect(mig).toContain("CHECK (instagram_provider IN ('meta','zernio'))");
    expect(mig).toMatch(/instagram_zernio_account_uniq[\s\S]*account_id/);
  });

  test("T18: trocar de provedor preserva mensagens, contatos e cards", () => {
    const all = ["src/lib/zernio.functions.ts", "src/lib/instagram.functions.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).not.toMatch(/from\("(mensagens|crm_cards|contact_pause)"\)\s*\.delete/);
    const mig = readFileSync("drizzle/migrations/0011_instagram_zernio_provider.sql", "utf8");
    expect(mig).toContain("DEFAULT 'meta'"); // registros existentes continuam Meta
  });

  test("T19: desconectar a Zernio bloqueia novos envios e preserva histórico", async () => {
    const db = fakeDb({
      instagram_integration: [{ company_id: "A", instagram_provider: "zernio", conectado: false, user_id: "uA" }],
      instagram_zernio: [{ company_id: "A", api_key_enc: "v1:x:y", account_id: null, status: "desconectado" }],
    });
    const { resolveChannelTarget, sendChannelText } = await import("../src/lib/channels.server");
    const t = await resolveChannelTarget(db, "A", "ig:1");
    expect(t.ready).toBe(false);
    await expect(sendChannelText(t, "x")).rejects.toThrow(/não conectado/);
  });

  test("mídia: bloqueia hosts internos e http", () => {
    expect(isSafeMediaUrl("https://scontent.cdninstagram.com/x.jpg")).toBe(true);
    expect(isSafeMediaUrl("http://scontent.cdninstagram.com/x.jpg")).toBe(false);
    expect(isSafeMediaUrl("https://127.0.0.1/x")).toBe(false);
    expect(isSafeMediaUrl("https://10.0.0.5/x")).toBe(false);
    expect(isSafeMediaUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isSafeMediaUrl("https://localhost/x")).toBe(false);
    expect(isSafeMediaUrl("https://[::1]/x")).toBe(false);
  });
});
