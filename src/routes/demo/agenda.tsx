import { createFileRoute } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { brand } from "@/config/brand";
import { CalendarDays, Bell, Lock } from "lucide-react";
import { demoAgendamentos, demoFollowups, rotuloData } from "@/lib/demo-data";

export const Route = createFileRoute("/demo/agenda")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Agenda (demo)` },
      { name: "description", content: "Agenda de exemplo do AtendAi: agendamentos, reagendamentos, cancelamentos, lembretes e follow-ups." },
      { property: "og:title", content: `${brand.name} — Agenda (demo)` },
      { property: "og:description", content: "Agenda de exemplo, somente leitura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaDemo,
});

const FU_STATUS: Record<string, string> = { programado: "Programado", enviado: "Enviado", interrompido: "Interrompido" };

function AgendaDemo() {
  const lista = [...demoAgendamentos].sort((a, b) => +a.quando - +b.quando);
  const fus = [...demoFollowups].sort((a, b) => +a.quando - +b.quando);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="size-5 text-[var(--brand-text)]" /> Agenda <HelpTip text="A IA agenda, reagenda e cancela dentro dos horários e serviços cadastrados, sem sobrepor compromissos." />
        </h1>
        <p className="text-xs text-muted-foreground">Compromissos marcados pela IA ou pela equipe — exemplo.</p>
      </header>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {lista.map((a) => (
          <div key={a.id} className={`p-4 flex items-center gap-3 ${a.status === "cancelado" ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[13.5px] truncate">{a.cliente}</div>
              <div className="text-[11.5px] text-muted-foreground truncate">{a.procedimento} · {a.profissional}</div>
              {a.nota && <div className="text-[11px] text-muted-foreground mt-0.5">{a.nota}</div>}
            </div>
            <div className="text-right shrink-0">
              <div className={`text-[12.5px] font-bold tabular-nums ${a.status === "cancelado" ? "line-through" : "text-[var(--brand-text)]"}`}>{rotuloData(a.quando)}</div>
              <div className="text-[10.5px] text-muted-foreground">{a.status === "cancelado" ? "Cancelado" : "Confirmado"}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-[15px] font-semibold flex items-center gap-2 mb-3">
          <Bell className="size-4 text-[var(--brand-text)]" /> Lembretes e follow-ups
        </h3>
        <div className="divide-y divide-border">
          {fus.map((f) => (
            <div key={f.id} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[13px] truncate">{f.tipo} · {f.nome}</div>
                <div className="text-[11.5px] text-muted-foreground truncate">{f.detalhe}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[12px] tabular-nums">{rotuloData(f.quando)}</div>
                <div className="text-[10.5px] text-muted-foreground">{FU_STATUS[f.status]}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-3">Se o contato responde, a sequência de follow-up é interrompida automaticamente.</p>
      </div>

      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
        <Lock className="size-3" /> Demonstração — somente leitura.
      </p>
    </div>
  );
}
