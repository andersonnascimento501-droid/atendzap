import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { brand } from "@/config/brand";
import { HelpTip } from "@/components/help-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, Plus, Trash2, User2, CalendarClock, Bot } from "lucide-react";
import { listTasks, saveTask, setTaskStatus, deleteTask, type CrmTask } from "@/lib/tasks.functions";

export const Route = createFileRoute("/app/tarefas")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Tarefas` },
      { name: "description", content: "Tarefas do time ligadas aos clientes e às conversas: hoje, atrasadas e próximas." },
      { property: "og:title", content: `${brand.name} — Tarefas` },
      { property: "og:description", content: "Organize as pendências do atendimento por responsável e prazo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TarefasPage,
});

type Member = { user_id: string; nome: string | null; email: string | null };

type Grupo = "atrasadas" | "hoje" | "proximas" | "sem_prazo";

function grupoDe(t: CrmTask): Grupo {
  if (!t.prazo) return "sem_prazo";
  const prazo = new Date(t.prazo);
  const hoje = new Date();
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);
  if (prazo.getTime() < Date.now() && prazo.getTime() < fimHoje.getTime() && prazo < hoje) {
    return prazo < hoje && prazo.getTime() < fimHoje.getTime() && prazo.getTime() < Date.now() && prazo.getTime() < fimHoje.getTime() && prazo.getTime() < hoje.getTime() && prazo.getTime() < fimHoje.getTime() ? (prazo.getTime() < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime() ? "atrasadas" : "hoje") : "hoje";
  }
  if (prazo.getTime() <= fimHoje.getTime()) return "hoje";
  return "proximas";
}

const GRUPOS: { key: Grupo; label: string }[] = [
  { key: "atrasadas", label: "Atrasadas" },
  { key: "hoje", label: "Para hoje" },
  { key: "proximas", label: "Próximas" },
  { key: "sem_prazo", label: "Sem prazo" },
];

function TarefasPage() {
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id;
  const userId = ctx.user.id;

  const fetchTasks = useServerFn(listTasks);
  const saveFn = useServerFn(saveTask);
  const statusFn = useServerFn(setTaskStatus);
  const deleteFn = useServerFn(deleteTask);

  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [apenasMinhas, setApenasMinhas] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setTasks(await fetchTasks({ data: { incluirConcluidas: mostrarConcluidas } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível carregar as tarefas");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line
  }, [mostrarConcluidas]);

  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      const { data } = await supabase
        .from("company_user")
        .select("user_id, profiles(nome,email)")
        .eq("company_id", companyId)
        .eq("ativo", true);
      setMembers(((data ?? []) as any[]).map((r) => ({
        user_id: r.user_id, nome: r.profiles?.nome ?? null, email: r.profiles?.email ?? null,
      })));
    })();
  }, [companyId]);

  const visiveis = useMemo(
    () => tasks.filter((t) => (apenasMinhas ? t.responsavel_id === userId : true)),
    [tasks, apenasMinhas, userId],
  );

  const porGrupo = useMemo(() => {
    const map: Record<Grupo, CrmTask[]> = { atrasadas: [], hoje: [], proximas: [], sem_prazo: [] };
    for (const t of visiveis) {
      if (t.status !== "aberta") continue;
      map[grupoDe(t)].push(t);
    }
    return map;
  }, [visiveis]);

  const concluidas = useMemo(() => visiveis.filter((t) => t.status !== "aberta"), [visiveis]);

  function nomeDe(id: string | null) {
    if (!id) return null;
    const m = members.find((x) => x.user_id === id);
    return m?.nome || m?.email || null;
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (titulo.trim().length < 2) return toast.error("Escreva o que precisa ser feito");
    setSalvando(true);
    try {
      await saveFn({ data: { titulo, prazo: prazo || null, responsavelId: responsavel || null } });
      setTitulo(""); setPrazo(""); setResponsavel("");
      toast.success("Tarefa criada");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar a tarefa");
    }
    setSalvando(false);
  }

  async function concluir(t: CrmTask) {
    const alvo = t.status === "aberta" ? "concluida" : "aberta";
    setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, status: alvo as any } : x)));
    try { await statusFn({ data: { id: t.id, status: alvo as any } }); await load(); }
    catch (e: any) { toast.error(e?.message); await load(); }
  }

  async function remover(t: CrmTask) {
    setTasks((p) => p.filter((x) => x.id !== t.id));
    try { await deleteFn({ data: { id: t.id } }); }
    catch (e: any) { toast.error(e?.message); await load(); }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight flex items-center gap-2">
            Tarefas <HelpTip text="Pendências do time. Cada tarefa pode ter responsável, prazo e ficar ligada a um cliente ou conversa." />
          </h1>
          <p className="text-sm text-muted-foreground">O que o time precisa fazer — atrasadas, de hoje e próximas</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={apenasMinhas ? "default" : "outline"} size="sm" onClick={() => setApenasMinhas((v) => !v)}>
            <User2 className="size-3.5 mr-1.5" /> Só minhas
          </Button>
          <Button variant={mostrarConcluidas ? "default" : "outline"} size="sm" onClick={() => setMostrarConcluidas((v) => !v)}>
            <CheckCircle2 className="size-3.5 mr-1.5" /> Mostrar concluídas
          </Button>
        </div>
      </header>

      <form onSubmit={criar} className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] p-3 flex flex-col sm:flex-row gap-2">
        <Input placeholder="Nova tarefa… ex: ligar para o cliente amanhã" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="flex-1" />
        <Input type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="sm:w-52" aria-label="Prazo" />
        <select
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          aria-label="Responsável"
          className="sm:w-48 rounded-md border border-[color:var(--hairline)] bg-[color:var(--panel-2)] px-3 py-2 text-sm"
        >
          <option value="">Sem responsável</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome || m.email}</option>)}
        </select>
        <Button type="submit" disabled={salvando}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1.5" /> Adicionar</>}
        </Button>
      </form>

      {loading ? (
        <div className="py-16 grid place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          {GRUPOS.map((g) => (
            porGrupo[g.key].length === 0 ? null : (
              <section key={g.key}>
                <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  {g.label} · {porGrupo[g.key].length}
                </h2>
                <ul className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] divide-y divide-[color:var(--hairline)]">
                  {porGrupo[g.key].map((t) => (
                    <TaskRow key={t.id} t={t} responsavel={nomeDe(t.responsavel_id)} onToggle={() => void concluir(t)} onDelete={() => void remover(t)} atrasada={g.key === "atrasadas"} />
                  ))}
                </ul>
              </section>
            )
          ))}

          {Object.values(porGrupo).every((l) => l.length === 0) && (
            <div className="rounded-2xl border border-dashed border-[color:var(--hairline)] p-10 text-center text-sm text-muted-foreground">
              Nenhuma tarefa aberta. Crie a primeira acima.
            </div>
          )}

          {mostrarConcluidas && concluidas.length > 0 && (
            <section>
              <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Concluídas · {concluidas.length}</h2>
              <ul className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] divide-y divide-[color:var(--hairline)] opacity-70">
                {concluidas.map((t) => (
                  <TaskRow key={t.id} t={t} responsavel={nomeDe(t.responsavel_id)} onToggle={() => void concluir(t)} onDelete={() => void remover(t)} atrasada={false} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  t, responsavel, onToggle, onDelete, atrasada,
}: { t: CrmTask; responsavel: string | null; onToggle: () => void; onDelete: () => void; atrasada: boolean }) {
  const feita = t.status === "concluida";
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <button onClick={onToggle} aria-label={feita ? "Reabrir tarefa" : "Concluir tarefa"} className="mt-0.5 text-muted-foreground hover:text-[color:var(--brand-text)]">
        {feita ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-[13.5px] font-medium break-words ${feita ? "line-through text-muted-foreground" : ""}`}>{t.titulo}</div>
        <div className="flex items-center gap-3 flex-wrap mt-1 text-[11.5px] text-muted-foreground">
          {t.prazo && (
            <span className={`inline-flex items-center gap-1 ${atrasada ? "text-red-600 font-semibold" : ""}`}>
              <CalendarClock className="size-3" />
              {new Date(t.prazo).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {responsavel && <span className="inline-flex items-center gap-1"><User2 className="size-3" /> {responsavel}</span>}
          {t.numero && <span className="font-mono">{t.numero}</span>}
          {t.origem === "ia" && <span className="inline-flex items-center gap-1 text-[color:var(--brand-text)]"><Bot className="size-3" /> criada pela IA</span>}
        </div>
        {t.descricao && <p className="text-[12.5px] text-muted-foreground mt-1 whitespace-pre-wrap">{t.descricao}</p>}
      </div>
      <button onClick={onDelete} aria-label="Excluir tarefa" className="text-muted-foreground hover:text-red-600 p-1">
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}
