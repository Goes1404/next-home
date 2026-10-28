---
title: Lead da campanha do próprio corretor não é atendido pela IA
tags: [whatsapp, campanhas, crm]
type: decisao
status: evergreen
custou: baixo
codigo:
  - src/app/api/webhooks/whatsapp/route.ts
  - src/lib/whatsapp/impulsionamentos.ts
  - src/lib/whatsapp/campanhaDoCorretorSemIA.test.ts
  - src/app/api/webhooks/whatsapp/anuncioSemMensagemAutomatica.test.ts
  - src/lib/whatsapp/roletaDosAnuncios.ts
summary: Lead que chega com a etiqueta de anúncio da Meta na linha do corretor é cadastrado e resumido, mas a IA fica calada e nada automático sai (a boas-vindas fixa saiu em 27/10); quem conversa é o corretor.
updated: 2026-10-27
---

# Lead da campanha do próprio corretor não é atendido pela IA

Decisão do dono (20/10/2026): o corretor pagou o anúncio e quer conversar
com quem clicou. A IA só **cadastra** o lead e faz o **resumo** da ficha.

- **Como se reconhece:** a mensagem chega com a etiqueta de anúncio da Meta
  (`reconhecerAnuncioMeta`) e não é o link `/wa` da imobiliária
  (`!nomeDoAnuncio`). É o mesmo bloco que registra o lead em
  `impulsionamentos` ([[impulsionamento-do-corretor-pela-etiqueta-da-meta]]).
- **Nada automático sai para o cliente (27/10/2026).** Até então ia uma
  boas-vindas fixa ("Olá! Recebemos sua mensagem. Em breve, um corretor
  entrará em contato…") pelo webhook e, sem repasse, pela roleta. O dono lia
  isso como "a IA respondendo o lead do impulsionamento" e mandou tirar. Medido
  antes de mexer: dos 41 leads `meta/ctwa` de 30 dias, desde 20/10 a única fala
  `bot` era essa frase. Guarda: `anuncioSemMensagemAutomatica.test.ts`.
- **Quando o dono diz "a IA respondeu", primeiro descubra QUAL fala.** No
  painel toda fala `remetente = 'bot'` parece IA: boas-vindas fixa, passagem da
  roleta e lista de disparo inclusive. `ia_interacoes.acao = 'respondida'` é o
  que separa a IA de verdade.
- **O que acontece:** `calarIaNaConversaDeCampanha` grava `bot_ativo = false`
  na conversa ANTES da decisão de responder; a decisão já recebe a conversa
  calada (`iaCaladaPelaCampanha`). O resumo segue pelo caminho do silêncio
  (`atualizarFichaEMemoria`), que roda para toda conversa com lead.
- **Vale para mensagem nova com etiqueta**, inclusive de lead que já
  conversava: clicar de novo no anúncio do corretor desliga a IA.
- **Religar:** palavra-chave ou "IA assume agora", como em qualquer conversa
  desligada.
- **Não vale para o link `/wa` da imobiliária** (anúncio da casa, rodízio):
  esse continua com a IA.
- **Passado:** as conversas de anúncio do corretor que já existiam foram
  desligadas à mão no dia (8 da Carolini).

Diagnóstico: `select l.origem, l.anuncio_origem, l.meta_ad_id, c.bot_ativo
from leads l join whatsapp_conversas c on c.lead_id = l.id where ...` —
`meta/ctwa` com `meta_ad_id` de um `impulsionamentos` do mesmo corretor é
lead da campanha dele.
