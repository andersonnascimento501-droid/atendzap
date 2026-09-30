# AtendAi multilíngue (pt-BR / es-ES) — em etapas

O pedido cobre ~600 mil caracteres de telas. Fazer tudo de uma vez aumenta o risco de quebrar textos em português. Proposta: mesma base, entregue em 4 etapas, cada uma testada antes da próxima.

## Etapa 1 — Base e preferência (esta rodada)
- Estrutura central de traduções (`src/i18n/pt-BR.ts`, `es-ES.ts`, hook `useT()`), sem OpenAI e sem verificações de idioma espalhadas.
- Migração: `profiles.idioma` e `company.idioma_padrao` (default `pt-BR`, check `pt-BR|es-ES`); existentes ficam em português.
- Resolução: usuário → empresa → navegador → pt-BR. Salvo no banco (vale em outro dispositivo e após novo login).
- Seletor em Configurações.
- Menus, barra lateral, navegação móvel e checklist traduzidos.
- Agente: campo "Idioma das respostas" (Automático / Português / Espanhol), aplicado só em tempo de execução no prompt; prompt manual intocado; aviso se o prompt manual tiver instrução de idioma conflitante.
- Assistente AtendAi responde no idioma do usuário (crédito/estorno inalterados).
- Empresa nova em espanhol: etapas do funil e setores iniciais em espanhol; nomes já existentes nunca são traduzidos.
- Testes 1–10 e 12 do pedido.

## Etapa 2 — Página pública, login e demonstração
- `/es` reaproveitando os mesmos componentes da página de vendas, seletor PT/ES.
- Entrar, cadastro, recuperar/trocar senha.
- Demonstração em espanhol (`/demo` com idioma), mesmos dados fictícios.
- Teste 11.

## Etapa 3 — Onboarding, Dashboard, Conversas, CRM, Agente, Configurações

## Etapa 4 — Agenda, Campanhas, Relatórios, Conexões, Financeiro, e-mails e notificações

## Fora do escopo
Painel master, preços/euro/checkout, WhatsApp, Meta, Zernio, filas, créditos, agenda, campanhas (lógica), modo de teste.
