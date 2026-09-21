# Correção cirúrgica do prompt comercial

## Inconsistências confirmadas
- O atendente Pedro da empresa Pedro Bahia está salvo como “Empresa de nordestehiper”.
- O objetivo salvo começa com texto editorial (“Para preencher esses campos...”), que chega integralmente ao prompt.
- `como_vender`, `formas_pagamento` e `posvenda_msg` estão vazios, mas o prompt manda seguir um fluxo comercial inexistente.
- O método global injeta “agendar, enviar proposta, confirmar pedido, marcar visita” em qualquer negócio.
- Personalidade gerada e estilo livre repetem instruções semelhantes.
- Não há material ativo cadastrado para a ficha inicial. A ferramenta de materiais já impede criar ou enviar links inexistentes.

## Alterações mínimas
1. Corrigir apenas o registro desse atendente para “Pedro Bahia / Consultoria Pedro Bahia” e remover o preâmbulo contaminado do objetivo.
2. Salvar o fluxo comercial fornecido, incluindo escolha do plano, forma de pagamento, confirmação real, envio da ficha e encerramento comercial.
3. Não inventar Pix nem links de cartão: enquanto não estiverem cadastrados, manter pagamento explicitamente pendente e obrigar encaminhamento ao time.
4. No montador do prompt:
   - só citar “FLUXO COMERCIAL” quando houver fluxo salvo;
   - substituir o passo 6 genérico por uma instrução baseada no fluxo real salvo;
   - tornar explícita a regra pós-pagamento;
   - quando ficha/material não existir, proibir criação de link e orientar que será encaminhado quando disponível;
   - evitar duplicar personalidade com estilo livre sem apagar conteúdo do cliente;
   - preservar integralmente o bloco de transferência aprovado.
5. Reforçar o gerador para rejeitar preâmbulos de instrução nos campos e nunca fabricar fluxo, pagamento ou ficha.

## Validação direcionada
- Testar o prompt do caso Pedro com os dados corrigidos.
- Confirmar: identidade correta, fluxo completo, ausência do passo genérico, pagamento não inventado, pós-pagamento encerrado e ficha sem link inventado.
- Confirmar que a transferência continua presente e ligada à ferramenta.
- Rodar testes, verificação de tipos e build.

## Fora do escopo
Nenhuma alteração no onboarding, telas, arquitetura, campanhas, Instagram, cobrança, CRM ou painel master.
