import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Power, Instagram, ExternalLink, KeyRound, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getZernioStatus,
  zernioSaveKey,
  zernioListProfilesFn,
  zernioCreateProfileFn,
  zernioSelectProfile,
  zernioStartConnect,
  zernioConfirmConnection,
  zernioVerify,
  zernioDisconnect,
  zernioRemoveKey,
} from "@/lib/zernio.functions";
import { ZERNIO_DASHBOARD_URL } from "@/lib/zernio-logic";

type Profile = { id: string; name: string };

export function ZernioInstagramPanel() {
  const statusFn = useServerFn(getZernioStatus);
  const saveKeyFn = useServerFn(zernioSaveKey);
  const listFn = useServerFn(zernioListProfilesFn);
  const createFn = useServerFn(zernioCreateProfileFn);
  const selectFn = useServerFn(zernioSelectProfile);
  const startFn = useServerFn(zernioStartConnect);
  const confirmFn = useServerFn(zernioConfirmConnection);
  const verifyFn = useServerFn(zernioVerify);
  const disconnectFn = useServerFn(zernioDisconnect);
  const removeKeyFn = useServerFn(zernioRemoveKey);

  const [info, setInfo] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      setInfo(await statusFn());
    } catch {
      setInfo(null);
    }
  }

  useEffect(() => {
    void (async () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("zernio") === "retorno") {
        const accountId = url.searchParams.get("accountId");
        url.searchParams.delete("zernio");
        for (const k of ["connected", "profileId", "accountId", "username", "request_id", "stage"]) url.searchParams.delete(k);
        window.history.replaceState({}, "", url.toString());
        setBusy("confirm");
        try {
          const r = await confirmFn({ data: { accountId } });
          toast.success(`Instagram conectado${r.username ? `: @${r.username}` : ""}!`);
        } catch (e: any) {
          toast.error(e?.message || "Não foi possível confirmar a conexão.");
        } finally {
          setBusy(null);
        }
      }
      await refresh();
    })();
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e?.message || "Algo deu errado. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  const saveKey = () =>
    run("key", async () => {
      const r = await saveKeyFn({ data: { apiKey: apiKey.trim() } });
      setApiKey("");
      setProfiles(r.profiles);
      toast.success("Chave validada e salva com segurança.");
      await refresh();
    });

  const loadProfiles = () =>
    run("profiles", async () => {
      const r = await listFn();
      setProfiles(r.profiles);
    });

  const createProfile = () =>
    run("create", async () => {
      const r = await createFn();
      toast.success(`Perfil "${r.name}" criado.`);
      setProfiles(null);
      await refresh();
    });

  const pickProfile = (id: string) =>
    run("select", async () => {
      await selectFn({ data: { profileId: id } });
      setProfiles(null);
      await refresh();
    });

  const connect = () =>
    run("connect", async () => {
      let r = await startFn({ data: {} });
      if (r.needsConfirm) {
        const ok = window.confirm(
          "Esta empresa já possui uma conexão do Instagram pela API oficial da Meta. Deseja trocar o provedor ativo para Zernio?",
        );
        if (!ok) return;
        r = await startFn({ data: { confirmSwitch: true } });
      }
      if (r.authUrl) window.location.href = r.authUrl;
    });

  const verify = () =>
    run("verify", async () => {
      const r = await verifyFn();
      if (r.ok) toast.success("Conexão funcionando.");
      else toast.error("A conexão precisa ser refeita.");
      await refresh();
    });

  const disconnect = () =>
    run("disconnect", async () => {
      if (!window.confirm("Desconectar o Instagram da Zernio? As conversas e contatos continuam salvos.")) return;
      await disconnectFn();
      toast.success("Instagram desconectado.");
      await refresh();
    });

  const removeKey = () =>
    run("remove", async () => {
      if (!window.confirm("Remover a chave da Zernio deste painel? O Instagram também será desconectado.")) return;
      await removeKeyFn();
      setProfiles(null);
      toast.success("Chave removida.");
      await refresh();
    });

  const ativo = info?.provider === "zernio";
  const conectado = ativo && info?.status === "conectado";
  const reconectar = info?.status === "reconectar";

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Verificando…
      </p>
    );
  }

  if (conectado || (ativo && reconectar)) {
    return (
      <div className="rounded-xl border border-[color:var(--hairline)] p-4 space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-semibold">Conectar Instagram via Zernio</p>
          <p className="text-muted-foreground">
            Instagram {info.displayName ? `· ${info.displayName}` : ""} {info.username ? `· @${info.username}` : ""}
          </p>
          <p className="text-muted-foreground">
            Provedor: Zernio · Status: <b className={reconectar ? "text-destructive" : "text-foreground"}>{reconectar ? "Precisa reconectar" : "Conectado"}</b>
          </p>
          {info.ultimoErro && <p className="text-xs text-destructive">{info.ultimoErro}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={verify} disabled={!!busy}>
            {busy === "verify" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <RefreshCw className="size-4 mr-1.5" />}
            Verificar conexão
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/app/conversas">
              <MessageCircle className="size-4 mr-1.5" /> Abrir conversas
            </Link>
          </Button>
          {reconectar && (
            <Button size="sm" onClick={connect} disabled={!!busy}>
              <Instagram className="size-4 mr-1.5" /> Reconectar
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={disconnect} disabled={!!busy}>
            <Power className="size-4 mr-1.5" /> Desconectar Instagram
          </Button>
          <Button size="sm" variant="ghost" onClick={removeKey} disabled={!!busy}>
            <Trash2 className="size-4 mr-1.5" /> Remover chave da Zernio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[color:var(--hairline)] p-4 space-y-4 text-sm">
      <div className="space-y-1">
        <p className="font-semibold">Conectar Instagram via Zernio</p>
        <p className="text-muted-foreground">Use sua própria conta da Zernio para conectar o Instagram Direct ao AtendAi.</p>
      </div>

      <ol className="list-decimal pl-5 space-y-0.5 text-muted-foreground">
        <li>Crie sua conta na Zernio.</li>
        <li>Gere uma chave de API (no painel da Zernio, em chaves de API).</li>
        <li>Cole a chave no AtendAi.</li>
        <li>Escolha o perfil da empresa.</li>
        <li>Autorize o Instagram.</li>
        <li>Confirme que o status aparece como conectado.</li>
      </ol>

      <div className="space-y-1.5">
        <Label>Chave da API da Zernio</Label>
        {info.keyConfigured && (
          <p className="text-xs flex items-center gap-1.5 text-foreground">
            <KeyRound className="size-3.5" /> Chave configurada
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={info.keyConfigured ? "Cole uma nova chave para trocar" : "Cole aqui sua chave"}
          />
          <Button onClick={saveKey} disabled={!!busy || apiKey.trim().length < 16}>
            {busy === "key" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <KeyRound className="size-4 mr-1.5" />}
            Validar chave
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Crie sua conta na Zernio, gere uma chave de API e cole acima. A chave será validada e armazenada de forma segura.{" "}
          <a href={ZERNIO_DASHBOARD_URL} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
            Abrir painel da Zernio <ExternalLink className="size-3" />
          </a>
        </p>
      </div>

      {info.keyConfigured && (
        <div className="space-y-2">
          <Label>Perfil da empresa na Zernio</Label>
          {info.profileSelected && !profiles ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-foreground">{info.profileName || "Perfil selecionado"}</span>
              <Button size="sm" variant="ghost" onClick={loadProfiles} disabled={!!busy}>Trocar</Button>
            </div>
          ) : profiles ? (
            profiles.length === 0 ? (
              <div className="space-y-2">
                <p className="text-muted-foreground">Nenhum perfil encontrado nesta conta da Zernio.</p>
                <Button size="sm" variant="outline" onClick={createProfile} disabled={!!busy}>
                  <Plus className="size-4 mr-1.5" /> Criar perfil para esta empresa
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profiles.map((p) => (
                  <Button key={p.id} size="sm" variant="outline" onClick={() => pickProfile(p.id)} disabled={!!busy}>
                    {p.name}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={createProfile} disabled={!!busy}>
                  <Plus className="size-4 mr-1.5" /> Criar perfil para esta empresa
                </Button>
              </div>
            )
          ) : (
            <Button size="sm" variant="outline" onClick={loadProfiles} disabled={!!busy}>
              {busy === "profiles" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null} Escolher perfil
            </Button>
          )}
        </div>
      )}

      {info.keyConfigured && info.profileSelected && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={connect} disabled={!!busy}>
            {busy === "connect" || busy === "confirm" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Instagram className="size-4 mr-1.5" />}
            Conectar Instagram
          </Button>
          <Button variant="ghost" onClick={removeKey} disabled={!!busy}>
            <Trash2 className="size-4 mr-1.5" /> Remover chave da Zernio
          </Button>
        </div>
      )}
      {info.ultimoErro && <p className="text-xs text-destructive">{info.ultimoErro}</p>}
      <p className="text-xs text-muted-foreground">O login do Instagram acontece apenas na página oficial de autorização. O recebimento de mensagens é configurado automaticamente.</p>
    </div>
  );
}
