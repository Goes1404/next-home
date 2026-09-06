---
title: O detector de prazo acusava a honestidade
aliases: [afirmaPrazo, blocoSemPrazoCadastrado]
tags: [prompt, eval, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/prazoEntrega.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — v24 (26/08/2026)
summary: afirmaPrazo casava "entrega" e mais nada — cortava a ressalva honesta e o "eu confirmo com você", que é o que a regra manda dizer. Agia em PRODUÇÃO.
---
# O detector de prazo acusava a honestidade

`afirmaPrazo` casava a palavra "entrega" e mais nada, então cortava frases que
a IA **deve** dizer: "o Vitra é pronto para morar, mas a entrega imediata
depende da unidade" e "não tenho a data de entrega, eu confirmo com você" —
esta última é literalmente o que a regra 23b manda.

Como o guardrail age em **produção**, não era só ruído de eval: a resposta
chegava sem a ressalva, e quando a frase era a única, virava "deixa eu
confirmar o prazo certinho". Quinto caso de
[[criterios-que-reprovam-o-comportamento-certo]].

## A régua nova — três partes juntas

menção de entrega **+** marcador de TEMPO (mês, ano, "em N meses", "breve",
"imediata") **+** ausência de desarme (negação, "depende", "confirmo",
"checar"). Sem o marcador, falar de entrega não é prometer data.

"prazo" sozinho é tão amplo quanto "entrega" era: "janeiro é um prazo apertado
para obra" avalia o prazo DO CLIENTE. Só conta
`prazo de entrega|da obra|de conclusão`.

## Avisar antes vale mais que cortar depois

`blocoSemPrazoCadastrado` entra no prompt quando nenhum imóvel tem data, e diz
também o que ela PODE dizer. O guardrail continua como rede.

## Medido

v23 = 90,3 com 2 falhas duras (2/2/2); v24 = 92,0 com 1 (1/0/0 — duas rodadas
zeradas). Mesmo juiz, mesmos casos, mesmo denominador — só aqui a comparação
vale.

## Relacionadas
- [[score-so-compara-com-a-mesma-regua]]
- [[ficha-do-prompt-completa-e-com-ausencias]]
