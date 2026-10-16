---
title: Pedir um tempo não é aceitar a visita
aliases: [conversa da Rute, visita falsa, corretor Carlos, adiamento, aguardar, lead duplicado na lista]
tags: [ia, prompt, armadilha]
type: armadilha
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/jogada.ts, src/lib/whatsapp/pedidoDeAgendamento.ts, src/lib/whatsapp/nomeDoCorretor.ts, src/lib/whatsapp/repeticao.ts, src/lib/whatsapp/dadoPedido.ts, src/lib/whatsapp/turnoDeAtendimento.ts, src/lib/whatsapp/aiAgent.ts, src/lib/whatsapp/campaignDispatcher.ts, src/lib/whatsapp/listaDeTransmissao.ts, src/app/corretor/(painel)/importar/actions.ts]
fonte: conversa 3496869d (Carol × Rute, 15/10/2026), lida no banco em 16/10
created: 2026-10-16
updated: 2026-10-16
summary: A IA gravou no CRM uma visita que a cliente não escolheu ("Vou confirmar com vc depois, pode ser?" casou em ACEITE), disse que ela seria recebida pelo "corretor Carlos" (a corretora é a Carolini), ofereceu 18/10 para "último domingo do mês" (25/10) e deixou "Onde fica exatamente?" sem resposta. A Rute tinha quatro leads (planilha importada duas vezes) e a lista ainda tinha dois envios para ela. Seis consertos, prompt v50.
---
# Pedir um tempo não é aceitar a visita

Relatado em 16/10: "aconteceu alguma coisa estranha nessa conversa". A
conversa da Carol com a Rute (Dom Parque, 15/10) tinha cinco defeitos, e
nenhum deles aparecia em teste, tipo ou build.

## O que aconteceu, fala a fala

| a Rute disse | o que a IA fez | por quê |
|---|---|---|
| "Onde fica exatamente?" | mandou só "Quer agendar uma visita?" | a trava anti-eco cortou o endereço repetido |
| "Só um momento" | "Qual dia da semana fica melhor?" | nada no planner lia pedido de espera |
| "Pode ser no último domingo do mês?" | ofereceu domingo **18/10** | o planner só via "domingo"; o último é 25/10 |
| "No máximo amanhã já te aviso" | ofereceu horários de **amanhã** | "amanhã" virou o dia da visita |
| "Vou confirmar com vc depois, pode ser?" | **confirmou a visita** de 25/10 e gravou no CRM | "pode ser" casou em `ACEITE` |
| (na confirmação) | "você vai falar com o corretor Carlos" | a instrução pedia o nome sem dar o nome |

No dia seguinte a Carol escreveu perguntando qual data tinha ficado, e no CRM
a visita constava como marcada.

## As causas e os consertos

1. **Adiamento ≠ aceite.** `ACEITE` casa "pode ser", e "vou confirmar com você
   depois, pode ser?" tem "pode ser". Hoje `ADIAMENTO` (vou confirmar, te
   aviso, só um momento, vou ver e te falo…) vence o aceite e apaga o dia
   citado, como a negação já vencia. A jogada nova `aguardar` responde numa
   frase, sem pergunta, sem horário e sem confirmar nada.
2. **Contraproposta ≠ aceite.** "Pode ser no último domingo do mês?" logo
   depois de uma oferta também passaria como aceite. Dia que a oferta não
   citou, ou data calculada que ela não trazia, vira `agendar`.
3. **O nome do corretor vai escrito.** `confirmar_visita` mandava "diga o nome
   do corretor" sem o nome, e a regra 21 proíbe dizer que o cliente vai falar
   com o corretor. Entre as duas ordens, o modelo inventou "Carlos". A
   instrução leva o primeiro nome do cadastro, a regra 21 ganhou a exceção da
   visita, e `corrigirNomeDoCorretor` troca o nome inventado depois de
   "corretor(a)" pelo do cadastro (apelido que é começo do nome passa).
4. **"Último/primeiro <dia> do mês" vira data.** `pedidoDeAgendamento(texto,
   agora)` calcula no fuso de São Paulo e o bloco de agendar diz
   "domingo, 25/10 (calculada pelo sistema)".
5. **A frase que responde a pergunta repetida fica.** `aindaNaoDado` achou o
   endereço "não dito" (a IA tinha escrito "no Jardim Tupanci", o dado é
   "Jardim Tupanci") e mandou repetir; a trava anti-eco achou repetido e
   cortou. Com `responder_dado`, a frase que traz a marca do dado (o número ou
   a rua) não é cortada como eco.
6. **A pessoa é o telefone.** A mesma planilha foi importada duas vezes, com
   dois minutos de diferença: dois telefones × dois cadastros. A tela marcava
   "já existe", mas o servidor gravava tudo. Hoje `importarLeads` recusa
   telefone já cadastrado (pela RLS: carteira do corretor, equipe do gestor) e
   repetido na mesma lista. E o disparador confere os outros cadastros do
   mesmo telefone antes da cota: a lista não sai duas vezes para o mesmo
   número, pedido de parada num cadastro vale para todos, e a conversa
   recente do corretor em qualquer cadastro segura o envio.

## Régua

- **Palavra de aceite precisa de guarda de adiamento**, do mesmo jeito que
  precisa de guarda de negação. "Pode ser" é a palavra mais comum dos dois.
- **Instrução que pede um dado tem de trazer o dado.** "Diga o nome do
  corretor" sem o nome, mais uma regra que proíbe o assunto, é convite a
  inventar.
- **Duas checagens do mesmo fato precisam concordar.** "Já foi dito?" no
  planner (por texto exato) e no anti-eco (por semelhança) discordaram, e a
  pergunta ficou sem resposta.
- **O dedup da tela não é dedup.** Regra de "já existe" que só a interface
  conhece some no segundo clique.

## Pendente

Leads e fila da Rute: dois cadastros duplicados, dois itens pendentes na
lista e a visita de 25/10 que ela não confirmou. O SQL de limpeza foi
entregue ao usuário; aplicar é decisão dele (a Carol já perguntou à Rute).

## Relacionadas
- [[quando-a-ia-responde]] · [[visita-remarcada-e-desmarcada-pela-conversa]]
- [[lista-de-transmissao-visivel-e-controlavel]] · [[importacao-de-leads-le-os-formatos-que-o-corretor-tem]]
- [[MOC — IA e Atendimento]]
