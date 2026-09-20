import { createFileRoute } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { Hand, MessageSquareText, Send, Sparkles, User, Search, Bot, ExternalLink, Star, Instagram, Phone, ArrowLeft, Info, Undo2, Target, User2, DollarSign, Paperclip, FolderOpen, Loader2, Download, CheckCheck, StickyNote, Tag, Clock, Trash2, Plus } from "lucide-react";
import { sendCsat } from "@/lib/csat.functions";
import { toast } from "sonner";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { setContactIaActive } from "@/lib/evolution.functions";
import { sendChannelMessage } from "@/lib/instagram.functions";
import { channelOf, contactDisplayId, type Channel } from "@/lib/channels";
import { LeadDrawer, type LeadCard, type Stage, type Member } from "@/components/crm/lead-drawer";
import { listTemplates, type MessageTemplate } from "@/lib/templates.functions";
import { listMaterials, sendMaterialToContact, sendMediaToContact, type Material } from "@/lib/materials.functions";
import { uploadMaterialFile, tipoIcon } from "@/components/agent-materials-panel";
import {
  listConversationStates, assignConversation, setConversationFila, setConversationTags,
  listConversationTags, createConversationTag, listConversationNotes, addConversationNote, deleteConversationNote,
  type ConversationState, type ConversationNote, type ConversationTag,
} from "@/lib/inbox.functions";

export const Route = createFileRoute("/app/conversas")({
  head: () => ({ meta: [{ title: `${brand.name} — Conversas` }] }),
  component: ConversasPage,
});

interface Msg {
  id: string; numero: string; contato_nome: string | null;
  direcao: "entrada" | "saida"; autor: "ia" | "humano" | "contato";
  texto: string; created_at: string; user_id: string | null; channel?: string | null;
  tipo?: string | null; midia?: any;
}

type Filter =
  | "todas" | "nao_lidas" | "nao_atribuidas" | "minhas" | "do_time"
  | "aguardando" | "ia_ativa" | "resolvidas";

const ESPERA_ALERTA_MIN = 30;

function esperandoHaMin(st?: ConversationState): number | null {
  if (!st?.ultima_entrada_em) return null;
  const entrada = new Date(st.ultima_entrada_em).getTime();
  const saida = st.ultima_saida_em ? new Date(st.ultima_saida_em).getTime() : 0;
  if (saida >= entrada) return null;
  return Math.floor((Date.now() - entrada) / 60000);
}

const QUICK_REPLIES = [
  "Olá! Em que posso ajudar?",
  "Obrigado pelo contato! Vou verificar e já te respondo.",
  "Pode me passar mais detalhes, por favor?",
  "Posso te enviar uma proposta?",
];

type StageWithTipo = Stage & { tipo?: string };

