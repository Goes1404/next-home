---
title: "Últimas unidades" não é pronto — o estágio de compra segue o cadastro
aliases: [estagioDe, pronto-ou-obra, ultimas-unidades]
tags: [front-publico, decisao, dados]
type: decisao
status: evergreen
custou: baixo
codigo: [src/lib/estagioDeCompra.ts, src/lib/queries.ts]
created: 2026-09-11
updated: 2026-09-11
fonte: construção das duas portas da home, 11/09/2026
summary: Seis estágios viram dois grupos de compra. Só `pronto_para_morar` promete chave na mão; `ultimas_unidades` descreve o estágio da VENDA e fica do lado da obra — o único imóvel nesse estado tem entrega prevista para 2027.
---
# "Últimas unidades" não é pronto

A home agrupa os seis estágios em dois, porque é isso que muda a decisão de
quem compra: morar agora, ou pagar durante a obra.

| grupo | estágios |
|---|---|
| `pronto` | `pronto_para_morar` |
| `obra` | `breve_lancamento`, `pre_lancamento`, `lancamento`, `em_construcao`, `ultimas_unidades` |

## A que engana

`ultimas_unidades` parece o fim da linha e não é: ela descreve o estágio da
**venda**, não o da obra. Conferido no banco antes de escrever a regra — o
único imóvel nesse estado (Viva RSF Vila do Conde) tem `entrega_prevista`
para **01/2027**. Agrupá-lo com "pronto" prometeria chave na mão a quem vai
receber daqui a anos.

## O erro é assimétrico, e é isso que decide o agrupamento

Chamar de "em obra" algo que já está pronto custa uma visita a mais.
Chamar de "pronto" algo em obra quebra a conversa na frente do cliente — a
mesma família do `STATUS_LABEL` cru que fez a IA afirmar "pronto para
morar" para um cadastro `em_construcao`.

Relacionadas: [[as-duas-portas-da-home]], [[capa-de-empreendimento-nunca-e-nula]].
