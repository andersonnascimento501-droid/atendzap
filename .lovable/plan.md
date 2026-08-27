# Redesign AtendZap — escopo proposto (após auditoria)

Auditoria entregue no chat. Nada foi alterado. Este plano descreve o redesign, para aprovação em etapas.

## Princípios

- Marca AtendZap, posicionamento "Seu WhatsApp atendendo por você".
- Poucos elementos por tela, português simples, zero jargão técnico visível.
- Somente frontend/apresentação: nenhuma mudança em banco, migrations, server functions, tenancy, planos, checkout ou pipeline de mensagens.

## Etapa 1 — Marca e linguagem

- `src/config/brand.ts`: nome AtendZap + tagline nova.
- Títulos e meta de `__root.tsx`, `index.tsx` e de cada rota de conteúdo.
- Trocar textos "AtendAI"/"AtendeZap" visíveis (landing, master/configuracoes, integrações, telas demo). Cabeçalho de webhook e prefixo de instância Evolution ficam como estão para não quebrar conexões ativas.

## Etapa 2 — Navegação

Menu de 13 para 7 itens: Início, Conversas, Clientes, Meu Atendente IA, Disparos, Canais, Resultados, e Configurações no rodapé da sidebar. Bottom nav mobile: Início, Conversas, Clientes, IA, Mais (folha com o restante). Rotas atuais permanecem e ganham redirecionamentos, sem quebrar links.

## Etapa 3 — Home

Nova `/app/dashboard`: faixa de status dos canais + créditos, bloco "Precisa de você", três números grandes, um atalho principal, checklist de primeiros passos quando vazio. Mesmas consultas de dados já existentes; nada novo no backend.

## Etapa 4 — Sistema visual único

Componente de cabeçalho de página, escala tipográfica e cards padronizados aplicados a todas as telas do `/app`, substituindo tamanhos manuais soltos.

## Etapa 5 — Meu Atendente IA

Uma página com abas: Agentes instalados, Catálogo, Personalidade/negócio, Ações permitidas, Lembretes automáticos (follow-up), Campos. Reaproveita `agente.tsx`, `agentes.tsx`, `agente.avancado.tsx`, `agent-tools-panel`, `agent-followup-panel` sem alterar as server functions.

## Etapa 6 — Conversas e Clientes

Conversas: canal, IA ativa e atendimento humano legíveis num relance; no celular, lista e conversa em telas separadas. Clientes: funil e contatos na mesma página, com o Kanban virando lista por etapa no celular.

## Etapa 7 — Canais e Configurações

Canais: um cartão por canal com estado conectado/desconectado e um botão de ação; webhooks, API e UTM movidos para "Avançado". Configurações reduzidas de 8 para 4 abas, com plano, consumo e limites explicados em linguagem simples.

## Detalhes técnicos

- Arquivos previstos: `src/config/brand.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/components/app-shell.tsx`, `src/components/mobile-bottom-nav.tsx`, `src/routes/app/*.tsx`, `src/components/agent-*`, `src/styles.css` (tokens/escala).
- Preservados sem mudança funcional: `checkout`, `onboarding`, `equipe`, `financeiro`, `campanhas`, `relatorios`, todo `/master`, `/demo`, e todas as rotas de API.
- Escopo total: grande. Sugestão de execução por etapas, aprovando uma por vez.
