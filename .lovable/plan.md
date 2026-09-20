# Prova de funcionamento: cliente entra, configura e atende

Você não quer mais recursos agora. Quer a certeza de que, deixando o AtendZap ativo, um cliente novo consegue: criar a empresa, passar pelo onboarding, configurar o atendente, conectar o WhatsApp e receber/responder mensagens de verdade — sem você tocar em nada.

Então este plano é de **validação ponta a ponta com evidência**, não de construção. Nada de arquitetura nova, nada de recurso novo, nada de mexer em campanhas, cobrança, Instagram ou CRM.

## Como vou provar

Crio uma empresa de teste (como você faria no painel master), percorro a trilha do cliente de ponta a ponta e registro o resultado real de cada passo. Onde falhar, corrijo apenas o que impede o fluxo de funcionar — e digo exatamente o que era.

### Etapa 1 — Liberação e entrada
- Criar empresa + responsável no painel master, com plano e dias de teste.
- Entrar com o acesso gerado e confirmar que cai no onboarding, ativa, sem pedir pagamento.

### Etapa 2 — Onboarding do cliente
- Percorrer todos os passos: dados da empresa, WhatsApp, atendente por perguntas, permissões e quando chamar uma pessoa, etapas do funil, materiais, teste do atendente.
- Sair no meio e voltar: o progresso tem que estar salvo.
- Confirmar que o atendente fica salvo e o prompt gerado sai limpo (sem texto quebrado).

### Etapa 3 — Edição manual do prompt
- Abrir "Editar manualmente", escrever um prompt próprio, salvar, recarregar e confirmar que continua lá.
- Confirmar que a configuração guiada não é apagada.

### Etapa 4 — Atendimento de verdade (o ponto crítico)
- Simular uma mensagem entrando pelo webhook do WhatsApp para essa empresa de teste.
- Acompanhar: mensagem gravada → entra na fila → é processada → o atendente responde usando o prompt configurado → a resposta sai pelo canal → aparece em Conversas.
- Verificar o que a IA pode fazer: agendar, enviar material, transferir para humano, criar tarefa.
- Verificar que empresa suspensa/fora do teste não consome crédito nem responde.
- Verificar isolamento: a empresa de teste só vê os próprios dados.

### Etapa 5 — Relatório final
Entrego uma lista honesta em três colunas:
- **Funciona** — validado, com a evidência de como validei.
- **Funciona com ressalva** — funciona, mas depende de algo seu (ex.: número real conectado).
- **Não funciona** — com a causa e o que é preciso para resolver.

Sem "está pronto" sem prova. Se algo não passar, aparece na lista como não funciona.

## Sobre o outro sistema

Uso o DeskcommCRM apenas como referência do que um sistema maduro entrega, para eu saber o que checar. Não vou copiar código nem trazer recursos dele neste plano — os blocos de caixa de entrada, conhecimento da IA e tarefas continuam no plano anterior, já entregues em parte.

## Detalhes técnicos

- Validação de UI com Playwright headless em localhost:8080, sessão Supabase restaurada por variáveis de ambiente.
- Fluxo de mensagem: `src/routes/api/public/whatsapp-webhook.ts` → `message_processing_queue` → `src/routes/api/public/hooks/process-message-queue.ts` → `processConversationJob` em `src/lib/message-pipeline.server.ts` → `agent-runtime.server.ts` + `agent-tools.server.ts` → `outbound-message.server.ts`.
- Checagens no banco por consultas de leitura: `mensagens`, `conversation_state`, `agent_config`, `company`, `crm_cards`, `crm_task`, fila e créditos.
- Guardas conferidos: `isCompanyOperational`, `billing-guard.server.ts`, segredo interno dos workers, idempotência por `response_key`, filtro por `company_id`.
- Fecho com `bunx tsgo --noEmit`, `bun test tests/` e `bun run build`.

## Fora deste plano

Recurso novo, mudança de design, gateway de pagamento, marca própria, WhatsApp oficial da Meta, anúncios e loja.
