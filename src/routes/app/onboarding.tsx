// ATIVAÇÃO — caminho obrigatório mínimo: empresa → atendente (motor de IA existente)
// → teste → WhatsApp → pronto. Nada é apagado: endereço, identidade visual, etapas do
// funil, permissões e materiais continuam existindo nas telas próprias.
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import {
  Loader2, Check, Building2, Bot, PartyPopper, MessageCircle, Send, ExternalLink, Settings2, Wand2, HelpCircle,
} from "lucide-react";
import { maskPhone } from "@/lib/masks";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-status";
import { testAiReply } from "@/lib/evolution.functions";
import { analyzeBusinessBrief, generateAgentConfig, type BriefQuestion } from "@/lib/agent-ai.functions";

type Search = { checkout?: string };

export const Route = createFileRoute("/app/onboarding")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
  }),
  head: () => ({ meta: [{ title: `${brand.name} — Bem-vindo` }] }),
  component: Onboarding,
});

const STEPS = [
  { key: "empresa", label: "Empresa", icon: Building2 },
  { key: "agente", label: "Atendente", icon: Bot },
  { key: "teste", label: "Teste", icon: Send },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "concluir", label: "Pronto", icon: PartyPopper },
] as const;

const SEGMENTOS = [
  "Varejo / E-commerce", "Alimentação", "Beleza e Estética", "Saúde", "Educação",
  "Serviços Profissionais", "Imobiliária", "Agência / Marketing", "Software / SaaS",
  "Indústria", "Construção", "Logística", "Outro",
];

const PLACEHOLDER = `Ex: Tenho uma padaria artesanal na Vila Mariana, em São Paulo, aberta de seg a sáb das 6h às 20h. Vendo pães de fermentação natural, bolos sob encomenda e cestas de café da manhã. Entrego em até 5km. Recebo por Pix e cartão. Quero que o atendente descubra o que o cliente quer, sugira combos, confirme o endereço e mande a forma de pagamento.`;

