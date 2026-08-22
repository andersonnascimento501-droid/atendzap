# Auditoria somente leitura — estado atual (nenhum arquivo alterado)

Base: código real do repositório. Nada foi modificado.

## Resultado item por item

| # | Item | Status | Onde está / o que falta |
|---|---|---|---|
| 1 | Cliente cria conta e conecta o WhatsApp sozinho por QR | SIM | `src/routes/entrar.tsx:95-133` (signUp), `src/lib/checkout.functions.ts:15-76` (cria company + trial + owner), `src/routes/app/onboarding.tsx`, `src/routes/app/conexao.tsx` (QR + polling 5s) |
| 2 | Instância Evolution isolada por empresa + webhook automático | SIM | `src/lib/evolution.functions.ts:5-7` (nome determinístico por empresa), `:34-91` (create + setWebhook + `webhook_token`), `:163-171` (reparo tardio, `webhook_configured_at`); `src/lib/evolution.server.ts:51-67,134-147`; validação do token em `src/routes/api/public/whatsapp-webhook.ts:43-52` |
| 3 | Receber e responder texto | SIM | `whatsapp-webhook.ts:35-41` (entrada), `:345-368` (envio via `evoSendText`) |
| 4 | Entender/transcrever áudio recebido | NÃO | Nenhuma leitura de `audioMessage`/`ptt`, nenhum STT/Whisper no código. Áudio sem legenda cai no `return "no text"` (`whatsapp-webhook.ts:41`) |
| 5 | Entender imagens | NÃO | Só a legenda é lida (`:38`). Nenhum download de mídia, nenhuma chamada multimodal — `lovable-ai.server.ts` só envia `content: string` |
| 6 | Entender documentos/PDF | NÃO | `documentMessage` não é referenciado em lugar nenhum |
| 7 | Responder com áudio, imagem ou documento | NÃO | `evolution.server.ts` só expõe `evoSendText` (`:149-154`) e `evoSendPresence` (`:156-165`). Não existe `sendMedia`/`sendWhatsAppAudio`/`sendDocument` |
| 8 | Memória/histórico para a IA | PARCIAL | Últimas 25 mensagens de `mensagens` por `company_id+numero` (`:243-250`). Janela fixa, sem resumo/compactação; `ia` e `humano` viram ambos `assistant` |
| 9 | Buffer/debounce de mensagens seguidas | PARCIAL | Implementado como `setTimeout` dentro do request (`:211-214`) + verificação de "superseded" (`:216-227`). Funciona, mas segura uma requisição HTTP aberta até 20s por mensagem — não é fila/scheduler |
| 10 | Humanização, typing e resposta em partes | SIM | `sendPresence composing` + delays randômicos (`:345-364`); separador `|||` no prompt (`src/lib/ai-prompt.ts:86,273-283`) e `parseAiOutput`. Observação: o prompt promete até 3 bolhas, mas `sanitizeAiParts` corta em 2 (`:399-405`) |
| 11 | Pausar IA por contato e humano assumir | SIM | Tabela `contact_pause`; palavras `/pausar`/`/despausar` (`:110-154`), opt-out automático (`:135-141,392-397`), pausa ao humano responder (`evolution.functions.ts:246-250`), janela de 90s de "humano ativo" (`:229-241`), toggle manual `setContactIaActive` (`:254-266`) |
| 12 | Transferência/notificação para humano | PARCIAL | Só instrução textual no prompt (`ai-prompt.ts:251-253`) usando `telefone_transferencia`. Não há evento de handoff, fila, alerta ao atendente nem marcação no card |
| 13 | CRM/Kanban automático e manual | SIM | `upsertCard` em todos os caminhos do webhook (`:432-482`), estágio movido pela saída da IA (`:327`); manual em `src/routes/app/crm.tsx:79,322` e `src/components/crm/lead-drawer.tsx` |
| 14 | Campos customizados / coleta estruturada por nicho | NÃO | Só colunas fixas + `tags[]`, `observacao`, `proxima_acao`. Não existe tabela de definição de campos nem JSON por empresa |
| 15 | Follow-up automático por inatividade com cadências | NÃO | Existe cron para campanhas em massa (`src/routes/api/public/hooks/process-campaigns.ts`, auth em `cron-auth.ts`) e um campo `follow_up` manual exibido no dashboard. Não há motor de cadência por inatividade |
| 16 | Agendamento / Google Calendar | PARCIAL | Funciona, mas via marcador de texto `[AGENDAR: ...]` interpretado por regex (`whatsapp-webhook.ts:330-343`, `google.server.ts:27-81`). Não é tool/function calling — frágil e sem verificação de disponibilidade real na agenda |
| 17 | Catálogo/produtos e preços usados pela IA | SIM | Tabela `produto` carregada no webhook (`:121-133`) e injetada no prompt (`ai-prompt.ts:199-208,230`); CRUD em `agente.avancado.tsx:313-333` |
| 18 | Multiempresa / RLS / isolamento | PARCIAL | Todas as tabelas têm `company_id` e todo o app filtra por ele; porém o webhook e as server functions usam `supabaseAdmin` (bypassa RLS), então o isolamento depende de disciplina no código. As policies não estão versionadas (não existe `supabase/migrations` no repo) |
| 19 | Equipes / roles | SIM | `owner/admin/atendente` com checagem server-side (`src/lib/team.functions.ts:18-22,139-149`) e client-side (`src/lib/permissions.ts:5-23`), com limite de assentos por plano |
| 20 | Dashboard/conversas em realtime | PARCIAL | Realtime só no Kanban (`crm.tsx:55-61`). Conversas e dashboard fazem fetch único; outras telas usam polling (`conexao.tsx:39`, `credits-badge.tsx:14`, `campanhas.tsx:64`) |
| 21 | Limites por plano / trial / checkout | SIM | `plan-limits.server.ts:29-114` (instâncias, usuários, contatos, mensagens), créditos por mensagem via RPC `consume_ai_credit` (`:292-300`), trial em `checkout.functions.ts`, webhooks Kiwify/Cakto/PerfectPay em `src/routes/api/public/billing/webhook.ts` |
| 22 | Cliente configura o próprio agente/prompt sem código | SIM | `src/routes/app/agente.tsx` (modo simples com geração por IA) e `agente.avancado.tsx` (10 abas: modelo, negócio, produtos, ofertas, vendas, suporte, pós-venda, personalidade, agendamento, regras) |
| 23 | Chaves próprias OpenAI/Anthropic ou IA central | SIM | `agent_config.ai_provider/ai_model/openai_api_key/anthropic_api_key` → `lovable-ai.server.ts:28-97`; Gemini central via `LOVABLE_API_KEY`; liberação por plano com `allowsProvider` |

