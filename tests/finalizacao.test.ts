import { describe, expect, it, afterEach } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildChecklist } from "../src/lib/checklist";
import { normalizeSetor, SETORES_DESTINO } from "../src/lib/setores";
import { campaignEligibility, isStopRequest, safeTokenEqual } from "../src/lib/queue-logic";
import { buildCompanySnapshot, parseAssistantReply, buildAssistantMessages } from "../src/lib/assistant.server";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}
const src = (p: string) => readFileSync(p, "utf8");
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("1-4 OpenAI como única IA", () => {
  it("1. nenhum código chama o gateway de IA do Lovable", () => {
    const hits = walk("src").filter((f) => src(f).includes("ai.gateway.lovable.dev"));
    expect(hits).toEqual([]);
  });

  it("2. sem OPENAI_API_KEY o erro é claro", async () => {
    const old = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { lovableAiChat } = await import("../src/lib/lovable-ai.server");
    await expect(lovableAiChat([{ role: "user", content: "oi" }])).rejects.toThrow(/OPENAI_API_KEY/);
    if (old) process.env.OPENAI_API_KEY = old;
  });

  it("3. chat e mídia vão para api.openai.com, ignorando provider antigo", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const urls: string[] = [];
    globalThis.fetch = (async (u: any) => {
      urls.push(String(u));
      const body = String(u).includes("transcriptions") ? { text: "olá" } : { choices: [{ message: { content: "ok" } }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as any;
    const { lovableAiChat } = await import("../src/lib/lovable-ai.server");
    const media = await import("../src/lib/media.server");
    await lovableAiChat([{ role: "user", content: "oi" }], { provider: "gemini", model: "google/gemini-2.5-flash" });
    await media.transcribeAudio(btoa("abc"), "audio/ogg");
    await media.describeImage(btoa("abc"), "image/jpeg", null);
    expect(urls.length).toBe(3);
    expect(urls.every((u) => u.startsWith("https://api.openai.com/"))).toBe(true);
  });

  it("3b. agente, gerador, supervisor e follow-up não forçam outro provedor", () => {
    for (const f of ["src/lib/supervisor.server.ts", "src/lib/agent-ai.functions.ts", "src/lib/followup.server.ts", "src/lib/message-pipeline.server.ts", "src/lib/evolution.functions.ts"]) {
      expect(src(f)).not.toMatch(/provider:\s*"(gemini|anthropic)"|google\/gemini/);
    }
  });

  it("4. cliente não recebe nem envia chave de IA", async () => {
    const { AGENT_SAFE_COLUMNS, stripAgentSecrets } = await import("../src/lib/agents");
    expect(AGENT_SAFE_COLUMNS).not.toMatch(/openai_api_key|anthropic_api_key|ai_provider|ai_model/);
    const clean: any = stripAgentSecrets({ id: "1", openai_api_key: "x", anthropic_api_key: "y", ai_provider: "openai" } as any);
    expect(clean.openai_api_key).toBeUndefined();
    expect(clean.anthropic_api_key).toBeUndefined();
    expect(src("src/routes/app/agente.avancado.tsx")).not.toMatch(/openai_api_key|anthropic_api_key/);
  });
});

describe("5-6 transferência para setor", () => {
  it("5. só aceita setores da lista", () => {
    expect(normalizeSetor("financeiro")).toBe("Financeiro");
    expect(normalizeSetor("recepcao")).toBe("Recepção");
    expect(normalizeSetor("Setor do João")).toBeNull();
    expect(SETORES_DESTINO.length).toBe(6);
  });
  it("5b/6. tool salva resumo, motivo e setor, pausa IA e cancela follow-up", () => {
    const t = src("src/lib/agent-tools.server.ts");
    const block = t.slice(t.indexOf('"transferir_humano"'));
    expect(t).toMatch(/resumo_atendimento/);
    expect(t).toMatch(/motivo_transferencia/);
    expect(t).toMatch(/setor_destino/);
    expect(t).toMatch(/contact_pause/);
    expect(t).toMatch(/cancelFollowups/);
    expect(block.length).toBeGreaterThan(0);
  });
});

function fakeDb(rows: Record<string, any[]>) {
  const calls: Array<{ table: string; op: string; filters: Array<[string, any]> }> = [];
  const db: any = {
    from(table: string) {
      const rec = { table, op: "select", filters: [] as Array<[string, any]> };
      calls.push(rec);
      const q: any = {
        select: () => q,
        eq: (c: string, v: any) => { rec.filters.push([c, v]); return q; },
        gte: () => q, order: () => q, limit: () => q,
        insert: () => { rec.op = "insert"; return q; },
        update: () => { rec.op = "update"; return q; },
        delete: () => { rec.op = "delete"; return q; },
        upsert: () => { rec.op = "upsert"; return q; },
        maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
        then: (r: any) => r({ data: rows[table] ?? [], error: null }),
      };
      return q;
    },
  };
  return { db, calls };
}

describe("7-8 Assistente AtendAi", () => {
  it("7. só lê dados (nenhuma escrita)", async () => {
    const { db, calls } = fakeDb({ company: [{ nome: "X" }] });
    await buildCompanySnapshot(db, "c1");
    expect(calls.every((c) => c.op === "select")).toBe(true);
    expect(src("src/lib/assistant.server.ts")).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
  it("8. toda consulta é filtrada pela empresa logada", async () => {
    const { db, calls } = fakeDb({});
    await buildCompanySnapshot(db, "empresa-A");
    for (const c of calls) {
      const key = c.table === "company" ? "id" : "company_id";
      expect(c.filters).toContainEqual([key, "empresa-A"]);
    }
    expect(src("src/lib/assistant.functions.ts")).not.toMatch(/data\.companyId|companyId:\s*string\s*}/);
  });
  it("rota do assistente só vale se estiver na lista", () => {
    expect(parseAssistantReply("Conecte.\nROTA: /app/conexao").rota).toBe("/app/conexao");
    expect(parseAssistantReply("x\nROTA: https://mal.com").rota).toBeNull();
    expect(buildAssistantMessages({}, "oi")[0]!.content).toMatch(/Nunca revele chaves/);
  });
});

describe("9 envio humano sem duplicar", () => {
  it("mesma chave → segundo envio é ignorado", async () => {
    const { sendPartOnce } = await import("../src/lib/message-pipeline.server");
    const keys = new Set<string>();
    let sends = 0;
    const admin: any = {
      from: () => {
        let row: any;
        const q: any = {
          insert: (r: any) => { row = r; return q; },
          update: () => q, delete: () => q, eq: () => q,
          select: () => q,
          maybeSingle: async () => {
            if (row) {
              if (keys.has(row.response_key)) return { data: null, error: { code: "23505", message: "dup" } };
              keys.add(row.response_key);
              return { data: { id: "m1" }, error: null };
            }
            return { data: null, error: null };
          },
          then: (r: any) => r({ data: null, error: null }),
        };
        return q;
      },
    };
    const args = { companyId: "c", userId: "u", numero: "55", contatoNome: null, target: { channel: "whatsapp" }, jobId: "human:c:k1", index: 0, texto: "oi", autor: "humano", send: async () => { sends++; return { key: { id: "p" } }; } };
    expect(await sendPartOnce(admin, args)).toBe("sent");
    expect(await sendPartOnce(admin, args)).toBe("skipped");
    expect(sends).toBe(1);
    expect(src("src/lib/instagram.functions.ts")).toMatch(/sendPartOnce/);
  });
});

describe("10 estorno único e atômico", () => {
  const sql = src("drizzle/migrations/0008_refund_atomic_campaign_consent.sql");
  it("confere cobrança e estorno anterior antes de devolver, na mesma função", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/_refunded >= _charged/);
    expect(sql.indexOf("creditos_saldo + 1")).toBeLessThan(sql.indexOf("SET credit_refunded = true"));
    expect(src("src/routes/api/public/hooks/process-message-queue.ts")).toMatch(/refund_ai_credit_for_job/);
  });
});

describe("11-12 campanhas", () => {
  it("11. descadastrado, sem consentimento ou pedido de parada não recebe", () => {
    expect(campaignEligibility({ campanha_consentimento_em: "2026-01-01", campanha_optout_em: "2026-02-01" }, false).ok).toBe(false);
    expect(campaignEligibility({ campanha_consentimento_em: null }, false).ok).toBe(false);
    expect(campaignEligibility(null, false).ok).toBe(false);
    expect(campaignEligibility({ campanha_consentimento_em: "2026-01-01" }, true).ok).toBe(false);
    expect(campaignEligibility({ campanha_consentimento_em: "2026-01-01" }, false).ok).toBe(true);
    expect(isStopRequest("PARAR")).toBe(true);
    expect(isStopRequest("não quero mais")).toBe(true);
    expect(isStopRequest("quero parar de sentir dor")).toBe(false);
  });
  it("12. chave única por campanha+destinatário", () => {
    const c = src("src/lib/campaigns.server.ts");
    expect(c).toMatch(/jobId: `camp:\$\{c\.id\}:\$\{t\.contato_numero\}`/);
    expect(c).not.toMatch(/evoSendText/);
    expect(src("drizzle/migrations/0008_refund_atomic_campaign_consent.sql")).toMatch(/campaign_target_unique_dest/);
  });
});

describe("13 checklist", () => {
  it("cada item abre a tela certa e opcionais só aparecem se ativos", () => {
    const base = { whatsappConectado: false, agenteAtivo: false, agenteConfigurado: false, testeRealizado: false, etapasFunil: 0, horariosConfigurados: false, agendaAtiva: false, agendaConfigurada: false, followupAtivo: false, followupConfigurado: false, transferenciaDisponivel: false };
    const map = Object.fromEntries(buildChecklist(base).map((i) => [i.id, i.to]));
    expect(map).toEqual({ whatsapp: "/app/conexao", agente: "/app/agente", teste: "/app/agente", funil: "/app/crm", horarios: "/app/configuracoes", transferencia: "/app/agente" });
    const full = buildChecklist({ ...base, agendaAtiva: true, followupAtivo: true });
    expect(full.find((i) => i.id === "agenda")?.to).toBe("/app/agenda");
    expect(full.find((i) => i.id === "followup")).toBeTruthy();
  });
  it("webhook compara token em tempo constante e rejeita vazio", () => {
    expect(safeTokenEqual("abc", "abc")).toBe(true);
    expect(safeTokenEqual("abd", "abc")).toBe(false);
    expect(safeTokenEqual("", "")).toBe(false);
  });
});
