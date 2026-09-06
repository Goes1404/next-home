---
title: Critérios que reprovam o comportamento certo — o defeito recorrente nº 1
aliases: [Leblon, preco-mais-barato, ofereceVisita, afirmaPrazo]
tags: [eval, licao]
type: nota
status: evergreen
custou: alto
codigo: [scripts/eval/rodarEval.ts, src/lib/whatsapp/prazoEntrega.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — vários (5 ocorrências)
summary: Cinco critérios desta base reprovaram o comportamento CERTO. O padrão — o critério foi escrito quando a regra de negócio era outra, e ninguém reescreve critério ao mudar regra.
---
# Critérios que reprovam o comportamento certo

**Cinco** critérios desta base reprovaram o comportamento CERTO. O padrão é
sempre o mesmo: o critério foi escrito quando a regra de negócio era outra, e
ninguém reescreve critério ao mudar regra.

1. **Leblon**: reprovava "Não temos unidades no Leblon" — a resposta certa —
   porque casava "temos … Leblon" ignorando a negação. Hoje a checagem é por
   frase, exige afirmação de posse sem negação antes do verbo, e **toda
   reprovação guarda o texto da resposta** (critério que reprova sem mostrar o
   texto é inauditável).
2. **`preco-mais-barato`**: exigia "460" depois de a IA ser proibida de falar
   valores — reprovou os três modelos da OpenAI por obedecer.
3. **`ofereceVisita`**: exigia a palavra "visita" contra *"Tranquilo, podemos
   ver durante a semana então. Prefere manhã ou tarde?"* — o padrão exato de
   quem converte.
4. **`deveFazerPergunta`** era decorativo: dois casos o declaravam e nada no
   eval o lia.
5. **`afirmaPrazo`** — ver [[detector-de-prazo-acusava-a-honestidade]]; este
   agia em produção, não só no eval.

E mais: **23 dos 36 casos golden citavam imóveis que não existem no fixture**
("Canvas Alphaville") — a IA respondia certo e o eval reprovava. E
`pedido-de-planta` exigia planta quando NENHUM imóvel do fixture tem planta —
critério que pede o impossível reprova sempre.

## A regra

**Ao mudar regra de negócio, procurar os critérios que a mediam.** Reler a
lista de expectativas do `rodarEval.ts`.

## Relacionadas
- [[rotulo-vem-do-mundo]]
- [[a-ia-nao-fala-valores]]
