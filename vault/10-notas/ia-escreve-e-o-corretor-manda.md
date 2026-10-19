---
title: A IA escreve e o corretor manda
aliases: [IA escreve, rascunho da IA, mensagem pela IA no funil]
tags: [whatsapp, ia, crm, painel, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/aberturaPelaIA.ts
  - src/app/corretor/(painel)/_componentes/acoesMensagemPelaIA.ts
  - src/app/corretor/(painel)/_componentes/MensagemPelaIA.tsx
  - src/app/corretor/(painel)/funil/Quadro.tsx
  - src/app/corretor/(painel)/leads/TabelaLeads.tsx
  - src/app/corretor/(painel)/_componentes/FolhaAcoesLead.tsx
  - src/lib/whatsapp/mensagemPelaIA.test.ts
summary: Botão "IA escreve" no cartão do funil, na lista e na folha de ações. A IA faz o rascunho, o corretor revisa e envia; o envio passa por trava, cota e espaçamento, e liga a IA para responder o lead.
updated: 2026-10-06
---

# A IA escreve e o corretor manda

Pedido do usuário em 06/10/2026: na lista e no funil não havia como apertar
um botão para a IA mandar mensagem a um lead. Escolhida a opção 1: a IA
escreve, o corretor manda. A regra N1 (a IA só responde, nunca inicia)
continua valendo, porque quem decide falar é o toque de enviar.

## Como funciona

1. O botão ✨ abre uma janela e já pede o rascunho
   (`rascunharMensagemPelaIA` → `rascunharPelaIA`). É o mesmo turno do
   webhook (catálogo, dossiê, regras do corretor, few-shot), com uma
   instrução de abertura que cita o imóvel de interesse. Nada sai nesta etapa.
2. O corretor edita ou pede "Escrever outra".
3. "Enviar" (`enviarMensagemPelaIA` → `enviarRascunhoDaIA`) pega a trava
   `resposta:<conversa>`, reserva cota e espaçamento quando é iniciativa
   nossa, envia, grava como fala da IA, liga a IA na conversa, conta a
   tentativa e move o lead para "Mensagem enviada".

## Regras

- **O toque do corretor fura a IA desligada da conversa** (como "IA assume
  agora"), mas não fura o que é do cliente: pedido para sair e lead de outro
  corretor barram (`silencioQueOGestoNaoFura`).
- **Só o dono do lead manda.** O ADM vê a equipe, mas a mensagem sairia do
  número dele.
- **A conversa nasce pela carteira** (`obterOuCriarConversa` com o telefone
  normalizado); se não casar com o lead, a ação recusa.
- A janela vai por portal ao `<body>` e repete `data-rota`/`data-modulo`
  (quarto portal do painel, guarda em `navegacao.test.ts`).

## Fora desta versão

Enviar para vários leads selecionados de uma vez. Para muitos, o caminho
continua sendo a lista de transmissão.

Ver também: [[a-ia-so-responde]], [[quando-a-ia-responde]],
[[funil-completo-e-resumido]].
