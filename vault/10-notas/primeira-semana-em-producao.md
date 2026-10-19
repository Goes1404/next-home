---
title: A primeira semana em produção
aliases: [relatório de uso, uso da plataforma, semana de 03 a 09/10]
tags: [crm, whatsapp, medicao]
type: nota
status: growing
custou: medio
codigo:
  - scripts/relatorioDaSemana.sql
fonte: pedido de 10/10/2026 ("qual o relatório de uso dessa última semana")
created: 2026-10-10
updated: 2026-10-10
summary: De 03 a 09/10/2026, seis corretores importaram 855 leads, mandaram 245 mensagens de lista (31 respostas) e conversaram com 47 clientes; a IA respondeu 96 vezes e o corretor 115, com mediana de 20 segundos. Uma visita marcada, nenhuma venda. No sábado 10/10, 4 dos 6 números estavam desconectados e o da Márcia com a sessão caída. Para medir de novo, scripts/relatorioDaSemana.sql, sem o perfil demo e sem os robôs dos cliques.
---

# A primeira semana em produção

Medido em 10/10/2026, de sábado 03/10 a sexta 09/10 (meia-noite de São
Paulo), sem o perfil de demonstração. As consultas estão em
`scripts/relatorioDaSemana.sql`.

## Os números

| | semana |
|---|---|
| leads novos | 897 (855 importados, 35 pela palavra-chave, 4 do anúncio, 3 pelo WhatsApp) |
| clientes que escreveram | 47 conversas, 363 mensagens |
| respostas da IA | 96 a clientes (+2 consultor, +2 rascunho), em 36 conversas |
| mensagens do corretor | 357 |
| vezes do cliente respondidas | 211 de 223; 96 pela IA, 115 pelo corretor |
| mediana até a resposta | 20 s (IA 18 s, corretor 2,4 min); 12 sem resposta |
| listas | 245 enviadas, 31 respostas (12,7%), 55 números sem WhatsApp |
| funil hoje | 633 novos, 223 mensagem enviada, 39 em conversa, 3 qualificados, 1 visita |
| visitas marcadas | 1 · vendas: 0 |
| avaliações da IA | 15 boas, 3 ruins |

Por corretor, quem mais usou foi a Bruna (lista de 300, 30 clientes
conversando), depois Ramos e Grazi. Ana Lima importou 286 leads na sexta.
Eduardo, Miro e Renan não entraram na semana.

## O que o número esconde

- **95% dos leads vieram de planilha.** Entrada nova de verdade foram 4 leads
  do anúncio e 3 do WhatsApp.
- **As 12 vezes sem resposta estão todas em conversa com a IA desligada**,
  porque o corretor falou antes (regra da 0152). Só uma era de quem pediu
  para sair.
- **Nada do painel além de lista e WhatsApp foi usado**: zero nota, zero
  tarefa, zero venda, zero arte, zero vídeo, uma etapa mudada à mão. O funil
  só andou pelos movimentos automáticos.
- **Agenda de visitas configurada só por Bruna, Ramos e Grazi**, regras da
  IA só pela Bruna.

## Os números no fim da semana

No sábado 10/10 às 13h30 não havia uma mensagem no dia. O disparador das 9h
dizia: Ana, Carolini, Bruna e Ramos "não pareados" (caíram entre 08/10 16h10
e 09/10 20h04; a Ana ficou só 6 horas conectada), e a Márcia com a sessão
caída e envios pausados até 21h. A lista da Márcia (36) não mandou nenhuma
mensagem desde 07/10. Só a Grazi estava no ar.

Ninguém foi avisado fora do painel: o aviso por e-mail precisa de
`RESEND_API_KEY`, e o aviso por WhatsApp sai do próprio número que caiu.

## Três armadilhas da medição

1. **Perfil demo.** O "Lucas Andrade" e os colegas `demo-*` foram semeados
   em 07/10. As datas que o seed escreve foram para o passado (leads de 31/03
   a 01/10, nenhuma mensagem na semana), mas as que o banco carimba sozinho
   ficaram no dia do seed: 18 visitas (`visita_marcada_em`, trigger da 0122)
   e 39 vendas (`vendas.created_at`). Sem o filtro, a semana teria 19 visitas
   e 39 vendas em vez de 1 e 0. Filtrar `slug not like 'demo-%'`.
2. **Mensagem `bot` não é resposta da IA.** Inclui lista e lembrete: em 07/10
   foram 200 mensagens `bot` e 26 respostas da IA. Contar a IA em
   `ia_interacoes` (`acao = 'respondida'`).
3. **Os cliques do site são 71% robôs.** ClaudeBot (321), GPTBot (158) e
   MJ12bot (158) seguem os botões `/wa/<imóvel>?de=site` das fichas: ~21 por
   imóvel, em 39 imóveis. O `robots.txt` só bloqueia `/corretor` e `/api`. No
   anúncio, 441 dos 962 acessos são robôs, 393 deles o da Meta montando a
   prévia. Contar pessoas distintas (`visitante`): 118 no anúncio, 81 no
   site.

## Visitas ao site

Não deu para ler. A API de Web Analytics da Vercel responde 404 "Web
Analytics not found", embora o script `/_vercel/insights/script.js` esteja no
ar (200) e o coletor responda. Conferir na aba Analytics do projeto na
Vercel.

## Relacionadas
- [[onde-o-clique-do-anuncio-se-perde]]
- [[sessao-caida-com-o-numero-conectado]]
- [[quando-a-ia-responde]]
- [[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]]
- [[perfil-de-demonstracao-do-corretor]]
- [[MOC — Evals e Medição]]
