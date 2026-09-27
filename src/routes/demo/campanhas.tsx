import { createFileRoute } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Plus, Lock, Send, AlertCircle, Calendar, ShieldCheck, HelpCircle } from "lucide-react";
import { demoCampanhas, rotuloData } from "@/lib/demo-data";

export const Route = createFileRoute("/demo/campanhas")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Campanhas (demo)` },
      { name: "description", content: "Campanhas de exemplo do AtendAi, enviadas somente para contatos autorizados." },
      { property: "og:title", content: `${brand.name} — Campanhas (demo)` },
      { property: "og:description", content: "Campanhas de exemplo, somente leitura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampanhasDemo,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  agendada: { label: "Agendada", cls: "bg-[rgba(124,58,237,.15)] text-[var(--brand-text)]" },
  enviando: { label: "Enviando", cls: "bg-[rgba(255,176,32,.15)] text-[#ffd591]" },
  concluida: { label: "Concluída", cls: "bg-[rgba(37,211,102,.15)] text-[#9af0bd]" },
};

function CampanhasDemo() {
  const concl = demoCampanhas.filter((c) => c.status === "concluida");
  const sum = (k: "enviados" | "incertos" | "falharam" | "pulados") => concl.reduce((a, c) => a + c[k], 0);
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Megaphone className="size-5 text-[var(--brand-text)]" /> Campanhas <HelpTip text="Envios para contatos que autorizaram receber campanhas. Segmente por tag, etapa do CRM ou lista importada." />
          </h1>
          <p className="text-xs text-muted-foreground">Envio segmentado, com agendamento, só para contatos autorizados.</p>
        </div>
        <Button disabled><Plus className="size-4 mr-1.5" />Nova campanha</Button>
      </header>

      <div className="rounded-2xl border border-border bg-card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi icon={<Send className="size-3.5" />} label="Enviadas" value={String(sum("enviados"))} />
        <Kpi icon={<HelpCircle className="size-3.5" />} label="Incertas" value={String(sum("incertos"))} />
        <Kpi icon={<AlertCircle className="size-3.5" />} label="Falharam" value={String(sum("falharam"))} />
        <Kpi icon={<ShieldCheck className="size-3.5" />} label="Puladas" value={String(sum("pulados"))} />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Campanha</th>
              <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Status</th>
              <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Segmento</th>
              <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Quando</th>
              <th className="text-right px-4 py-3 font-semibold">Entrega</th>
            </tr>
          </thead>
          <tbody>
            {demoCampanhas.map((c) => {
              const st = STATUS[c.status];
              return (
                <tr key={c.id} className="border-t border-border hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[13.5px]">{c.nome}</div>
                    <div className="text-[11px] text-muted-foreground sm:hidden">{st.label} · {rotuloData(c.quando)}</div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge className={`${st.cls} border-none font-semibold`}>{st.label}</Badge>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-[12.5px]">{c.segmento}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-[12.5px]">
                    <Calendar className="size-3 inline mr-1" />
                    {rotuloData(c.quando)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "concluida" ? (
                      <div className="text-[12px]">
                        <div><b>{c.enviados}</b><span className="text-muted-foreground">/{c.total}</span> enviadas</div>
                        <div className="text-muted-foreground">{c.incertos} incertas · {c.falharam} falharam · {c.pulados} puladas</div>
                      </div>
                    ) : (
                      <div className="text-[12px] text-muted-foreground">{c.total} contatos autorizados</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-[var(--brand-soft-strong)] bg-[var(--brand-soft)]/40 p-5">
        <h3 className="font-display font-bold text-[14px] mb-2 flex items-center gap-2">
          <ShieldCheck className="size-4 text-[var(--brand-text)]" /> Como os envios funcionam
        </h3>
        <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-5">
          <li>Campanhas vão somente para contatos que autorizaram receber.</li>
          <li>O contato pode deixar de receber a qualquer momento.</li>
          <li>Respostas como "PARAR" ou "sair" tiram o contato dos próximos envios.</li>
          <li>Cada envio conta no limite mensal de mensagens do plano.</li>
          <li>"Incerta" significa que o WhatsApp não confirmou a entrega; ela não é reenviada.</li>
        </ul>
      </div>

      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
        <Lock className="size-3" /> Demonstração — somente leitura.
      </p>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="font-display font-extrabold text-2xl mt-1">{value}</div>
    </div>
  );
}
