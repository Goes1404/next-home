---
title: Trocar o número pareado zera a reputação
tags: [anti-ban, whatsapp, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/trocaDeNumero.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — campanhas
summary: Chip novo herdando maturidade do anterior é o caminho curto para o ban. Duas guardas — reconectar o MESMO número não zera; provedor que não informa o número também não.
---
# Trocar o número pareado zera a reputação

`trocaDeNumero.ts`: contador do dia, `bloqueado_ate`, `falhas_seguidas` e a
curva de aquecimento (`conectado_em`) voltam ao zero. Chip novo herdando a
maturidade do anterior dispararia em volume alto num número que a Meta acabou
de ver.

## Duas guardas que importam

1. **Reconectar o MESMO número não zera nada** — senão uma queda de internet
   custaria a maturidade.
2. **Provedor que confirma conexão SEM informar o número também não zera** —
   tratar "não sei" como "é outro" zeraria à toa.

## Ao desconectar

`DELETE /instance/logout/{nome}` desconecta e **preserva** a instância (nome,
tom de voz, webhook); `/instance/delete` seria destrutivo. Ao desconectar,
zerar `conectado_em` junto. (O botão "Desconectar" antigo era falso — só mexia
no estado local da tela.)

## Relacionadas
- [[quatro-protecoes-anti-ban-defendem-coisas-diferentes]]
- [[pareamento-decide-pelo-estado]]