function ConversasPage() {
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id;
  const userId = ctx.user.id;


  const sendFn = useServerFn(sendChannelMessage);
  const sendCsatFn = useServerFn(sendCsat);
  const toggleIaFn = useServerFn(setContactIaActive);
  const fetchTemplates = useServerFn(listTemplates);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const fetchMaterials = useServerFn(listMaterials);
  const sendMaterialFn = useServerFn(sendMaterialToContact);
  const sendMediaFn = useServerFn(sendMediaToContact);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const composerRef = useRef<HTMLInputElement>(null);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [cards, setCards] = useState<Record<string, LeadCard>>({});
  const [pauses, setPauses] = useState<Record<string, boolean>>({}); // numero → pausado?
  const [stages, setStages] = useState<StageWithTipo[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(() => {
    if (typeof window === "undefined") return "todas";
    return (localStorage.getItem("conv:filter") as Filter) || "todas";
  });
  const [channelFilter, setChannelFilter] = useState<"todos" | Channel>("todos");
  const [active, setActive] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [drawerCard, setDrawerCard] = useState<LeadCard | null>(null);
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // Trabalho em time: situação da conversa, notas internas e etiquetas.
  const fetchStates = useServerFn(listConversationStates);
  const assignFn = useServerFn(assignConversation);
  const filaFn = useServerFn(setConversationFila);
  const tagsFn = useServerFn(setConversationTags);
  const fetchConvTags = useServerFn(listConversationTags);
  const createConvTag = useServerFn(createConversationTag);
  const fetchNotes = useServerFn(listConversationNotes);
  const addNoteFn = useServerFn(addConversationNote);
  const delNoteFn = useServerFn(deleteConversationNote);
  const [states, setStates] = useState<Record<string, ConversationState>>({});
  const [convTags, setConvTags] = useState<ConversationTag[]>([]);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    if (!companyId) return;
    void load(companyId);
    const ch = supabase
      .channel(`tenant:${companyId}:mensagens`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((p) => [m, ...p].slice(0, 500));
          if (m.direcao === "entrada" && m.numero !== active) {
            setUnread((u) => ({ ...u, [m.numero]: (u[m.numero] ?? 0) + 1 }));
            try {
              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
                new Notification(m.contato_nome ?? m.numero, { body: m.texto?.slice(0, 140) ?? "Nova mensagem", tag: m.numero });
              }
            } catch {}
          }
        },
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "contact_pause", filter: `company_id=eq.${companyId}` },
        () => { void loadPauses(companyId); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, active]);

  useEffect(() => {
    if (active) setUnread((u) => ({ ...u, [active]: 0 }));
    requestAnimationFrame(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }); });
  }, [active, msgs.length]);

  useEffect(() => {
    try { localStorage.setItem("conv:filter", filter); } catch {}
  }, [filter]);

  // Load templates once
  useEffect(() => {
    void (async () => {
      try { setTemplates(await fetchTemplates()); } catch {}
      try { setMaterials((await fetchMaterials({})).filter((m) => m.ativo)); } catch {}
      try { setConvTags(await fetchConvTags()); } catch {}
    })();
    // eslint-disable-next-line
  }, []);

  // Notas internas da conversa aberta
  useEffect(() => {
    if (!active) { setNotes([]); return; }
    let alive = true;
    void (async () => {
      try {
        const rows = await fetchNotes({ data: { numero: active } });
        if (alive) setNotes(rows);
      } catch { if (alive) setNotes([]); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [active]);

  // Keyboard shortcuts attached after `conversations` is declared (see below).



  async function loadPauses(cid: string) {
    const { data } = await supabase.from("contact_pause").select("numero,pausado").eq("company_id", cid);
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((r: any) => { map[r.numero] = !!r.pausado; });
    setPauses(map);
  }

  async function load(cid: string) {
    const [{ data: m }, { data: c }, { data: st }, { data: cu }] = await Promise.all([
      supabase.from("mensagens").select("*").eq("company_id", cid).order("created_at", { ascending: false }).limit(500),
      supabase.from("crm_cards").select("*").eq("company_id", cid),
      supabase.from("crm_stage").select("id,nome,cor,ordem,tipo").eq("company_id", cid).order("ordem", { ascending: true }),
      supabase.from("company_user").select("user_id,profiles(nome,email)").eq("company_id", cid).eq("ativo", true),
    ]);
    setMsgs((m ?? []) as Msg[]);
    const map: Record<string, LeadCard> = {};
    (c ?? []).forEach((r: any) => { map[r.numero] = r; });
    setCards(map);
    setStages((st ?? []) as any);
    setMembers(((cu ?? []) as any[]).map((r) => ({
      user_id: r.user_id, nome: r.profiles?.nome ?? null, email: r.profiles?.email ?? null,
    })));
    const { data: cf } = await supabase.from("agent_custom_fields").select("key,label").eq("company_id", cid);
    const fl: Record<string, string> = {};
    (cf ?? []).forEach((r: any) => { fl[r.key] = r.label || r.key; });
    setFieldLabels(fl);
    await loadPauses(cid);
    await loadStates();
  }

  async function loadStates() {
    try {
      const rows = await fetchStates();
      const st: Record<string, ConversationState> = {};
      rows.forEach((r) => { st[r.numero] = r; });
      setStates(st);
    } catch {}
  }

  function activeConvName(): string | null {
    return active ? (cards[active]?.nome ?? null) : null;
  }

  function ownerOf(numero: string): string | null {
    return states[numero]?.owner_id ?? cards[numero]?.owner_id ?? null;
  }

  async function atribuir(numero: string, ownerId: string | null) {
    setStates((p) => ({ ...p, [numero]: { ...(p[numero] ?? { numero, channel: "whatsapp", fila: "aberta", tags: [], ultima_entrada_em: null, ultima_saida_em: null, resolvido_em: null, owner_id: null }), owner_id: ownerId } }));
    try {
      await assignFn({ data: { numero, ownerId } });
      toast.success(ownerId ? "Conversa atribuída" : "Responsável removido");
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível atribuir"); await loadStates(); }
  }

  async function mudarFila(numero: string, fila: "aberta" | "aguardando" | "resolvida") {
    setStates((p) => ({ ...p, [numero]: { ...(p[numero] as any), numero, fila } }));
    try {
      await filaFn({ data: { numero, fila } });
      toast.success(fila === "resolvida" ? "Conversa marcada como resolvida" : "Conversa reaberta");
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível mudar a situação"); await loadStates(); }
  }

  async function alternarTag(numero: string, nome: string) {
    const atuais = states[numero]?.tags ?? [];
    const proximas = atuais.includes(nome) ? atuais.filter((t) => t !== nome) : [...atuais, nome];
    setStates((p) => ({ ...p, [numero]: { ...(p[numero] as any), numero, tags: proximas } }));
    try { await tagsFn({ data: { numero, tags: proximas } }); }
    catch (e: any) { toast.error(e?.message); await loadStates(); }
  }

  async function criarTag() {
    const nome = newTag.trim();
    if (!nome || !active) return;
    try {
      const tag = await createConvTag({ data: { nome } });
      setConvTags((p) => (p.some((t) => t.id === tag.id) ? p : [...p, tag]));
      setNewTag("");
      await alternarTag(active, tag.nome);
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível criar a etiqueta"); }
  }

  async function salvarNota() {
    const texto = noteDraft.trim();
    if (!texto || !active) return;
    setSavingNote(true);
    try {
      const nota = await addNoteFn({ data: { numero: active, texto } });
      setNotes((p) => [nota, ...p]);
      setNoteDraft("");
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível salvar a nota"); }
    setSavingNote(false);
  }

  async function removerNota(id: string) {
    setNotes((p) => p.filter((n) => n.id !== id));
    try { await delNoteFn({ data: { id } }); }
    catch (e: any) { toast.error(e?.message ?? "Só quem escreveu pode apagar a nota"); }
  }

  async function enviarMaterial(m: Material) {
    if (!active) return;
    setShowMaterialPicker(false);
    try {
      await sendMaterialFn({ data: { numero: active, materialId: m.id, contatoNome: activeConvName() } });
      toast.success(`${m.nome} enviado`);
      if (companyId) await load(companyId);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar o material");
    }
  }

  async function enviarArquivo(file: File | null) {
    if (!file || !active || !companyId) return;
    if (file.size > 25 * 1024 * 1024) return toast.error("Arquivo muito grande. O limite é 25 MB.");
    const mime = file.type || "";
    const tipo = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
    setUploading(true);
    try {
      const path = await uploadMaterialFile(companyId, file);
      await sendMediaFn({
        data: {
          numero: active,
          storagePath: path,
          tipo: tipo as any,
          mimeType: mime,
          fileName: file.name,
          caption: composer.trim() || null,
          contatoNome: activeConvName(),
          clientKey: path,
        },
      });
      setComposer("");
      toast.success("Arquivo enviado");
      if (companyId) await load(companyId);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar o arquivo");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const conversations = useMemo(() => {
    const map = new Map<string, { numero: string; nome: string | null; last: Msg }>();
    for (const m of msgs) {
      const cur = map.get(m.numero);
      if (!cur) map.set(m.numero, { numero: m.numero, nome: m.contato_nome, last: m });
    }
    let list = Array.from(map.values());
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => (c.nome ?? "").toLowerCase().includes(q) || c.numero.includes(q));
    }
    if (channelFilter !== "todos") list = list.filter((c) => channelOf(c.numero) === channelFilter);
    // Filtros (fila do time + estado do lead)
    list = list.filter((c) => matchFilter(c.numero, filter));
    return list.sort((a, b) => +new Date(b.last.created_at) - +new Date(a.last.created_at));
    // eslint-disable-next-line
  }, [msgs, search, filter, channelFilter, unread, cards, pauses, stages, userId, states]);

  function matchFilter(numero: string, f: Filter): boolean {
    const card = cards[numero];
    const st = states[numero];
    const iaAtiva = !(pauses[numero] ?? false);
    const tipo = card?.stage_id ? stages.find((s) => s.id === card.stage_id)?.tipo : null;
    const resolvida = st?.fila === "resolvida" || tipo === "ganho" || tipo === "perda";
    const owner = st?.owner_id ?? card?.owner_id ?? null;
    switch (f) {
      case "nao_lidas": return (unread[numero] ?? 0) > 0 && !resolvida;
      case "nao_atribuidas": return !owner && !resolvida;
      case "minhas": return owner === userId && !resolvida;
      case "do_time": return !!owner && owner !== userId && !resolvida;
      case "aguardando": return !resolvida && esperandoHaMin(st) !== null;
      case "ia_ativa": return iaAtiva && !resolvida;
      case "resolvidas": return resolvida;
      default: return !resolvida;
    }
  }

  const filterCounts = useMemo(() => {
    const numeros = Array.from(new Set(msgs.map((m) => m.numero)));
    const count = (f: Filter) => numeros.filter((n) => matchFilter(n, f)).length;
    return {
      nao_lidas: Object.values(unread).reduce((a, b) => a + b, 0),
      nao_atribuidas: count("nao_atribuidas"),
      minhas: count("minhas"),
      do_time: count("do_time"),
      aguardando: count("aguardando"),
      resolvidas: count("resolvidas"),
    };
    // eslint-disable-next-line
  }, [msgs, unread, states, cards, stages, pauses, userId]);

  const thread = useMemo(() =>
    [...msgs].filter((m) => m.numero === active).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [msgs, active]);

  const activeConv = conversations.find((c) => c.numero === active) ?? (active ? { numero: active, nome: cards[active]?.nome ?? null, last: thread[thread.length - 1] } : null);
  const activeCard = active ? cards[active] : undefined;
  const activeStage = activeCard?.stage_id ? stages.find((s) => s.id === activeCard.stage_id) : null;
  const iaAtivaAqui = active ? !(pauses[active] ?? false) : true;
  const activeOwner = activeCard?.owner_id ? members.find((m) => m.user_id === activeCard.owner_id) : null;
  const activeColetadas = Object.entries((activeCard?.custom_data ?? {}) as Record<string, any>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "");

  // Keyboard shortcuts (after conversations is declared)
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable);
      if (ev.key === "/" && t === composerRef.current && (composerRef.current?.value ?? "") === "") {
        ev.preventDefault();
        setShowTemplatePicker(true);
        return;
      }
      if (ev.key === "Escape") setShowTemplatePicker(false);
      if (typing) return;
      if (ev.key === "j" || ev.key === "k") {
        ev.preventDefault();
        const idx = conversations.findIndex((c) => c.numero === active);
        const next = ev.key === "j" ? Math.min(conversations.length - 1, idx + 1) : Math.max(0, idx - 1);
        const target = conversations[next];
        if (target) setActive(target.numero);
      } else if (ev.key === "r" && active) {
        ev.preventDefault();
        composerRef.current?.focus();
      } else if (ev.key === "e" && active) {
        ev.preventDefault();
        void toggleIa(false);
      } else if (ev.key === "/") {
        ev.preventDefault();
        composerRef.current?.focus();
        setShowTemplatePicker(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [active, conversations.length]);


  async function toggleIa(v: boolean) {
    if (!active) return;
    setPauses((p) => ({ ...p, [active]: !v })); // optimistic
    try { await toggleIaFn({ data: { numero: active, ativa: v } }); }
    catch (e: any) { toast.error(e?.message); setPauses((p) => ({ ...p, [active]: v })); }
  }

  async function assumir() {
    if (!active) return;
    await toggleIa(false);
    toast.success("Você assumiu o atendimento. O atendente IA foi pausado.");
  }

  async function devolverParaIa() {
    if (!active) return;
    await toggleIa(true);
    toast.success("Conversa devolvida para o atendente IA.");
  }

  async function sendMsg(text?: string) {
    const txt = (text ?? composer).trim();
    if (!txt || !active || !companyId) return;
    setSending(true);
    try {
      await sendFn({ data: { numero: active, texto: txt, contatoNome: activeConv?.nome ?? null } });
      setComposer("");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight flex items-center gap-2">Conversas <HelpTip text="Caixa de entrada unificada do WhatsApp. Filtre por status, assuma um atendimento manualmente, envie CSAT e responda em nome do agente." /></h1>
          <p className="text-sm text-muted-foreground">Inbox unificada em tempo real — WhatsApp e Instagram</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ChannelTabs value={channelFilter} onChange={setChannelFilter} />
          <FilterTabs value={filter} onChange={setFilter} counts={filterCounts} />

        </div>
      </header>

      <div className="grid md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_320px] border border-[color:var(--hairline)] rounded-2xl overflow-hidden h-[calc(100dvh-210px)] min-h-[480px] bg-[color:var(--panel)]">
        {/* LISTA */}
        <aside className={`border-r border-[color:var(--hairline)] flex-col min-h-0 bg-[color:var(--panel)] ${active ? "hidden md:flex" : "flex"}`}>
          <div className="p-3 border-b border-[color:var(--hairline)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Buscar contato…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
          <ul className="flex-1 overflow-auto">
            {conversations.length === 0 && (
              <li className="p-8 text-sm text-muted-foreground text-center">
                {filter === "todas" && channelFilter === "todos" && !search.trim()
                  ? <>Nenhuma conversa ainda.<br />Quando alguém chamar sua empresa, aparecerá aqui.</>
                  : "Nenhuma conversa neste filtro."}
              </li>
            )}
            {conversations.map((c) => {
              const on = c.numero === active;
              const u = unread[c.numero] ?? 0;
              const iaAtiva = !(pauses[c.numero] ?? false);
              return (
                <li key={c.numero}>
                  <button
                    onClick={() => setActive(c.numero)}
                    className={`relative w-full text-left flex gap-3 p-3 border-b border-[color:var(--hairline)] transition-colors ${
                      on ? "bg-[color:var(--brand-soft)]" : "hover:bg-[color:var(--panel-2)]"
                    }`}
                  >
                    {on && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[color:var(--brand)]" />}
                    <InitialsAvatar name={c.nome || c.numero} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ChannelIcon channel={channelOf(c.numero)} />
                        <b className="text-[13.5px] truncate">{c.nome || contactDisplayId(c.numero, c.nome)}</b>
                        <span className="ml-auto text-[10.5px] text-muted-foreground whitespace-nowrap">
                          {new Date(c.last.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[12.5px] text-muted-foreground truncate flex-1">{c.last.texto}</p>
                        {(() => {
                          const esperaMin = esperandoHaMin(states[c.numero]);
                          if (esperaMin === null || esperaMin < ESPERA_ALERTA_MIN) return null;
                          const txt = esperaMin >= 60 ? `${Math.floor(esperaMin / 60)}h` : `${esperaMin}m`;
                          return (
                            <span title={`Cliente esperando há ${txt}`} className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-amber-600">
                              <Clock className="size-3" />{txt}
                            </span>
                          );
                        })()}
                        {iaAtiva ? (
                          <span title="Atendente IA ativo" className="text-[color:var(--brand-text)]"><Bot className="size-3.5" /></span>
                        ) : (
                          <span title="Atendimento humano" className="text-amber-600"><Hand className="size-3.5" /></span>
                        )}
                        {u > 0 && (
                          <span className="bg-[color:var(--brand)] text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full grid place-items-center px-1">
                            {u}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* THREAD */}
        <section className={`flex-col min-h-0 bg-[color:var(--panel-2)] ${active ? "flex" : "hidden md:flex"}`}>
          {!active ? (
            <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
              <div className="text-center"><MessageSquareText className="mx-auto mb-2 size-6" />Selecione uma conversa</div>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-[color:var(--hairline)] bg-[color:var(--panel)]">
                <button onClick={() => setActive(null)} aria-label="Voltar para a lista"
                  className="md:hidden -ml-1 p-1.5 rounded-lg text-muted-foreground hover:bg-[color:var(--panel-2)]">
                  <ArrowLeft className="size-4" />
                </button>
                <InitialsAvatar name={activeConv?.nome || active} size={38} />
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                    <ChannelIcon channel={channelOf(active)} />
                    {activeConv?.nome || contactDisplayId(active, activeConv?.nome)}
                  </div>
                  <div className="mt-0.5">
                    <StatusPill iaAtiva={iaAtivaAqui} />
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <select
                    aria-label="Responsável pela conversa"
                    value={ownerOf(active) ?? ""}
                    onChange={(e) => void atribuir(active, e.target.value || null)}
                    className="hidden sm:block max-w-[160px] rounded-md border border-[color:var(--hairline)] bg-[color:var(--panel-2)] px-2 py-1.5 text-[12.5px]"
                  >
                    <option value="">Sem responsável</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.user_id === userId ? "Eu" : (m.nome || m.email)}
                      </option>
                    ))}
                  </select>
                  {states[active]?.fila === "resolvida" ? (
                    <Button size="sm" variant="outline" onClick={() => void mudarFila(active, "aberta")}>
                      <Undo2 className="size-3.5 sm:mr-1.5" /> <span className="hidden lg:inline">Reabrir</span>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void mudarFila(active, "resolvida")}>
                      <CheckCheck className="size-3.5 sm:mr-1.5" /> <span className="hidden lg:inline">Resolver</span>
                    </Button>
                  )}

                  {iaAtivaAqui ? (
                    <Button size="sm" onClick={() => void assumir()}>
                      <Hand className="size-3.5 mr-1.5" /> <span className="hidden sm:inline">Assumir conversa</span><span className="sm:hidden">Assumir</span>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void devolverParaIa()}>
                      <Undo2 className="size-3.5 mr-1.5" /> <span className="hidden sm:inline">Devolver para IA</span><span className="sm:hidden">Devolver</span>
                    </Button>
                  )}
                  {activeCard && (
                    <Button size="sm" variant="ghost" className="xl:hidden" aria-label="Detalhes do cliente"
                      onClick={() => setDrawerCard(activeCard)}>
                      <Info className="size-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={async () => {
                    if (!active) return;
                    try {
                      await sendCsatFn({ data: { numero: active, contatoNome: activeConv?.nome ?? null } });
                      toast.success("Pesquisa de satisfação enviada");
                    } catch (e: any) { toast.error(e?.message ?? "Erro ao enviar"); }
                  }}>
                    <Star className="size-3.5 sm:mr-1" /> <span className="hidden lg:inline">Satisfação</span>
                  </Button>
                </div>
              </header>

              <div ref={threadRef} className="flex-1 overflow-auto p-4 flex flex-col gap-2.5">
                {thread.map((m) => <Bubble key={m.id} m={m} />)}
              </div>

              {/* Quick replies */}
              <div className="px-4 pt-2 border-t border-[color:var(--hairline)] bg-[color:var(--panel)] flex gap-2 overflow-x-auto">
                {QUICK_REPLIES.map((q) => (
                  <button key={q} onClick={() => void sendMsg(q)}
                    className="shrink-0 text-[12px] px-3 py-1.5 rounded-full bg-[color:var(--panel-2)] hover:bg-[color:var(--brand-soft)] hover:text-[color:var(--brand-text)] text-muted-foreground transition-colors">
                    {q}
                  </button>
                ))}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); void sendMsg(); }}
                className="px-4 py-3 border-t border-[color:var(--hairline)] bg-[color:var(--panel)] flex gap-2 items-center relative">
                {showTemplatePicker && templates.length > 0 && (
                  <div className="absolute bottom-[calc(100%+6px)] left-4 right-16 max-h-64 overflow-auto bg-[color:var(--panel)] border border-[color:var(--hairline)] rounded-xl shadow-lg z-10 p-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 font-semibold">Templates (Esc para fechar)</div>
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setComposer(t.texto); setShowTemplatePicker(false); composerRef.current?.focus(); }}
                        className="w-full text-left flex gap-2 px-2 py-2 rounded-md hover:bg-[color:var(--panel-2)] text-sm"
                      >
                        <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">/{t.atalho}</code>
                        <span className="truncate text-muted-foreground">{t.texto}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showMaterialPicker && (
                  <div className="absolute bottom-[calc(100%+6px)] left-4 right-16 max-h-64 overflow-auto bg-[color:var(--panel)] border border-[color:var(--hairline)] rounded-xl shadow-lg z-10 p-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 font-semibold">Materiais da empresa</div>
                    {materials.length === 0 ? (
                      <p className="text-[12.5px] text-muted-foreground px-2 py-2">Nenhum material cadastrado ainda.</p>
                    ) : materials.map((mt) => {
                      const Icon = tipoIcon(mt.tipo);
                      return (
                        <button key={mt.id} type="button" onClick={() => void enviarMaterial(mt)}
                          className="w-full text-left flex gap-2 items-center px-2 py-2 rounded-md hover:bg-[color:var(--panel-2)] text-sm">
                          <Icon className="size-3.5 shrink-0 text-[color:var(--brand-text)]" />
                          <span className="truncate">{mt.nome}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => void enviarArquivo(e.target.files?.[0] ?? null)} />
                <button type="button" aria-label="Enviar arquivo" disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="size-10 shrink-0 rounded-full grid place-items-center text-muted-foreground hover:bg-[color:var(--panel-2)] disabled:opacity-50">
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                </button>
                <button type="button" aria-label="Enviar material da empresa"
                  onClick={() => setShowMaterialPicker((v) => !v)}
                  className="size-10 shrink-0 rounded-full grid place-items-center text-muted-foreground hover:bg-[color:var(--panel-2)]">
                  <FolderOpen className="size-4" />
                </button>
                <input
                  ref={composerRef}
                  value={composer}
                  onChange={(e) => {
                    const v = e.target.value;
                    setComposer(v);
                    if (v.startsWith("/")) {
                      setShowTemplatePicker(true);
                      // resolve atalho exato
                      const slug = v.slice(1).split(/\s/)[0].toLowerCase();
                      const hit = templates.find((t) => t.atalho === slug);
                      if (hit && v.endsWith(" ")) {
                        setComposer(hit.texto);
                        setShowTemplatePicker(false);
                      }
                    } else {
                      setShowTemplatePicker(false);
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Escape") setShowTemplatePicker(false); }}
                  placeholder="Digite uma mensagem… (digite / para templates)"
                  disabled={sending}
                  className="flex-1 bg-[color:var(--panel-2)] border border-[color:var(--hairline)] rounded-full px-4 py-2.5 text-sm outline-none focus:border-[color:var(--brand)]/60"
                />
                <button
                  type="submit" disabled={sending || !composer.trim()}
                  className="size-10 rounded-full grid place-items-center text-primary-foreground bg-[color:var(--brand)] hover:brightness-110 transition disabled:opacity-50"
                  aria-label="Enviar"
                >
                  <Send className="size-4" />
                </button>
              </form>
            </>
          )}
        </section>

        {/* INFO */}
        <aside className="hidden xl:flex flex-col gap-4 border-l border-[color:var(--hairline)] p-5 bg-[color:var(--panel)] overflow-auto">
          {!active ? (
            <p className="text-xs text-muted-foreground text-center mt-6">Selecione uma conversa para ver os detalhes.</p>
          ) : (
            <>
              <div className="flex flex-col items-center text-center gap-2 pb-4 border-b border-[color:var(--hairline)]">
                <InitialsAvatar name={activeConv?.nome || active} size={72} />
                <div>
                  <div className="font-semibold text-sm">{activeConv?.nome || contactDisplayId(active, activeConv?.nome)}</div>
                  <div className="text-[11.5px] text-muted-foreground font-mono flex items-center justify-center gap-1.5">
                    <ChannelIcon channel={channelOf(active)} />
                    {channelOf(active) === "instagram" ? "Instagram Direct" : active}
                  </div>
                </div>
              </div>
              <div><StatusPill iaAtiva={iaAtivaAqui} /></div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Etapa do funil</div>
                {activeStage ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full ring-1"
                    style={{ background: `color-mix(in oklab, ${activeStage.cor} 18%, transparent)`, color: activeStage.cor, borderColor: `color-mix(in oklab, ${activeStage.cor} 35%, transparent)` } as any}>
                    <Sparkles className="size-3.5" /> {activeStage.nome}
                  </span>
                ) : <span className="text-xs text-muted-foreground">Sem etapa</span>}
              </div>
              {activeOwner && (
                <InfoRow icon={<User2 className="size-3.5" />} label="Responsável" value={activeOwner.nome || activeOwner.email || "—"} />
              )}
              {(activeCard?.valor ?? 0) > 0 && (
                <InfoRow icon={<DollarSign className="size-3.5" />} label="Oportunidade"
                  value={`R$ ${Number(activeCard?.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
              )}
              {activeCard?.proxima_acao && (
                <InfoRow icon={<Target className="size-3.5" />} label="Próxima ação" value={activeCard.proxima_acao} />
              )}
              {(activeCard?.tags ?? []).length > 0 && (
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {(activeCard?.tags ?? []).map((t) => (
                      <span key={t} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[color:var(--panel-2)] text-muted-foreground border border-[color:var(--hairline)]">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {activeColetadas.length > 0 && (
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Informações coletadas</div>
                  <ul className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)] divide-y divide-[color:var(--hairline)]">
                    {activeColetadas.map(([k, v]) => (
                      <li key={k} className="px-3 py-2 text-[12.5px] flex gap-2">
                        <span className="text-muted-foreground min-w-[45%]">{fieldLabels[k] || k}</span>
                        <span className="font-medium break-words">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {activeCard?.observacao && (
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Observações</div>
                  <p className="text-[13px] text-foreground/85 whitespace-pre-wrap">{activeCard.observacao}</p>
                </div>
              )}
              {activeCard && (
                <Button variant="outline" size="sm" onClick={() => setDrawerCard(activeCard)}>
                  <ExternalLink className="size-3.5 mr-1.5" /> Ver cliente
                </Button>
              )}

              {/* Etiquetas da conversa (separadas das tags do lead) */}
              <div className="pt-3 border-t border-[color:var(--hairline)]">
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold flex items-center gap-1.5">
                  <Tag className="size-3" /> Etiquetas da conversa
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {convTags.length === 0 && <span className="text-[11.5px] text-muted-foreground">Nenhuma etiqueta criada ainda.</span>}
                  {convTags.map((t) => {
                    const on = (states[active]?.tags ?? []).includes(t.nome);
                    return (
                      <button key={t.id} onClick={() => void alternarTag(active, t.nome)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                          on ? "text-primary-foreground" : "bg-[color:var(--panel-2)] text-muted-foreground border-[color:var(--hairline)]"
                        }`}
                        style={on ? { background: t.cor, borderColor: t.cor } : undefined}>
                        {t.nome}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1.5">
                  <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nova etiqueta…"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void criarTag(); } }}
                    className="h-8 text-[12.5px]" />
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => void criarTag()} aria-label="Criar etiqueta">
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Notas internas — o cliente nunca recebe */}
              <div className="pt-3 border-t border-[color:var(--hairline)]">
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold flex items-center gap-1.5">
                  <StickyNote className="size-3" /> Notas internas
                  <HelpTip text="Só o seu time vê. O cliente nunca recebe essas anotações." />
                </div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Anotar algo para o time…"
                  rows={2}
                  className="w-full rounded-md border border-[color:var(--hairline)] bg-[color:var(--panel-2)] px-2.5 py-2 text-[12.5px] resize-y"
                />
                <Button size="sm" className="mt-1.5 w-full" disabled={savingNote || !noteDraft.trim()} onClick={() => void salvarNota()}>
                  {savingNote ? <Loader2 className="size-3.5 animate-spin" /> : "Salvar nota"}
                </Button>
                <ul className="mt-2 space-y-1.5">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-[color:var(--panel-2)] border border-[color:var(--hairline)] px-2.5 py-2">
                      <div className="flex items-start gap-2">
                        <p className="text-[12.5px] whitespace-pre-wrap flex-1 break-words">{n.texto}</p>
                        {n.autor_id === userId && (
                          <button onClick={() => void removerNota(n.id)} aria-label="Apagar nota" className="text-muted-foreground hover:text-red-600">
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto pt-3 border-t border-[color:var(--hairline)] text-[11.5px] text-muted-foreground flex items-center gap-1.5">
                <User className="size-3" /> {thread.length} mensagens nesta conversa
              </div>
            </>
          )}
        </aside>
      </div>

      {companyId && (
        <LeadDrawer
          card={drawerCard} stages={stages} members={members} companyId={companyId}
          onClose={() => setDrawerCard(null)}
          onChanged={() => { if (companyId) void load(companyId); }}
        />
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-[12.5px]">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <span className="text-muted-foreground min-w-[42%]">{label}</span>
      <span className="font-medium break-words flex-1">{value}</span>
    </div>
  );
}

function StatusPill({ iaAtiva }: { iaAtiva: boolean }) {
  return iaAtiva ? (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand-text)]">
      <Bot className="size-3" /> Atendente IA ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
      <Hand className="size-3" /> Atendimento humano
    </span>
  );
}

function MediaAttachment({ m }: { m: Msg }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const path = m.midia?.storage_path as string | undefined;
  const tipo = (m.tipo || m.midia?.tipo || "document") as string;

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!path) return;
      const { data, error } = await supabase.storage.from("materiais").createSignedUrl(path, 3600);
      if (!alive) return;
      if (error || !data?.signedUrl) setErro(true);
      else setUrl(data.signedUrl);
    })();
    return () => { alive = false; };
  }, [path]);

  if (erro) return <p className="text-[12px] opacity-80 mb-1">Arquivo indisponível.</p>;
  if (!url) return <div className="h-10 grid place-items-center opacity-70"><Loader2 className="size-4 animate-spin" /></div>;

  if (tipo === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mb-1.5">
        <img src={url} alt={m.midia?.file_name || "Imagem enviada na conversa"} loading="lazy" className="rounded-lg max-h-64 w-auto" />
      </a>
    );
  }
  if (tipo === "audio") {
    return <audio controls src={url} className="mb-1.5 w-56 max-w-full" />;
  }
  if (tipo === "video") {
    return <video controls src={url} className="mb-1.5 rounded-lg max-h-64 w-auto" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="mb-1.5 inline-flex items-center gap-2 text-[12.5px] underline break-all">
      <Download className="size-3.5 shrink-0" /> {m.midia?.file_name || "Abrir arquivo"}
    </a>
  );
}

function ChannelIcon({ channel }: { channel: Channel }) {
  return channel === "instagram" ? (
    <Instagram className="size-3.5 shrink-0 text-[#C13584]" aria-label="Instagram" />
  ) : (
    <Phone className="size-3.5 shrink-0 text-emerald-600" aria-label="WhatsApp" />
  );
}

function ChannelTabs({ value, onChange }: { value: "todos" | Channel; onChange: (v: "todos" | Channel) => void }) {
  const opts: Array<{ v: "todos" | Channel; label: string }> = [
    { v: "todos", label: "Todos os canais" },
    { v: "whatsapp", label: "WhatsApp" },
    { v: "instagram", label: "Instagram" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-[color:var(--hairline)] bg-[color:var(--panel)] p-1">
      {opts.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 text-[13px] font-semibold rounded-md transition-colors ${
            value === o.v ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-text)]" : "text-muted-foreground hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

type FilterCounts = {
  nao_lidas: number; nao_atribuidas: number; minhas: number;
  do_time: number; aguardando: number; resolvidas: number;
};

function FilterTabs({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: FilterCounts }) {
  const opts: { v: Filter; label: string; badge?: number }[] = [
    { v: "todas", label: "Todas" },
    { v: "nao_lidas", label: "Não lidas", badge: counts.nao_lidas },
    { v: "nao_atribuidas", label: "Não atribuídas", badge: counts.nao_atribuidas },
    { v: "minhas", label: "Minhas", badge: counts.minhas },
    { v: "do_time", label: "Do time", badge: counts.do_time },
    { v: "aguardando", label: "Aguardando cliente", badge: counts.aguardando },
    { v: "ia_ativa", label: "IA ativa" },
    { v: "resolvidas", label: "Resolvidas", badge: counts.resolvidas },
  ];
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-[color:var(--hairline)] bg-[color:var(--panel)] p-1">
      {opts.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 text-[13px] font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
            value === o.v ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-text)]" : "text-muted-foreground hover:text-foreground"
          }`}>
          {o.label}
          {o.badge ? <span className="bg-[color:var(--brand)] text-primary-foreground text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] grid place-items-center">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const isOut = m.direcao === "saida";
  const ia = m.autor === "ia";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] sm:max-w-[62%] px-3.5 py-2.5 text-[13.5px] ${
          isOut
            ? "bg-[color:var(--brand)] text-primary-foreground rounded-2xl rounded-br-md font-medium"
            : "bg-[color:var(--panel)] text-foreground rounded-2xl rounded-bl-md border border-[color:var(--hairline)]"
        }`}
      >
        {isOut && (
          <span className="block text-[9.5px] font-bold opacity-80 mb-1 uppercase tracking-wider">
            {ia ? "⚡ Agente IA" : "Atendente"}
          </span>
        )}
        {m.midia?.storage_path ? <MediaAttachment m={m} /> : null}
        {m.texto ? <div className="whitespace-pre-wrap break-words">{m.texto}</div> : null}
        <div className={`text-[10.5px] mt-1 ${isOut ? "opacity-70" : "text-muted-foreground"}`}>
          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
