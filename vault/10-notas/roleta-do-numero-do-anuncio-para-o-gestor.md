---
title: O gestor vê a roleta do número do anúncio, não só a do próprio número
aliases: [roleta invisível, a IA distribui como quer, numeroDaRoleta, roleta da conta oculta]
tags: [painel, armadilha]
type: armadilha
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/marketing/impulsionamentos/numeroDaRoleta.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/RoletaDosAnuncios.tsx
  - src/app/corretor/(painel)/marketing/impulsionamentos/EditorDaRoleta.tsx
  - src/lib/crm/retornoPeloGrupo/ler.ts
created: 2026-11-07
updated: 2026-11-07
fonte: reclamação do Bruno (Aretz) no grupo de suporte, 07/11/2026; banco de produção (roleta_anuncios, lead_envios_grupo, retornos_de_ligacao)
summary: "A IA distribui os leads como quer" era a roleta do número da conta oculta "Aretz" (André, Martines, Moisés, Gediel), ligada em 06/11 17:19 por quem entrou como "Aretz". O Bruno, gestor sem número, abria a aba na roleta vazia do próprio número. Agora o gestor vê a roleta que está valendo. No mesmo dia, um recado do Moisés ao gestor virou "relato de ligação" com um "decorado" copiado do dossiê.
---

# O gestor vê a roleta do número do anúncio

## O que o cliente viu

Bruno (Aretz), 07/11: "a IA tá distribuindo os leads de acordo com o gosto dela,
pra corretores que não estão na roleta" e "mandou lead pra esse corretor — não
deveria" (a Priscila, final 6064, 07:18, para o Moisés).

## O que era

- Não era a IA. A roleta que age é a do **número para onde o anúncio manda o
  cliente**. Na Aretz é o número da conta oculta "Aretz"
  (`nexthome-administracao-aretz`), com a lista André, Martines, Moisés e
  Gediel (Gediel em pausa). Ela foi ligada em **06/11 17:19** por quem entrou
  como "Aretz" (`roleta_anuncios.atualizado_por`). O rodízio fez o que a lista
  mandava: André 2, Martines 1, Moisés 1.
- Desde 28/10 a aba mostrava **só a roleta do número de quem está logado**. O
  Bruno é gestor com conta oculta própria e **sem número**: via uma roleta vazia
  e desligada, e a que valia só aparecia logado como "Aretz".
- O texto "CONFIRME O RECEBIMENTO COM: RECEBIDO" não é nosso padrão: é o modelo
  da Aretz em `grupos.texto_aviso_grupo_leads`, com "Produto: Alpha Park View"
  escrito fixo.

## A regra nova (`numeroDaRoleta`)

1. Próprio número com roleta salva: a dele.
2. Senão, a roleta **ligada** de outro gestor do grupo, primeiro a do número
   central (`grupos.envio_grupo_leads_instancia`).
3. Senão, o próprio número, se ele tem WhatsApp.
4. Senão, o número central, se o dono é gestor.
5. Senão, a própria, como antes.

Quando a roleta mostrada não é a do próprio número, a tela diz de quem ela é
("Esta é a roleta do número de Aretz…"). `salvarRoleta` já aceitava gravar no
número de outro gestor do grupo; só a tela escondia.

## O recado que virou ligação (mesmo dia)

No grupo do Moisés, o gestor Fernando perguntou por áudio e o Moisés respondeu
"Vianda [Fernando], ela mandou mensagem que atrasou, ela tá chegando". A
leitura do retorno ([[retorno-da-ligacao-pelo-grupo]]) gravou "atendeu" e
`exigenciasEspecificas: ["decorado"]`, copiado do dossiê, e confirmou isso no
grupo. Correções:
- o prompt diz que notícia do cliente que não veio de conversa do corretor com
  ele, e recado a gestor ou colega, é `resultado: null`; e que os fatos são
  **só** os do relato, nunca da ficha ou do dossiê;
- `fatosSoDoRelato` trava em código o que a confirmação mostra: exigência,
  quartos, orçamento, região e forma de pagamento sem palavra no relato saem.

O prompt não foi medido contra o modelo (sem chave de IA no contêiner); a trava
em código é o que garante.

## Relacionadas
- [[roleta-dos-anuncios]]
- [[conta-oculta]]
- [[leads-distribuidos-nos-grupos-da-aretz]]
- [[retorno-da-ligacao-pelo-grupo]]
- [[MOC — Campanhas e Anti-ban]]
