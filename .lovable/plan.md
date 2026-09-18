# Aproximar o AtendZap do sistema de referência — 3 blocos

Objetivo: cobrir as três lacunas que você escolheu, reaproveitando as telas e tabelas que já existem. Nada de marca própria, nada de trocar arquitetura, nada de mexer em campanhas, WhatsApp, Instagram, financeiro ou cobrança.

## Bloco A — Caixa de entrada e times (Conversas)

Hoje a tela de Conversas já mostra o responsável do lead e tem respostas rápidas por atalho. Falta o trabalho em time.

- Filas por situação: "Não atribuídas", "Minhas", "Do time", "Aguardando cliente", "Resolvidas" — com contagem em cada aba.
- Atribuir e transferir a conversa para alguém da equipe, direto do cabeçalho, com registro de quem passou para quem.
- Marcar conversa como resolvida ou reabrir, sem apagar o histórico.
- Notas internas na conversa (só o time vê, o cliente nunca recebe).
- Etiquetas na conversa, separadas das etiquetas de lead.
- Aviso na lista quando o cliente está esperando há muito tempo.

## Bloco B — Conhecimento da IA

Hoje a empresa cadastra materiais (fotos, PDFs, links) e a IA consegue enviá-los, mas não consegue ler o conteúdo para responder dúvidas.

- Base de conhecimento: a empresa envia documentos, cola textos ou aponta links; o sistema quebra em trechos e guarda para busca.
- Nova ação da IA: "procurar na base" — antes de responder dúvida, ela consulta e cita o trecho; se não achar, diz que vai confirmar com uma pessoa em vez de inventar.
- Memória da empresa: fatos aprendidos nas conversas ficam salvos e revisáveis pelo dono (aprovar/descartar), evitando que a IA repita informação errada.
- Tela de conhecimento dentro do Atendente IA, com status de cada material (pronto / processando / falhou).
- Registro de uso: quais perguntas a IA não soube responder, para o dono completar a base.

## Bloco C — Tarefas e atividades

- Tarefas com título, responsável, prazo e ligação com o lead e/ou a conversa.
- Tela "Tarefas" com hoje, atrasadas e próximas; marcar como concluída.
- Tarefas aparecem na ficha do lead e na conversa.
- Linha do tempo do lead reunindo mensagens, mudanças de etapa, agendamentos, notas e tarefas.
- Nova ação da IA: criar tarefa para o time quando prometer um retorno.

## Ordem de entrega

1. Bloco A (é o que muda o dia a dia de quem atende).
2. Bloco C (rápido e se encaixa no CRM que já existe).
3. Bloco B (maior, envolve processamento de arquivos).

Cada bloco entra numa etapa própria, com o sistema funcionando ao fim de cada uma.

## Detalhes técnicos

- Novas tabelas, todas com `company_id`, RLS por `has_company_access` e GRANT para `authenticated` + `service_role`:
  - `conversation_state` (fila, responsável, resolvido, última espera), `conversation_note`, `conversation_tag`, `conversation_assignment_event`.
  - `knowledge_source`, `knowledge_chunk` (com embedding via `pgvector`), `knowledge_query_log`, `org_memory_entry` (com status pendente/aprovado).
  - `crm_task` (+ índice por responsável e prazo).
- Conversas: estado lido junto da lista atual em `src/routes/app/conversas.tsx`; novas funções de servidor em `src/lib/inbox.functions.ts`. Sem reescrever a tela — só cabeçalho, abas e painel lateral.
- Conhecimento: extração de texto e embeddings via Lovable AI (não usar biblioteca nativa, o runtime é Worker); ingestão assíncrona pela fila já existente (`message_processing_queue` serve de modelo; nova `knowledge_ingest_queue` com o mesmo padrão de lock/tentativas).
- Novas tools registradas em `src/lib/agent-tools.server.ts` (`buscar_conhecimento`, `criar_tarefa`), executadas pelo loop de `src/lib/agent-runtime.server.ts`; gating por `allowed_tools` como as atuais.
- Prompt em `src/lib/ai-prompt.ts` ganha a regra de sempre consultar a base antes de responder dúvida factual.
- Mobile first mantido: filas como chips, tarefas em lista.

## Fora deste plano (do outro sistema)

WhatsApp oficial (Meta Cloud), anúncios Meta/Google com conversões, loja/Nuvemshop, extensões, chamadas de voz, LGPD, incidentes, marca própria, 2FA e notificações push. Ficam para depois, se você quiser.
