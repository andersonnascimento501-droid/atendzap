import { createFileRoute } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Power, QrCode, Instagram, Copy, Check } from "lucide-react";
import { brand } from "@/config/brand";
import { connectWhatsapp, checkWhatsappStatus, disconnectWhatsapp } from "@/lib/evolution.functions";
import { connectInstagram, disconnectInstagram, getInstagramStatus } from "@/lib/instagram.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { PlanUsageBadge } from "@/components/plan-usage-badge";

export const Route = createFileRoute("/app/conexao")({
  head: () => ({ meta: [{ title: `${brand.name} — Conexão` }] }),
  component: ConexaoPage,
});

function ConexaoPage() {
  const connect = useServerFn(connectWhatsapp);
  const check = useServerFn(checkWhatsappStatus);
  const disconnect = useServerFn(disconnectWhatsapp);
  const plan = usePlanFeatures();

  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [numero, setNumero] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void doCheck();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => { void doCheck(true); }, 5000);
  }
  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  async function doCheck(silent = false) {
    try {
      const r: any = await check();
      setStatus(r.status);
      setNumero(r.numero ?? null);
      if (r.qrBase64 && r.status !== "connected") {
        setQr(r.qrBase64);
        if (!pollRef.current) startPolling();
      }
      if (r.status === "connected") { setQr(null); stopPolling(); if (!silent) toast.success("WhatsApp conectado!"); }
    } catch (e: any) { if (!silent) toast.error(e?.message || "Erro ao consultar status"); }
  }

  async function doConnect() {
    setLoading(true); setQr(null);
    try {
      const r = await connect();
      setQr(r.qrBase64 ?? null);
      setStatus(r.state === "open" ? "connected" : "connecting");
      if (r.state === "open") toast.success("Já está conectado!");
      else if (r.qrBase64) { toast.message("QR Code gerado. Escaneie no WhatsApp."); startPolling(); }
      else { toast.message("Instância criada. Buscando QR…"); startPolling(); }
    } catch (e: any) { toast.error(e?.message || "Falha ao conectar"); }
    finally { setLoading(false); }
  }

  async function doDisconnect() {
    setLoading(true);
    try {
      await disconnect();
      setStatus("disconnected"); setNumero(null); setQr(null); stopPolling();
      toast.success("Desconectado");
    } catch (e: any) { toast.error(e?.message || "Falha ao desconectar"); }
    finally { setLoading(false); }
  }

  const statusBadge =
    status === "connected" ? <Badge className="bg-primary">Conectado</Badge>
    : status === "connecting" ? <Badge variant="secondary" className="bg-amber-500/15 text-amber-700">Conectando…</Badge>
    : <Badge variant="outline">Desconectado</Badge>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">Canais de atendimento <HelpTip text="Conecte o WhatsApp (QR Code) e o Instagram Direct. O mesmo agente de IA atende os dois canais, com CRM, tools e follow-up compartilhados." /></h1>
          <p className="text-sm text-muted-foreground">WhatsApp e Instagram na mesma caixa de entrada.</p>
        </div>
        {!plan.loading && (
          <PlanUsageBadge label="números" used={plan.usage.instancias} limit={plan.limites.instancias} />
        )}
      </div>


      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="flex items-center gap-3 mt-1">
              {statusBadge}
              {numero && <span className="text-sm text-muted-foreground">· {numero}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => doCheck()} disabled={loading}>
              <RefreshCw className="size-4 mr-1.5" /> Atualizar
            </Button>
            {status === "connected" ? (
              <Button variant="destructive" size="sm" onClick={doDisconnect} disabled={loading}>
                <Power className="size-4 mr-1.5" /> Desconectar
              </Button>
            ) : (
              <Button size="sm" onClick={doConnect} disabled={loading}>
                {loading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <QrCode className="size-4 mr-1.5" />}
                {qr ? "Gerar novo QR" : "Conectar WhatsApp"}
              </Button>
            )}
          </div>
        </div>

        {qr ? (
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div className="bg-white p-4 rounded-xl border border-border w-fit mx-auto">
              <img src={qr} alt="QR Code WhatsApp" className="size-72 object-contain" />
            </div>
            <div className="space-y-3 text-sm">
              <h3 className="font-semibold text-base">Como escanear</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
                <li>Abra o WhatsApp no celular.</li>
                <li>Toque em <b>Aparelhos conectados</b>.</li>
                <li>Toque em <b>Conectar um aparelho</b>.</li>
                <li>Aponte para esta tela.</li>
              </ol>
              <p className="text-xs text-muted-foreground">Verificando a cada 5 s.</p>
            </div>
          </div>
        ) : status === "connected" ? (
          <div className="text-sm text-muted-foreground">Tudo certo! As mensagens serão respondidas automaticamente.</div>
        ) : (
          <div className="text-sm text-muted-foreground">Clique em <b>Conectar WhatsApp</b> para gerar o QR Code.</div>
        )}
      </Card>

      <InstagramCard />
    </div>
  );
}