function Onboarding() {
  const ctx = Route.useRouteContext();
  const navigate = useNavigate();
  const search = useSearch({ from: "/app/onboarding" }) as Search;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Etapa 1 — identificação mínima da empresa (company = fonte oficial do cadastro)
  const [nomeEmpresa, setNomeEmpresa] = useState(ctx.company?.nome ?? "");
  const [segmento, setSegmento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [emailCorp, setEmailCorp] = useState(ctx.user.email ?? "");

  // Etapa 2 — atendente pelo MESMO motor de /app/agente
  const analyze = useServerFn(analyzeBusinessBrief);
  const generate = useServerFn(generateAgentConfig);
  const [descricao, setDescricao] = useState("");
  const [perguntas, setPerguntas] = useState<BriefQuestion[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [resumoIA, setResumoIA] = useState("");
  const [cobertura, setCobertura] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [agente, setAgente] = useState<any>(null);
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  // Regra de transferência: só grava o que o cliente escrever (nunca um default do sistema).
  const [quandoTransferir, setQuandoTransferir] = useState("");
  const [telefoneTransferencia, setTelefoneTransferencia] = useState("");

  // Etapa 3 — teste com a mesma montagem do WhatsApp real
  const runTest = useServerFn(testAiReply);
  const [testMsg, setTestMsg] = useState("Oi, vocês atendem hoje?");
  const [testReply, setTestReply] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testado, setTestado] = useState(false);

  const waStatus = useWhatsappStatus(15000);

  useEffect(() => {
    if (!ctx.company) navigate({ to: "/app/checkout", replace: true });
  }, [ctx.company, navigate]);

  useEffect(() => {
    if (!ctx.company) return;
    const c = ctx.company;
    if (c.nome_fantasia || c.nome) setNomeEmpresa(c.nome_fantasia || c.nome);
    if (c.segmento) setSegmento(c.segmento);
    if (c.telefone) setTelefone(c.telefone);
    if (c.email_corporativo) setEmailCorp(c.email_corporativo);
    if (typeof c.onboarding_step === "number" && c.onboarding_step > 0) {
      setStep(Math.min(c.onboarding_step, STEPS.length - 1));
    }
  }, [ctx.company]);

  // Retoma o atendente já existente (nada é sobrescrito por default).
  useEffect(() => {
    if (!ctx.company) return;
    void (async () => {
      const { fetchDefaultAgent } = await import("@/lib/agents");
      const a: any = await fetchDefaultAgent(supabase, ctx.company!.id);
      if (!a) return;
      setAgentId(a.id);
      setAgente(a);
      if (a.quando_transferir) setQuandoTransferir(a.quando_transferir);
      if (a.telefone_transferencia) setTelefoneTransferencia(a.telefone_transferencia);
    })();
  }, [ctx.company]);

  useEffect(() => {
    if (search.checkout === "success") toast.success("Pagamento validado! Acesso liberado.");
  }, [search.checkout]);

  if (!ctx.company) return null;
  const companyId = ctx.company.id;

  /** Dados cadastrais vão para company; erro de banco NUNCA é ignorado. */
  async function persistCompany(nextStep: number) {
    const { error } = await supabase
      .from("company")
      .update({
        nome: nomeEmpresa.trim() || ctx.company!.nome,
        nome_fantasia: nomeEmpresa.trim() || null,
        segmento: segmento || null,
        telefone: telefone || null,
        email_corporativo: emailCorp || null,
        onboarding_step: nextStep,
      })
      .eq("id", companyId);
    if (error) throw new Error(error.message);
  }

  /** Grava o atendente na MESMA tabela/motor usado pelas outras telas. */
  async function persistAgent(extra?: Record<string, any>) {
    const { saveDefaultAgentConfig, fetchDefaultAgent } = await import("@/lib/agents");
    const payload: Record<string, any> = {
      ...(agente ?? {}),
      ...(extra ?? {}),
      nome_empresa: nomeEmpresa.trim(),
      ...(segmento ? { segmento } : {}),
    };
    if (quandoTransferir.trim()) payload.quando_transferir = quandoTransferir.trim();
    if (telefoneTransferencia.trim()) payload.telefone_transferencia = telefoneTransferencia.trim();
    const { error } = await saveDefaultAgentConfig(supabase, companyId, ctx.user.id, payload);
    if (error) throw new Error(error.message);
    const a: any = await fetchDefaultAgent(supabase, companyId);
    if (a) { setAgentId(a.id); setAgente(a); }
    return a;
  }

  async function runAnalyze() {
    if (descricao.trim().length < 20) {
      return toast.error("Conte um pouco mais sobre o seu negócio.");
    }
    setAnalyzing(true);
    try {
      const preenchidos: Record<string, string> = {};
      for (const [k, v] of Object.entries(agente ?? {})) {
        if (typeof v === "string" && v.trim()) preenchidos[k] = v;
      }
      const a: any = await analyze({ data: { descricao, respostas, preenchidos } });
      setResumoIA(a.resumo || "");
      setCobertura(a.cobertura || 0);
      setPerguntas(a.perguntas || []);
      if (a.pronto || !(a.perguntas ?? []).length) await runGenerate(respostas);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível analisar agora.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runGenerate(extraRespostas: Record<string, string>) {
    setGenerating(true);
    try {
      const merged = { ...respostas, ...extraRespostas };
      const r: any = await generate({ data: { descricao, respostas: merged } });
      await persistAgent(r.config);
      setPerguntas([]);
      if (Array.isArray(r.conflitos) && r.conflitos.length) {
        toast.warning(`Mantive o que você já tinha em: ${r.conflitos.join(", ")}.`);
      }
      toast.success("Atendente montado com as suas informações.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível montar o atendente agora.");
    } finally {
      setGenerating(false);
    }
  }

  function validateStep(): string | null {
    const key = STEPS[step]?.key;
    if (key === "empresa") {
      if (!nomeEmpresa.trim()) return "Informe o nome do seu negócio.";
      if (!segmento) return "Escolha o segmento.";
    }
    if (key === "agente" && !agente?.sobre_empresa && !agente?.produtos_servicos) {
      return "Conte sobre o negócio e toque em Montar meu atendente.";
    }
    return null;
  }

  async function next() {
    const err = validateStep();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      if (STEPS[step]?.key === "agente") await persistAgent();
      await persistCompany(step + 1);
      setStep(Math.min(step + 1, STEPS.length - 1));
    } catch (e: any) {
      toast.error(e.message || "Não foi possível salvar. Nada foi perdido, tente de novo.");
    } finally {
      setSaving(false);
    }
  }
  function back() { if (step > 0) setStep(step - 1); }

  async function testar() {
    setTesting(true); setTestReply([]);
    try {
      await persistAgent();
      const r = await runTest({ data: { message: testMsg, agentId: agentId ?? null } });
      setTestReply(r.parts);
      setTestado(true);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível testar agora.");
    } finally {
      setTesting(false);
    }
  }

  async function finalizar() {
    setSaving(true);
    try {
      await persistAgent();
      await persistCompany(STEPS.length - 1);
      const { error } = await supabase
        .from("company")
        .update({ onboarding_completed: true, nome: nomeEmpresa.trim() })
        .eq("id", companyId);
      if (error) throw new Error(error.message);
      toast.success("Tudo pronto! Bem-vindo ao " + brand.name);
      window.location.href = "/app/dashboard";
    } catch (e: any) {
      toast.error(e.message || "Falha ao concluir");
    } finally {
      setSaving(false);
    }
  }

  const stepKey = STEPS[step]?.key;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold font-display">Vamos deixar seu {brand.name} atendendo</h1>
        <p className="text-sm text-muted-foreground">
          Cinco passos simples. Cada passo é salvo — você pode sair e continuar depois.
        </p>
      </div>

      <div className="flex items-center gap-1 md:gap-2 mb-6 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.key} className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <div className={`size-8 rounded-full grid place-items-center text-xs font-bold transition ${
                done ? "bg-primary text-primary-foreground" :
                active ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                "bg-muted text-muted-foreground"
              }`}>
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </div>
              <div className={`text-xs md:text-sm hidden sm:block ${active ? "font-semibold" : "text-muted-foreground"}`}>{s.label}</div>
              {i < STEPS.length - 1 && <div className="w-4 md:w-8 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      <Card className="p-6 space-y-4">
        {stepKey === "empresa" && (
          <>
            <p className="text-sm text-muted-foreground">
              Só o essencial agora. CNPJ, endereço e identidade visual você preenche depois em Configurações.
            </p>
            <Row label="Nome do seu negócio">
              <Input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Ex: Padaria do João" />
            </Row>
            <div className="grid sm:grid-cols-2 gap-3">
              <Row label="Segmento">
                <Select value={segmento} onValueChange={setSegmento}>
                  <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                  <SelectContent>
                    {SEGMENTOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Telefone de contato (opcional)">
                <Input value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" />
              </Row>
            </div>
            <Row label="E-mail (opcional)">
              <Input type="email" value={emailCorp} onChange={(e) => setEmailCorp(e.target.value)} />
            </Row>
          </>
        )}

        {stepKey === "agente" && (
          <>
            <p className="text-sm text-muted-foreground">
              Escreva com suas palavras. É com isso que seu atendente vai conversar com os clientes.
            </p>
            <Row label="Conte sobre seu negócio, o que vocês vendem, como atendem e o que esse atendente deve fazer">
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={8} placeholder={PLACEHOLDER} />
            </Row>

            {perguntas.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <HelpCircle className="size-3.5" /> Faltam alguns detalhes
                </div>
                {resumoIA && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Entendi até aqui:</span> {resumoIA}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(15, cobertura)}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{cobertura}%</span>
                </div>
                {perguntas.map((q) => (
                  <div key={q.id} className="rounded-xl border border-border p-3 space-y-2">
                    <Label className="text-sm leading-snug">
                      {q.pergunta}{q.obrigatoria && <span className="text-primary ml-1">*</span>}
                    </Label>
                    {q.porque && <p className="text-[11.5px] text-muted-foreground">{q.porque}</p>}
                    <Textarea
                      value={respostas[q.id] || ""}
                      onChange={(e) => setRespostas((r) => ({ ...r, [q.id]: e.target.value }))}
                      placeholder={q.exemplo ? `Ex: ${q.exemplo}` : ""}
                      rows={2}
                    />
                  </div>
                ))}
                <Button onClick={() => runGenerate(respostas)} disabled={generating}>
                  {generating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Wand2 className="size-4 mr-1.5" />}
                  Montar meu atendente
                </Button>
              </div>
            )}

            {perguntas.length === 0 && (
              <Button onClick={runAnalyze} disabled={analyzing || generating}>
                {analyzing || generating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Wand2 className="size-4 mr-1.5" />}
                Montar meu atendente
              </Button>
            )}

            {agente?.nome_agente && (
              <div className="rounded-xl border border-border p-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">O que ficou configurado</div>
                <Summary label="Nome do atendente" value={agente.nome_agente} />
                <Summary label="Objetivo" value={agente.papel_objetivo} />
                <Summary label="O que vocês vendem" value={agente.produtos_servicos} />
                <Summary label="Formas de pagamento" value={agente.formas_pagamento} />
              </div>
            )}

            <Row label="Quando ele deve chamar uma pessoa do time? (opcional)">
              <Textarea
                value={quandoTransferir}
                onChange={(e) => setQuandoTransferir(e.target.value)}
                rows={2}
                placeholder="Se deixar em branco, ele chama alguém quando o cliente pedir, houver reclamação séria ou faltar informação."
              />
            </Row>
            <Row label="Telefone de quem assume o atendimento (opcional)">
              <Input value={telefoneTransferencia} onChange={(e) => setTelefoneTransferencia(maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" />
            </Row>
            <p className="text-xs text-muted-foreground">
              Depois você ajusta tudo — inclusive permissões, materiais e etapas — em{" "}
              <span className="font-medium">Atendente</span>.
            </p>
          </>
        )}

        {stepKey === "teste" && (
          <>
            <p className="text-sm text-muted-foreground">
              Escreva como um cliente escreveria. O teste usa exatamente a mesma configuração que vale no WhatsApp.
            </p>
            <div className="flex gap-2">
              <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="Mensagem do cliente…" />
              <Button onClick={testar} disabled={testing}>
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
            <div className="rounded-xl border border-border p-4 space-y-2 min-h-[120px]">
              {testReply.length === 0 && !testing && <p className="text-xs text-muted-foreground">A resposta aparece aqui.</p>}
              {testing && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="size-3 animate-spin" />pensando…</div>}
              {testReply.map((p, i) => (
                <div key={i} className="max-w-[80%] rounded-2xl rounded-bl-md bg-primary/10 px-3.5 py-2.5 text-[13px]">{p}</div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Não gostou? Volte um passo, acrescente informações e monte de novo.
            </p>
          </>
        )}

        {stepKey === "whatsapp" && (
          <>
            <p className="text-sm text-muted-foreground">
              Conecte o WhatsApp que seus clientes já usam. A conexão é feita lendo um QR Code, como no WhatsApp Web.
            </p>
            <div className="rounded-xl border border-border p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold">Status da conexão</div>
                <div className="text-xs text-muted-foreground">
                  {waStatus === "connected" ? "Conectado — seu número já está pronto." :
                   waStatus === "connecting" ? "Aguardando a leitura do QR Code…" :
                   waStatus === "unknown" ? "Verificando…" : "Ainda não conectado."}
                </div>
              </div>
              <Button asChild variant={waStatus === "connected" ? "outline" : "default"}>
                <Link to="/app/conexao" target="_blank">
                  <ExternalLink className="size-4 mr-1.5" />
                  {waStatus === "connected" ? "Ver conexão" : "Conectar WhatsApp"}
                </Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Depois de conectar, mande uma mensagem de outro número para ver o atendimento acontecendo.
            </p>
          </>
        )}

        {stepKey === "concluir" && (
          <div className="text-center py-6 space-y-4">
            <div className="size-16 mx-auto rounded-full bg-primary/10 grid place-items-center">
              <PartyPopper className="size-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-display">Tudo certo, {nomeEmpresa}!</h2>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>{agente?.nome_agente ? `Atendente configurado: ${agente.nome_agente}` : "Atendente configurado"}</li>
              <li>{testado ? "Teste realizado" : "Teste ainda não feito (opcional)"}</li>
              <li>{waStatus === "connected" ? "WhatsApp conectado" : "WhatsApp ainda não conectado"}</li>
            </ul>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Settings2 className="size-3.5" /> Atendente → para refinar quando quiser
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t border-border mt-2">
          <Button variant="ghost" onClick={back} disabled={step === 0 || saving}>Voltar</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null} Avançar
            </Button>
          ) : (
            <Button onClick={finalizar} disabled={saving} className="bg-gradient-brand text-primary-foreground hover:opacity-90 font-semibold">
              {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null} Ir pro dashboard
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Summary({ label, value }: { label: string; value?: unknown }) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{text}</div>
    </div>
  );
}
