import { createFileRoute } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { useState } from "react";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MiniAreaChart, type AreaPoint } from "@/components/dashboard/mini-area-chart";
import { MessageCircle, Bot, Trophy, Target, Download, Lock, Star } from "lucide-react";
import { demoCsat, demoStats, demoCards } from "@/lib/demo-data";

export const Route = createFileRoute("/demo/relatorios")({
  head: () => ({ meta: [{ title: `${brand.name} — Relatórios (demo)` }] }),
  component: RelatoriosDemo,
});

const PERIODS = [
  { id: "hoje", label: "Hoje", days: 1 },
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
];

function RelatoriosDemo() {
  const [period, setPeriod] = useState("7d");
  const days = PERIODS.find((p) => p.id === period)?.days ?? 7;

  const series: AreaPoint[] = Array.from({ length: days === 1 ? 24 : days }, (_, i) => ({
    label: String(i),
    a: 6 + Math.round(Math.sin(i * 0.7) * 5 + i * 0.4 + Math.abs(Math.sin(i * 1.3)) * 4),
    b: 4 + Math.round(Math.sin(i * 0.5) * 4 + i * 0.3 + Math.abs(Math.cos(i * 0.9)) * 3),
  }));

  // Mesmos números do Dashboard para "Hoje"; 7 e 30 dias são ilustrativos e coerentes entre si.
  const P = {
    1: { msgs: demoStats.respostasIaHoje * 2, ia: demoStats.respostasIaHoje, agend: demoStats.ganho, receita: demoStats.valorAgendado },
    7: { msgs: 96, ia: 71, agend: 9, receita: 6840 },
    30: { msgs: 410, ia: 302, agend: 37, receita: 27950 },
  }[days as 1 | 7 | 30];
  const atendentes = [
    { nome: "IA Vivi", conv: Math.round(P.ia / 4), ganho: Math.round(P.agend * 0.7) },
    { nome: "Recepção", conv: Math.max(1, Math.round(P.ia / 20)), ganho: Math.round(P.agend * 0.2) },
    { nome: "Comercial", conv: Math.max(1, Math.round(P.ia / 30)), ganho: Math.round(P.agend * 0.1) },
  ].map((a) => ({ ...a, taxa: a.conv ? Math.round((a.ganho / a.conv) * 100) : 0 }));
  const distEtapas = [
    { nome: "Conversas", q: demoStats.conversas, cor: "#22D3EE" },
    { nome: "Negociando", q: demoStats.negociando, cor: "#FFB020" },
    { nome: "Agendados", q: demoStats.ganho, cor: "#7C3AED" },
    { nome: "Perda", q: demoStats.perda, cor: "#FF5A5A" },
  ];
  void demoCards;
  const totalEtapas = distEtapas.reduce((a, b) => a + b.q, 0);

  const csatMedia = (demoCsat.reduce((a, b) => a + b.score, 0) / demoCsat.length).toFixed(1);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">Relatórios <HelpTip text="Métricas de atendimento, conversão por etapa, performance por atendente e nota média de satisfação (CSAT)." /></h1>
          <p className="text-xs text-muted-foreground">Performance do agente, equipe e satisfação — exemplo.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-full p-1">
            {PERIODS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`text-[12px] font-semibold px-3 py-1 rounded-full transition ${
                  period === p.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="outline" disabled title="Indisponível no demo">
            <Download className="size-4 mr-1.5" /> Exportar
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-5">
        <KpiCard accent icon={<MessageCircle className="size-4" />} label="Mensagens" value={P.msgs} trend="recebidas + enviadas" />
        <KpiCard icon={<Bot className="size-4" />} label="Respostas da IA" value={P.ia} trend="no período" />
        <KpiCard icon={<Target className="size-4" />} label="Agendados" value={P.agend} trend="no período" />
        <KpiCard icon={<Trophy className="size-4" />} label="Valor agendado" value={`R$ ${P.receita.toLocaleString("pt-BR")}`} trend="valor estimado nos cards" />
        <KpiCard icon={<Star className="size-4" />} label="CSAT médio" value={`${csatMedia} / 5`} trend={`${demoCsat.length} respostas`} />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-[15px] font-semibold">Mensagens por dia</h3>
          <p className="text-xs text-muted-foreground mb-3">recebidas vs respondidas pela IA</p>
          <MiniAreaChart data={series} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-[15px] font-semibold mb-3">Funil atual</h3>
          <div className="space-y-2.5">
            {distEtapas.map((e) => (
              <div key={e.nome}>
                <div className="flex items-center justify-between text-[12.5px] mb-1">
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: e.cor }} />{e.nome}</span>
                  <span className="text-muted-foreground">{e.q}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(e.q / totalEtapas) * 100}%`, background: e.cor }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-[15px] font-semibold mb-3">Conversão por atendente</h3>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left py-2">Atendente</th>
                <th className="text-right py-2">Conversas</th>
                <th className="text-right py-2">Ganhos</th>
                <th className="text-right py-2">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {atendentes.map((a) => (
                <tr key={a.nome} className="border-t border-border">
                  <td className="py-2.5 font-semibold">{a.nome}</td>
                  <td className="text-right tabular-nums">{a.conv}</td>
                  <td className="text-right tabular-nums">{a.ganho}</td>
                  <td className="text-right">
                    <span className="inline-block min-w-[44px] text-[12px] font-bold px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-text)]">
                      {a.taxa}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-[15px] font-semibold mb-3 flex items-center gap-2">
            <Star className="size-4 text-[var(--brand-text)]" /> Últimas avaliações CSAT
          </h3>
          <div className="divide-y divide-border">
            {demoCsat.map((c) => (
              <div key={c.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[13px] truncate">{c.nome}</div>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`size-3.5 ${s <= c.score ? "fill-[#FFB020] text-[#FFB020]" : "text-muted-foreground/30"}`} />
                    ))}
                  </div>
                </div>
                {c.comentario && <p className="text-[12px] text-muted-foreground mt-0.5">"{c.comentario}"</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
        <Lock className="size-3" /> Demonstração — números ilustrativos, somente leitura.
      </p>
    </div>
  );
}