function InstagramCard() {
  const statusFn = useServerFn(getInstagramStatus);
  const connectFn = useServerFn(connectInstagram);
  const disconnectFn = useServerFn(disconnectInstagram);

  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try { setInfo(await statusFn()); } catch { /* ignora */ }
  }

  async function doConnect() {
    setLoading(true);
    try {
      await connectFn({ data: { token: token.trim() } });
      setToken("");
      toast.success("Instagram conectado!");
      await refresh();
    } catch (e: any) { toast.error(e?.message || "Falha ao conectar o Instagram"); }
    finally { setLoading(false); }
  }

  async function doDisconnect() {
    setLoading(true);
    try { await disconnectFn(); toast.success("Instagram desconectado"); await refresh(); }
    catch (e: any) { toast.error(e?.message || "Falha ao desconectar"); }
    finally { setLoading(false); }
  }

  function copy(label: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Instagram className="size-4 text-[#C13584]" /> Instagram Direct
            <HelpTip text="Conecte a conta profissional do Instagram para que o agente responda também as mensagens do Direct." />
          </h2>
          <div className="flex items-center gap-3 mt-1.5">
            {info?.conectado
              ? <Badge className="bg-primary">Conectado</Badge>
              : <Badge variant="outline">Desconectado</Badge>}
            {info?.username && <span className="text-sm text-muted-foreground">· @{info.username}</span>}
            {info?.pageName && <span className="text-sm text-muted-foreground">· {info.pageName}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className="size-4 mr-1.5" /> Atualizar
          </Button>
          {info?.conectado && (
            <Button variant="destructive" size="sm" onClick={() => void doDisconnect()} disabled={loading}>
              <Power className="size-4 mr-1.5" /> Desconectar
            </Button>
          )}
        </div>
      </div>

      {info?.conectado ? (
        <p className="text-sm text-muted-foreground">
          Tudo certo! As mensagens do Direct entram na mesma caixa de entrada e são respondidas pelo agente.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Token de acesso do Meta</Label>
            <div className="flex gap-2">
              <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG..." type="password" />
              <Button onClick={() => void doConnect()} disabled={loading || token.trim().length < 40}>
                {loading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Instagram className="size-4 mr-1.5" />}
                Conectar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use um token da Página do Facebook vinculada à conta profissional do Instagram, com as permissões de mensagens do Instagram.
            </p>
          </div>

          {(info?.webhookUrl || info?.verifyToken) && (
            <div className="rounded-xl border border-border p-4 space-y-3 text-sm">
              <h3 className="font-semibold">Webhook para configurar no Meta</h3>
              {info?.webhookUrl && (
                <div className="flex items-center gap-2">
                  <code className="text-xs break-all flex-1">{info.webhookUrl}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy("url", info.webhookUrl)}>
                    {copied === "url" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              )}
              {info?.verifyToken && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Verify token:</span>
                  <code className="text-xs break-all flex-1">{info.verifyToken}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy("token", info.verifyToken)}>
                    {copied === "token" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Assine o campo <b>messages</b> do produto Instagram.</p>
            </div>
          )}

          {info?.ultimoErro && <p className="text-xs text-destructive">{info.ultimoErro}</p>}
        </div>
      )}
    </Card>
  );
}