## 24) Riscos que impedem produção em escala

1. **Buffer bloqueante**: cada mensagem segura um worker por até 20s (`whatsapp-webhook.ts:211-214`). Em pico, estoura tempo limite/concorrência do runtime serverless. É o gargalo mais grave.
2. **Chaves de API dos clientes em texto plano** em `agent_config.openai_api_key` / `anthropic_api_key`, sem criptografia em coluna.
3. **`supabaseAdmin` (bypass de RLS) em todo o caminho quente**: um filtro `company_id` esquecido vaza dados entre empresas. Policies não versionadas no repo — impossível revisar em code review.
4. **Tokens Google (`access_token`/`refresh_token`) em texto plano** em `google_integration`; o `state` do OAuth é assinado com `SUPABASE_SERVICE_ROLE_KEY` e cai em `"fallback"` se ausente (`google.server.ts:4,13`) — além de não ter expiração de state.
5. **Perda silenciosa de mensagens**: áudio, imagem sem legenda, documento e sticker são descartados com `200 OK` — o cliente final acha que foi ignorado.
6. **Sem retry/fila**: falha na Evolution ou na IA só gera `console.error`; a mensagem se perde (`:323-325,365-367`).
7. **Sem idempotência completa**: dedupe existe por `whatsapp_message_id`, mas reentregas do provedor durante os 20s de buffer podem gerar respostas duplicadas.
8. **`[AGENDAR: ...]` por regex** é injetável pelo texto do contato e falha em silêncio com saída malformada.
9. **Observabilidade**: só `console.log`; não há dead-letter, métrica por empresa nem alerta de falha de envio.

## 25) O que falta para substituir um fluxo n8n completo (agente comercial/secretária virtual)

Ordem de prioridade:

1. **Multimodalidade de entrada** — baixar mídia da Evolution (`/chat/getBase64FromMediaMessage`), transcrever áudio (Whisper/Gemini), enviar imagem a modelo com visão e extrair texto de PDF. Hoje é o maior buraco: metade das mensagens reais no WhatsApp não é texto puro.
2. **Multimodalidade de saída** — wrappers `sendMedia` / `sendWhatsAppAudio` / `sendDocument` + TTS, e marcadores no prompt para a IA escolher o formato.
3. **Tool calling de verdade** — trocar os marcadores `|||` e `[AGENDAR:]` por function calling: `agendar_reuniao`, `consultar_disponibilidade`, `mover_estagio_crm`, `transferir_humano`, `registrar_dado`. Isso destrava agendamento confiável e coleta estruturada.
4. **Fila assíncrona + debounce fora do request** — tabela de mensagens pendentes + worker por cron (o `process-campaigns` já é o padrão), com retry e dead-letter. Remove o gargalo do item 24.1.
5. **Motor de follow-up por inatividade** — tabela de cadências por empresa (ex.: 1h / 24h / 3d / 7d), com regra de parada em resposta ou opt-out, executada pelo mesmo worker de cron.
6. **Handoff humano real** — tag "aguardando humano" no card, notificação ao atendente (push/e-mail/WhatsApp interno), SLA e fila de atendimento.
7. **Campos customizados por nicho** — definição de campos por empresa (JSONB no card + tabela de definição) preenchidos pela IA via tool calling; é o que substitui os "Set/Extract" do n8n.
8. **Endurecimento de segurança** — criptografar chaves de clientes e tokens Google, versionar as policies de RLS em migrations, reduzir uso de `supabaseAdmin`, assinar o `state` do OAuth com secret dedicado e com expiração.
9. **Realtime na inbox** — assinar `postgres_changes` em `mensagens` no dashboard e em Conversas (o padrão já existe no Kanban).
10. **Observabilidade** — log estruturado por empresa/conversa, métricas de entrega e alerta de falha.

Com os itens 1 a 5 o produto já cobre o caso "agente comercial / secretária virtual" sem n8n. Os itens 6 a 10 são requisitos para vender e operar em escala com segurança.

## Veredito

Hoje ele substitui um fluxo n8n **somente de texto**: atende, qualifica, move CRM, pausa para humano, respeita horário e limites de plano — tudo multiempresa e autosserviço. Não substitui um fluxo com áudio, imagem, documento, resposta em mídia, agendamento confiável ou follow-up automático.

Nenhuma alteração foi feita. Se quiser, transformo os itens 1 a 5 em um plano de implementação detalhado.
