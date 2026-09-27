import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { brand } from "@/config/brand";
import { Bot, MessageCircle, Target, Calendar, Hand } from "lucide-react";
import { demoStats, demoMensagens, demoProximosAgendamentos, demoCards, rotuloData } from "@/lib/demo-data";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MiniAreaChart, type AreaPoint } from "@/components/dashboard/mini-area-chart";
import { AgentStatusCard } from "@/components/dashboard/agent-status-card";
import { MessageTimeline } from "@/components/dashboard/message-timeline";

export const Route = createFileRoute("/demo/dashboard")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Demonstração` },
      { name: "description", content: "Veja o AtendAi funcionando com dados de exemplo da Clínica Vitalis: conversas, agenda, CRM e transferências." },
      { property: "og:title", content: `${brand.name} — Demonstração` },
      { property: "og:description", content: "Dashboard de exemplo do AtendAi, somente leitura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DemoDashboard,
});

const TZ = "America/Sao_Paulo";

function DemoDashboard() {
  const series: AreaPoint[] = Array.from({ length: 14 }, (_, i) => ({
    label: String(i),
    a: 5 + Math.round(Math.sin(i * 0.6) * 2 + i * 0.3),
    b: 4 + Math.round(Math.sin(i * 0.7) * 2 + i * 0.25),
  }));
  const last = [...demoMensagens].sort((a, b) => +b.quando - +a.quando).slice(0, 6);
  const aguardando = demoCards.filter((c) => c.precisa_humano);
  return (
    <div className="space-y-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">Dashboard <HelpTip text="Visão geral do dia: conversas, respostas da IA, contatos qualificados, agenda e quem precisa de um atendente." /></h1>
          <p className="text-xs text-muted-foreground">Clínica Vitalis · visão geral do dia</p>
        </div>
        <div className="flex items-center gap-2 bg-[rgba(124,58,237,.12)] border border-[rgba(124,58,237,.30)] text-[var(--brand-text)] text-[12.5px] font-semibold px-3 py-1.5 rounded-full">
          <span className="size-2 rounded-full bg-[var(--brand)] shadow-[0_0_8px_var(--brand)]" /> Vivi ativa
        </div>
      </header>
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-5">
        <KpiCard accent icon={<MessageCircle className="size-4" />} label="Conversas hoje" value={demoStats.conversasHoje} trend="contatos que escreveram hoje" />
        <KpiCard icon={<Bot className="size-4" />} label="Respostas da IA" value={demoStats.respostasIaHoje} trend="mensagens enviadas hoje" />
        <KpiCard icon={<Target className="size-4" />} label="Qualificados" value={demoStats.qualificados} trend="negociando ou agendados" />
        <KpiCard icon={<Calendar className="size-4" />} label="Próximos agendamentos" value={demoStats.proximosAgendamentos} trend="confirmados" />
        <KpiCard icon={<Hand className="size-4" />} label="Precisa de você" value={demoStats.aguardandoHumano} trend="transferidos pela IA" />
      </div>
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-[15px] font-semibold">Atendimentos · 14 dias</h3>
          <p className="text-xs text-muted-foreground mb-3">recebidas vs respondidas pela IA (ilustrativo)</p>
          <MiniAreaChart data={series} />
        </div>
        <AgentStatusCard status="connected" numero="+55 11 90000-0000" />
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-display text-[15px] font-semibold flex items-center gap-2">
              <Calendar className="size-4 text-[var(--brand-text)]" /> Próximos agendamentos
            </h3>
            <p className="text-xs text-muted-foreground mb-3">a IA envia lembrete 24h antes</p>
            <div className="divide-y divide-border">
              {demoProximosAgendamentos.map((a) => (
                <div key={a.id} className="py-3 flex items-center gap-3">
                  <div className="size-11 shrink-0 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] grid place-items-center text-center font-display font-bold leading-none">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider">{a.quando.toLocaleDateString("pt-BR", { month: "short", timeZone: TZ })}</div>
                      <div className="text-[14px] mt-0.5">{a.quando.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: TZ })}</div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[13.5px] truncate">{a.cliente}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">{a.procedimento} · {a.profissional}</div>
                  </div>
                  <div className="text-[12.5px] font-bold tabular-nums text-[var(--brand-text)] whitespace-nowrap">{rotuloData(a.quando)}</div>
                </div>
              ))}
            </div>
            <Link to="/demo/agenda" className="text-[12px] font-semibold text-[var(--brand-text)] mt-2 inline-block">Ver agenda →</Link>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-display text-[15px] font-semibold flex items-center gap-2">
              <Hand className="size-4 text-[var(--brand-text)]" /> Aguardando atendimento humano
            </h3>
            <p className="text-xs text-muted-foreground mb-3">a IA pausou e passou para o setor</p>
            <div className="divide-y divide-border">
              {aguardando.map((c) => (
                <div key={c.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <b className="text-[13.5px] truncate">{c.nome}</b>
                    <span className="ml-auto text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-text)]">{c.setor_destino}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{c.transfer_motivo}</p>
                </div>
              ))}
            </div>
            <Link to="/demo/conversas" className="text-[12px] font-semibold text-[var(--brand-text)] mt-2 inline-block">Abrir "Precisa de você" →</Link>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-[15px] font-semibold">Atividade recente</h3>
          <p className="text-xs text-muted-foreground mb-2">últimas mensagens</p>
          <MessageTimeline items={last.map((m) => ({ id: m.id, nome: m.nome, autor: m.autor, texto: m.texto, quando: m.quando }))} />
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Funil: <b>{demoStats.conversas}</b> em conversa · <b>{demoStats.negociando}</b> negociando · <b>{demoStats.ganho}</b> agendados · <b>{demoStats.perda}</b> perdidos.
      </div>
    </div>
  );
}
