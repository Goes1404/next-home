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
  - src/lib/whatsapp/limitesConservadores.test.ts
  - supabase/migrations/0158_aquecimento_pelo_uso.sql
created: 2026-10-03
updated: 2026-10-09
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

## Decisão de 09/10/2026: só para o lado conservador

O dono da conta decidiu: "vamos ser bem conservadores com esses limites".
Foi depois de a conta da Bruna ser restringida (07/10) e de a lista do Ramos
parar no teto de 15 de um número conectado havia dois dias. Quem pedir mais
volume ganha mais dias de uso ou mais números conectados, nunca um limite
maior.

`limitesConservadores.test.ts` congela a política de 09/10 (curva por
idade, ×1,5, piso 15, 7 dias, freio com 3 recusas, intervalo de 1min30 a
2min, janela 9h às 20h59 sem domingo) e reprova qualquer afrouxamento,
inclusive mudança na fórmula que não troque constante nenhuma. Apertar passa.
Mordida com sete afrouxamentos (todos reprovaram) e dois apertos (passaram).

Conferido no mesmo dia: nenhum botão do painel nem função do banco passa por
cima desses limites (`resetar_cota_campanha` não existe mais, e nenhuma
lista com pendentes tem a janela afrouxada).

## Guardas

`aquecimentoPeloUso.test.ts`: regra pura + reserva e tela lendo
`calcularLimiteDoDia` (provocada: trocar pela curva por idade reprova) + o
insert do histórico dentro da função atômica.

Relacionadas: [[quatro-protecoes-anti-ban-defendem-coisas-diferentes]] ·
[[espacamento-anti-ban-so-existia-no-papel]] · [[trocar-numero-zera-reputacao]]
