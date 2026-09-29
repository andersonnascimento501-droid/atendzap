import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getTestMode, setTestMode } from "@/lib/test-mode.functions";
import { phoneLast4 } from "@/lib/test-mode";

export function WhatsappTestCard({ variant = "agent" }: { variant?: "onboarding" | "agent" }) {
  const load = useServerFn(getTestMode);
  const save = useServerFn(setTestMode);
  const [state, setState] = useState<{ active: boolean; phone: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    load().then((r) => setState({ active: r.active, phone: r.phone })).catch(() => setState({ active: false, phone: null }));
  }, [load]);

  async function run(action: "activate" | "deactivate" | "release") {
    setBusy(true);
    try {
      const r = await save({ data: { action, phone } });
      setState({ active: r.active, phone: r.phone ?? state?.phone ?? null });
      setEditing(false);
      toast.success(action === "activate" ? "Modo de teste ativo" : action === "release" ? "Atendimento liberado para todos" : "Teste desativado");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const showForm = editing || !state.phone || (variant === "onboarding" && !state.active);

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-primary" />
        <div className="text-sm font-semibold">{variant === "onboarding" ? "Teste real pelo WhatsApp" : "Teste pelo WhatsApp"}</div>
        <span className="ml-auto text-xs text-muted-foreground">
          {!state.phone ? "Sem número configurado" : state.active ? "Modo de teste ativo" : "Atendimento liberado para todos"}
        </span>
      </div>

      {state.active && state.phone && (
        <div className="rounded-lg bg-primary/10 text-primary text-xs px-3 py-2">
          Modo de teste ativo. Seu agente responde somente ao número final {phoneLast4(state.phone)}.
        </div>
      )}

      {showForm ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Informe o número que você usará para testar. Enquanto o teste estiver ativo, seu agente responderá somente a esse número.
          </p>
          <Label htmlFor="test-phone" className="text-xs">Número de WhatsApp para teste</Label>
          <div className="flex gap-2 flex-wrap">
            <Input id="test-phone" className="max-w-xs" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button disabled={busy || !phone.trim()} onClick={() => run("activate")}>Salvar e ativar teste</Button>
            {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>}
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Alterar número de teste</Button>
          {state.active ? (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run("deactivate")}>Desativar teste</Button>
              <Button size="sm" disabled={busy} onClick={() => setConfirm(true)}>Liberar atendimento para todos</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setPhone(state.phone ?? ""); void save({ data: { action: "activate", phone: state.phone ?? "" } }).then(() => setState({ ...state, active: true })); }}>
              Ativar teste novamente
            </Button>
          )}
        </div>
      )}

      {state.active && (
        <p className="text-xs text-muted-foreground">Envie uma mensagem para o WhatsApp conectado e confira a resposta do seu agente.</p>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar atendimento para todos?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao liberar, seu agente poderá responder automaticamente a todos os clientes que enviarem mensagem para este WhatsApp. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => run("release")}>Liberar atendimento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
