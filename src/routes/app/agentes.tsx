// BLOCO 6 — Catálogo de agentes + Meus Agentes (cliente).
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bot, Check, Loader2, Star, Trash2, Download, Settings2, Instagram, Smartphone } from "lucide-react";
import { brand } from "@/config/brand";
import {
  listCatalog, listMyAgents, installTemplate, updateMyAgent, deleteMyAgent,
  type AgentTemplate, type TemplateField, type InstalledAgent,
} from "@/lib/agent-catalog.functions";

export const Route = createFileRoute("/app/agentes")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Agentes de IA` },
      { name: "description", content: "Instale agentes de IA prontos e gerencie os agentes da sua empresa." },
      { property: "og:title", content: `${brand.name} — Agentes de IA` },
      { property: "og:description", content: "Catálogo de agentes prontos para instalar na sua empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: ({ context }: any) => {
    const r = context?.membership?.role;
    if (r === "atendente") throw redirect({ to: "/app/dashboard" });
  },
  component: AgentesPage,
});

const TOOL_LABEL: Record<string, string> = {
  atualizar_lead: "Atualizar lead",
  qualificar_lead: "Qualificar lead",
  mover_pipeline: "Mover no pipeline",
  transferir_humano: "Transferir para humano",
  finalizar_lead: "Finalizar lead",
};

function ChannelIcons({ channels }: { channels: string[] }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      {channels.includes("whatsapp") && <Smartphone className="size-3.5" aria-label="WhatsApp" />}
      {channels.includes("instagram") && <Instagram className="size-3.5" aria-label="Instagram" />}
    </div>
  );
}

function AgentesPage() {
  const [tab, setTab] = useState<"meus" | "catalogo">("meus");
  const fetchCatalog = useServerFn(listCatalog);
  const fetchMine = useServerFn(listMyAgents);
  const doInstall = useServerFn(installTemplate);
  const doUpdate = useServerFn(updateMyAgent);
  const doDelete = useServerFn(deleteMyAgent);

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [mine, setMine] = useState<InstalledAgent[]>([]);
  const [detail, setDetail] = useState<AgentTemplate | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InstalledAgent | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [cat, agents] = await Promise.all([fetchCatalog(), fetchMine()]);
      setTemplates(cat.templates);
      setFields(cat.fields);
      setInstalledIds(cat.installedTemplateIds);
      setMine(agents);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar agentes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldsByTemplate = useMemo(() => {
    const m = new Map<string, TemplateField[]>();
    for (const f of fields) m.set(f.template_id, [...(m.get(f.template_id) ?? []), f]);
    return m;
  }, [fields]);

  async function install(t: AgentTemplate) {
    setInstalling(t.id);
    try {
      const r = await doInstall({ data: { templateId: t.id } });
      if (r.alreadyInstalled) toast.info("Este agente já está instalado.");
      else toast.success(`${t.nome} instalado na sua empresa`);
      setDetail(null);
      await reload();
      setTab("meus");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao instalar");
    } finally {
      setInstalling(null);
    }
  }

  async function toggleAtivo(a: InstalledAgent, ativo: boolean) {
    try {
      await doUpdate({ data: { id: a.id, ativo } });
      setMine((prev) => prev.map((x) => (x.id === a.id ? { ...x, ativo } : x)));
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  async function makeDefault(a: InstalledAgent) {
    try {
      await doUpdate({ data: { id: a.id, makeDefault: true } });
      toast.success(`${a.nome_agente} é o agente padrão`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    try {
      await doDelete({ data: { id: confirmDelete.id } });
      toast.success("Agente excluído");
      setConfirmDelete(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <Bot className="size-6 text-primary" /> Agentes de IA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Instale agentes prontos do catálogo. Cada instalação é uma cópia independente da sua empresa.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-[color:var(--hairline)] p-1 bg-[color:var(--panel)]">
          {(["meus", "catalogo"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-[13.5px] font-medium ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "meus" ? `Meus Agentes (${mine.length})` : "Catálogo"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : tab === "catalogo" ? (
        templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum agente disponível no catálogo ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const installed = installedIds.includes(t.id);
              return (
                <Card key={t.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{t.nome}</h3>
                        {t.destaque && <Star className="size-3.5 text-amber-500" />}
                      </div>
                      <Badge variant="secondary" className="mt-1 text-[11px]">{t.categoria}</Badge>
                    </div>
                    <ChannelIcons channels={t.channels_supported} />
                  </div>
                  <p className="text-[13px] text-muted-foreground line-clamp-3 flex-1">
                    {t.descricao_curta || t.descricao}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetail(t)}>
                      Detalhes
                    </Button>
                    {installed ? (
                      <Button size="sm" variant="ghost" disabled className="text-emerald-600">
                        <Check className="size-4 mr-1" /> Instalado
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => install(t)} disabled={installing === t.id}>
                        {installing === t.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : mine.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Você ainda não tem agentes. Instale um do catálogo.</p>
          <Button onClick={() => setTab("catalogo")}>Ver catálogo</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {mine.map((a) => (
            <Card key={a.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{a.nome_agente}</h3>
                  {a.is_default && <Badge className="text-[11px]">Padrão</Badge>}
                  {!a.ativo && <Badge variant="secondary" className="text-[11px]">Inativo</Badge>}
                </div>
                <p className="text-[12.5px] text-muted-foreground line-clamp-1">{a.descricao || "—"}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <ChannelIcons channels={a.channels} />
                  <span className="text-[11px] text-muted-foreground">{a.allowed_tools.length} ferramentas</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={a.ativo} onCheckedChange={(v) => toggleAtivo(a, v)} />
                {!a.is_default && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(a)}>
                    <Star className="size-4 mr-1" /> Padrão
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link to="/app/agente">
                    <Settings2 className="size-4 mr-1" /> Configurar
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(a)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Detalhes do template */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.nome}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold mb-1">Para que serve</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">{detail.descricao || detail.descricao_curta}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-1">O que coleta</h4>
                {(fieldsByTemplate.get(detail.id) ?? []).length === 0 ? (
                  <p className="text-muted-foreground">Nenhum campo específico.</p>
                ) : (
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {(fieldsByTemplate.get(detail.id) ?? []).map((f) => (
                      <li key={f.id}>
                        {f.label} <span className="text-[11px]">({f.field_type})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="font-semibold mb-1">Ferramentas</h4>
                <div className="flex flex-wrap gap-1.5">
                  {detail.default_tools.length === 0 ? (
                    <span className="text-muted-foreground">Nenhuma.</span>
                  ) : (
                    detail.default_tools.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[11px]">{TOOL_LABEL[t] ?? t}</Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">Canais:</h4>
                <ChannelIcons channels={detail.channels_supported} />
                <span className="text-muted-foreground text-[12.5px]">{detail.channels_supported.join(", ")}</span>
              </div>
              {detail.recommended_stages.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-1">Pipeline recomendado</h4>
                  <p className="text-muted-foreground">{detail.recommended_stages.map((s) => s.nome).join(" → ")}</p>
                </div>
              )}
              {detail.recommended_followup?.steps?.length ? (
                <div>
                  <h4 className="font-semibold mb-1">Follow-up recomendado</h4>
                  <p className="text-muted-foreground">
                    {detail.recommended_followup.steps.length} etapa(s) — criada desativada para você revisar.
                  </p>
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetail(null)}>Fechar</Button>
            {detail && installedIds.includes(detail.id) ? (
              <Button disabled><Check className="size-4 mr-1.5" /> Instalado</Button>
            ) : (
              <Button onClick={() => detail && install(detail)} disabled={!!installing}>
                {installing ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Download className="size-4 mr-1.5" />}
                Instalar agente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir agente?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDelete?.nome_agente} será removido. O histórico das conversas e os leads são preservados.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={remove}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
