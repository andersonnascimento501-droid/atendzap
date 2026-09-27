import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircleQuestion, X, Send, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAssistant } from "@/lib/assistant.functions";

type Msg = { from: "user" | "bot"; texto: string; rota?: string | null };

export function AssistantWidget() {
  const ask = useServerFn(askAssistant);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", texto: "Oi! Sou o Assistente AtendAi. Pergunte, por exemplo: \"Meu WhatsApp está conectado?\" ou \"O que falta configurar?\"" },
  ]);

  async function send() {
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    setMsgs((m) => [...m, { from: "user", texto: question }]);
    setBusy(true);
    try {
      const r = await ask({ data: { question } });
      setMsgs((m) => [...m, { from: "bot", texto: r.texto || "Não encontrei essa informação.", rota: r.rota }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { from: "bot", texto: e?.message ?? "Não consegui responder agora." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir Assistente AtendAi"
          className="fixed z-40 bottom-20 md:bottom-6 right-4 md:right-6 size-12 rounded-full grid place-items-center shadow-lg bg-primary text-primary-foreground"
        >
          <MessageCircleQuestion className="size-6" />
        </button>
      )}
      {open && (
        <div className="fixed z-40 bottom-20 md:bottom-6 right-4 md:right-6 w-[calc(100vw-2rem)] max-w-sm h-[480px] max-h-[70vh] flex flex-col rounded-2xl border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <b className="text-sm">Assistente AtendAi</b>
            <button onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-[13.5px]">
            {msgs.map((m, i) => (
              <div key={i} className={m.from === "user" ? "ml-8 rounded-xl bg-primary text-primary-foreground px-3 py-2" : "mr-8 rounded-xl bg-muted px-3 py-2"}>
                <p className="whitespace-pre-wrap">{m.texto}</p>
                {m.rota && (
                  <Link to={m.rota as any} onClick={() => setOpen(false)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold underline">
                    Abrir a tela <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            ))}
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <form className="flex gap-2 p-3 border-t" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sua dúvida…" maxLength={1000} />
            <Button type="submit" size="icon" disabled={busy || !q.trim()}><Send className="size-4" /></Button>
          </form>
          <p className="px-3 pb-2 text-[11px] text-muted-foreground">Cada pergunta usa 1 crédito. O assistente só consulta, não altera nada.</p>
        </div>
      )}
    </>
  );
}
