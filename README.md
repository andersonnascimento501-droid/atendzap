# AtendZap / AtendAI

Plataforma multiempresa de atendimento com IA para WhatsApp (Evolution API) e Instagram (Meta Graph).

## O que o produto inclui
- **Empresas (multi-tenant)** isoladas por `company_id`, equipe com papéis (owner/admin/atendente) e painel master.
- **Planos e créditos**: cada resposta da IA consome 1 crédito (`consume_ai_credit`); estorno automático (`refund_ai_credit`) quando o atendimento falha de vez sem nada enviado.
- **Múltiplos agentes** com roteamento por supervisor, ferramentas (transferir para humano, CRM, tarefas, materiais, agenda) e prompt estruturado + instruções extras.
- **Canais**: WhatsApp (Evolution) e Instagram Direct.
- CRM/funil, agenda sem sobreposição, follow-ups, campanhas, financeiro, relatórios.

## Fluxo de mensagens
```text
webhook (WA/IG) -> grava entrada -> mq_enqueue (atômico) -> 200
        erro em qualquer etapa -> 500 (o provedor reenvia; entrada é deduplicada)
pg_cron (1/min) -> /api/public/hooks/process-message-queue
   mq_recover_orphans -> mq_claim_due (lease_token) -> pipeline -> envio -> mq_finish(token)
```
- **Posse do job**: cada claim gera `lease_token`; o pipeline renova a posse antes da IA, da cobrança e de cada envio. Worker que perdeu a posse aborta sem efeitos; `mq_finish` só grava com o token atual.
- **Próximo ciclo**: `mq_finish` cria novo job se chegaram mensagens durante o processamento (em sucesso ou falha definitiva). Em retry o mesmo job volta a `pending` e as novas mensagens entram nele.
- **Recuperação**: entradas com `ai_processed_at IS NULL` há mais de 2 min (até 24h) sem job ativo são reenfileiradas. Decisões finais (pausa, humano ativo, fora do horário, sem crédito, empresa suspensa) marcam `ai_processed_at` e não voltam. Conversas cujo último job falhou de vez, ou com job nos últimos 15 min, não são reenfileiradas.
- **Envio**: `sendPartOnce` reserva `response_key` (`send_status=sending`) antes de enviar; confirmado → `sent`; recusa 4xx → reserva removida (retry pode reenviar); rede/5xx → `uncertain`, **não reenvia**. Evolution e Instagram não oferecem chave de idempotência, então não há garantia de "exatamente uma vez": no estado incerto a mensagem pode não ter chegado.
- **Contexto da IA**: até 25 mensagens anteriores ao lote + o lote inteiro (até 50 entradas) consolidado uma única vez; falas de humano marcadas como `[Atendente humano]`.

## Configuração
- Cron jobs (`process-message-queue-every-minute`, `process-followups-every-minute`) enviam `Authorization: Bearer <segredo>`; o worker aceita o segredo interno `public.worker_auth.secret` (legível só por service_role) ou `LOVABLE_CRON_SECRET`. A chave publicável nunca é aceita. Para trocar o segredo, atualize a linha em `worker_auth` e o comando do cron juntos.
- Segredos do backend: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `META_APP_SECRET` (assinatura do webhook Instagram — sem ele o webhook recusa), `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `LOVABLE_API_KEY`.
- Webhook WhatsApp: `/api/public/whatsapp-webhook?t=<webhook_token da instância>`.

## Migrações
Aplicadas pela ferramenta do Lovable em `drizzle/migrations/` (histórico anterior em `supabase/migrations/`).

## Testes
`bun test tests/` · `bunx tsgo --noEmit` · `bun run build`
