---
title: Funil completo e resumido
aliases: [funil de 10 etapas, etapas do funil, modo do funil]
tags: [crm, painel, decisao, banco]
type: nota
status: growing
custou: medio
codigo:
  - supabase/migrations/0165_funil_de_dez_etapas.sql
  - src/lib/types.ts
  - src/app/corretor/(painel)/_componentes/etapas.ts
  - src/app/corretor/(painel)/funil/Quadro.tsx
  - src/app/corretor/(painel)/funil/modoDoFunil.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/funil.test.ts
summary: O banco guarda um funil de 10 etapas; o resumido é só agrupamento (6 grupos) escolhido num botão da tela do Funil. A IA move as três do começo sozinha.
updated: 2026-10-06
---

# Funil completo e resumido

Decisão do usuário em 06/10/2026, que substitui o "funil de cinco etapas"
da 0045.

| Etapa (chave) | Rótulo | Grupo do resumido | Quem move |
|---|---|---|---|
| `novo` | Leads | Leads | entra sozinho |
| `primeiro_contato` | Mensagem enviada | Contatei | sozinho, na primeira mensagem nossa |
| `em_conversa` | Em conversa | Contatei | sozinho, quando o cliente responde |
| `qualificado` | Qualificado | Contatei | sozinho, com renda + região + quartos na ficha |
| `visita_agendada` | Visita marcada | Visita | IA ao reservar, ou o corretor |
| `visitou` | Visitou | Visita | só o corretor |
| `proposta` | Proposta | Documentação | corretor |
| `documentacao` | Documentação | Documentação | corretor |
| `fechado` | Fechado | Fechado | corretor |
| `perdido` | Perdido | Perdido | IA (pedido de saída) ou corretor |

- **Um funil só no banco.** O resumido é `GRUPO_DA_ETAPA` em `types.ts`.
  Relatórios contam pelas etapas reais, então os números de dois corretores
  batem em qualquer modo de tela.
- **`primeiro_contato` manteve a chave** com o rótulo novo. É o mesmo fato
  (falamos e ele não respondeu), e trocar a chave mexeria em dezenas de
  consultas.
- **O botão Completo/Resumido** fica na tela do Funil e é salvo em cookie
  (`nh-funil-modo`), para o servidor desenhar já no modo certo. No resumido,
  soltar um cartão num grupo leva à primeira etapa do grupo, e só quando ele
  ainda não está ali. O cartão mostra a etapa real.
- **Cor por grupo:** as etapas de um mesmo grupo dividem a matiz, e o rótulo
  diferencia. Não houve token novo.
- **Os movimentos automáticos só andam para a frente.** Reservar visita não
  puxa para trás quem já visitou ou está em proposta (`reservar_horario_visita`).
  Desmarcar visita volta para "Em conversa", não para "Mensagem enviada".
- **O "3/7"** ([[lead-sem-resposta-sai-da-base-sozinho]]) vive em "Mensagem
  enviada". Quando o cliente responde, o lead vai para "Em conversa" e a
  contagem zera.
- **O Início** desenha os 5 grupos (`FunilVisual`), porque nove bandas não
  cabem. A lista aceita `?grupo=`.
- **Ordem do deploy:** primeiro o código (ele aceita os dados antigos),
  depois a 0165. Com a ordem invertida, o código antigo encontraria etapas
  que não conhece.
