---
title: Sessão caída com o número "conectado"
aliases: [Connection Closed, sessaoCaida, MOTIVO_SESSAO_CAIU, liberarFilaDaSessao, sessao_caiu]
tags: [whatsapp, anti-ban, armadilha]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/sessaoCaida.ts
  - src/lib/whatsapp/sessaoCaida.test.ts
  - src/lib/whatsapp/campaignDispatcher.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/whatsapp/saudeDaConexao.ts
  - src/lib/whatsapp/avisoDeQueda.ts
  - src/app/corretor/(painel)/campanhas/acoes.ts
created: 2026-10-09
updated: 2026-10-10
fonte: número da Márcia em 08/10/2026
summary: 'Quando o envio volta com "Connection Closed", a sessão do WhatsApp caiu, mesmo com o banco dizendo "conectado". O disjuntor abria por 12h e o painel prometia que voltava sozinho. Agora a falha marca a fila, devolve a cota sem gastar tentativa, o painel e a tela de listas pedem para reconectar, e reconectar tira a marca e levanta a pausa.'
---

# Sessão caída com o número "conectado"

## O caso

Às 9h de 08/10/2026, quatro envios da lista da Márcia voltaram com `HTTP 500
... Connection Closed`. O disjuntor abriu por 12 horas e o banco seguiu com
`status_conexao = 'conectado'`. A faixa do painel dizia "Pausamos os envios
para proteger seu número. Volta sozinho às 21h00". Não voltaria: a sessão
tinha caído, e às 9h do dia seguinte os primeiros envios falhariam de novo.

"Connection Closed" é o Baileys, por baixo da Evolution, dizendo que a ligação
com o WhatsApp está fechada. A mensagem não saiu, e a culpa não é do lead nem
do texto.

## O que mudou

- **No disparador**, antes da classificação comum da falha: cota devolvida,
  item sem gastar tentativa e marcado com `MOTIVO_SESSAO_CAIU`, falha contada
  para o disjuntor e a vez encerrada (mandar o próximo item daria no mesmo).
  O provedor é consultado: se ele também diz que o número caiu, o banco passa
  a dizer "desconectado" e a faixa de queda já existente assume.
- **Faixa do painel** (`avaliarSaudeDaConexao`): com o número "conectado" e
  pendentes marcados, aviso `sessao_caiu` (perigo) antes da pausa: "toque em
  Desconectar e conecte o número de novo". O caminho feliz continua com uma
  consulta só: a contagem da fila só roda quando já há aviso.
- **Tela de listas** (`statusDisparo`): o mesmo pedido, antes do texto da
  pausa, com o link "Conectar o número".
- **Reconectar libera** (`liberarFilaDaSessao`): pelo evento `connection.update`
  e pela sincronização do painel, a marca sai e a pausa cai, mas só quando
  achou marca de sessão. Pausa aberta por outra falha continua. O primeiro
  envio que dá certo também tira a marca, sem mexer em pausa.

## Sem coluna nova

A marca mora em `whatsapp_campanhas_fila.erro_motivo`. Basta para a faixa, a
tela de listas e a liberação, e não depende de migration.

## Cuidado

"Desconectar" no painel zera `conectado_em` (a curva de aquecimento recomeça).
Só é preciso no caso em que o provedor ainda diz "open" com a sessão morta.
Quando o provedor diz "close", basta conectar de novo, e a maturidade fica.

## Relacionadas
- [[queda-do-numero-pausa-a-lista-e-diz-o-motivo]] — desde a 0174 a sessão caída também tira o número do rodízio do link

- [[numero-sem-whatsapp-nao-e-falha-nossa]] (a outra falha que não é do número)
- `docs/MEMORIA.md`, seção "O aviso de queda do número (0071)": a faixa que este caso estende
- [[quatro-protecoes-anti-ban-defendem-coisas-diferentes]]
- [[fluxo-de-campanhas]]
