---
title: A apresentação digital é o link da página do imóvel, nunca uma foto
aliases: [apresentação digital, link da página, mandar apresentação]
tags: [whatsapp, ia, prompt]
type: nota
status: growing
custou: baixo
codigo:
  - src/lib/whatsapp/apresentacaoDigital.ts
  - src/lib/whatsapp/apresentacaoDigital.test.ts
  - src/lib/whatsapp/guardrails.ts
  - src/lib/whatsapp/turnoDeAtendimento.ts
  - src/lib/whatsapp/aiAgent.ts
created: 2026-09-28
updated: 2026-09-28
fonte: pedido do usuário em 28/09/2026 ("quando a IA mandar a apresentação, tem que mandar o link do imóvel, não uma foto")
summary: A regra 17 mandava "o link junto com uma ou duas fotos" e o modelo mandava só a foto. Prompt v40 pede só o link, e o guardrail garante — tira as fotos pedidas e põe o link da página, montado pelo código.
---
# A apresentação digital é o link da página

**O defeito**: a regra 17 do prompt dizia para mandar o link da página
"junto com uma ou duas fotos". Pedir foto em `anexosMidia` é fácil; copiar
o link da ficha é o passo que o modelo esquecia. O cliente pedia a
apresentação e recebia uma foto solta.

**Como ficou (v40)**:

- O prompt diz que a apresentação é SÓ o link, e foto só quando o cliente
  pede foto.
- `decidirApresentacao` (antes de resolver os anexos): se o cliente pediu
  apresentação/material/book/mais informações, ou a resposta fala em
  "apresentação", as FOTOS pedidas saem, junto com a frase que as anuncia
  ("te mandei as fotos aqui embaixo"). Planta, vídeo e tour ficam.
- `garantirLinkDaPagina` (por último, depois dos filtros de valor e de
  repetição): o link da página entra no texto, montado pelo slug. Link com
  slug que não existe vira o certo.
- Sem saber de qual imóvel é (nenhum link no texto, nenhuma mídia pedida,
  nenhum recomendado, catálogo com mais de um), nada muda: chutar mandaria
  o link errado.
- "Qual o material do piso?" não conta como pedido de apresentação.

É a mesma régua do link do catálogo (`anexarLinkDoCatalogo`): a IA decide
SE, o código escreve O QUÊ.

A guarda foi provocada: desligar a retirada das fotos, ou a inclusão do
link, reprova dois testes.

Relacionado: [[midia-por-slug-nunca-por-url]].
