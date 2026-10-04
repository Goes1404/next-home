---
title: Aquecimento do número pelo uso, não pela idade
aliases: [limiteDoDia, calcularLimiteDoDia, whatsapp_envios_por_dia, aquecimento pelo uso, 0158]
tags: [anti-ban, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/antiBan.ts
  - src/lib/whatsapp/repositorio.ts
  - src/app/corretor/(painel)/campanhas/acoes.ts
  - src/app/corretor/(painel)/campanhas/_componentes/StatusFila.tsx
  - src/lib/whatsapp/aquecimentoPeloUso.test.ts
  - supabase/migrations/0158_aquecimento_pelo_uso.sql
created: 2026-10-03
updated: 2026-10-03
fonte: pedido do usuário ("se não enviarem todo dia, as contas vão tomar ban")
summary: O limite diário de mensagens por iniciativa nossa parte do maior dia dos últimos 7 (×1,5, piso 15), com a curva por idade como teto e freio quando muita gente pede para sair.
---
# Aquecimento do número pelo uso, não pela idade

## O defeito

A curva antiga (`limiteDiarioCampanha`) contava **só os dias desde a
conexão**: 15 → 30 → 60 → 100 → 150. Um número conectado há um mês que
nunca mandou nada ganhava 150 mensagens no primeiro dia de lista; um número
parado uma semana voltava direto no máximo. Para o WhatsApp, o que pesa é o
salto de volume em relação ao que a linha costuma fazer — não a idade da
conexão.

## A régua (`limiteDoDia`, pura)

- maior dia dos **últimos 7** (o dia de hoje não conta) × **1,5**;
- **piso de 15**: número parado volta ao começo;
- **teto pela idade**: número novo não passa da curva antiga;
- **freio**: 3+ pedidos de "não me mande" na semana E ≥ 5% do que saiu →
  o limite para de subir (fica no maior dia).

Lista de 300 num número velho e parado: 15, 23, 35, 53, 80, 120, 150.

## Onde mora

- `whatsapp_envios_por_dia` (0158): gravada **no mesmo update atômico** que
  reserva a cota (`consumir_cota_campanha_espacada`) e descontada na
  devolução. O contador antigo da instância só lembra o dia de hoje.
- `calcularLimiteDoDia` (repositório): a conta do disparador **e** da tela.
  Falha ao ler o histórico cai no **piso**, nunca no teto — na dúvida,
  manda menos ([[o-lado-certo-de-errar-numa-trava]]).
- `statusDisparo` mostra o saldo pela mesma conta e a frase
  (`fraseDoLimite`) explicando por que o limite de hoje é esse.

## Guardas

`aquecimentoPeloUso.test.ts`: regra pura + reserva e tela lendo
`calcularLimiteDoDia` (provocada: trocar pela curva por idade reprova) + o
insert do histórico dentro da função atômica.

Relacionadas: [[quatro-protecoes-anti-ban-defendem-coisas-diferentes]] ·
[[espacamento-anti-ban-so-existia-no-papel]] · [[trocar-numero-zera-reputacao]]
