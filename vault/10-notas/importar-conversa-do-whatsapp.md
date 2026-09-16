---
title: Importar a conversa exportada do WhatsApp
aliases: [zip do whatsapp, exportar conversa, importação de leads por zip]
tags: [crm, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/leads/zipLeitura.ts
  - src/lib/leads/whatsappExport.ts
  - src/lib/leads/importacao.ts
  - src/app/corretor/(painel)/importar/actions.ts
  - src/app/corretor/(painel)/importar/ImportarClient.tsx
created: 2026-09-12
updated: 2026-09-12
fonte: pedido do usuário (12/09/2026) + leitura dos formatos de export do WhatsApp
summary: O .zip de "Exportar conversa" entra pelo mesmo campo de arquivo da importação. Cada participante que não é o corretor vira candidato a lead. Contato salvo na agenda vem SEM telefone, de propósito — o número não está no arquivo e não se adivinha.
---
# Importar a conversa exportada do WhatsApp

O corretor abre a conversa no celular, usa **Exportar conversa → Sem
mídia**, e joga o `.zip` no mesmo campo de arquivo que já aceitava PDF e
CSV. Serve para uma conversa de duas pessoas e para um **grupo inteiro de
uma vez** — que é onde ela rende mais.

## O que o arquivo tem, e o que ele não tem

Um export é um `.txt` de uma linha por mensagem, em dois formatos conforme
o aparelho:

```
Android:  12/09/2026 14:32 - Fulano: mensagem
iPhone:   [12/09/2026 14:32:11] Fulano: mensagem
```

O que **não** está lá, e é a decisão que governa o resto: **contato salvo
na agenda aparece pelo NOME, e o número dele não existe em lugar nenhum do
arquivo** — nem no texto, nem no nome do `.txt`. Contato desconhecido, ao
contrário, aparece como `+55 11 99123-4567`, e esse é o caso de quase todo
cliente, porque cliente novo não está na agenda de ninguém.

## Nada é inventado — e o candidato sem telefone CONTINUA vindo

Havia três saídas para o contato salvo na agenda, e duas são piores:

1. **Adivinhar** o número a partir de algo digitado no meio da conversa.
   O número que alguém escreve num chat é do cônjuge, do síndico, de um
   terceiro. Mandaria a ficha de um cliente para o telefone de outro.
2. **Descartar calado.** Devolveria "nenhum contato encontrado" para um
   arquivo que tem exatamente um contato, com nome e intenção dentro.
3. **Trazer sem o telefone**, desmarcado, com etiqueta própria ("falta o
   telefone") e um aviso dizendo de onde vem a falta. Quem preenche é o
   corretor — o número está no celular dele, a dois toques.

Ficou a 3. Campo vazio sozinho é indistinguível de defeito: é a etiqueta
que diz que a falta é do ARQUIVO, e que o conserto é digitar.

## O DDI é conferido ANTES de normalizar

`+1 415 555 2671` tem **onze dígitos**, exatamente como um celular
brasileiro com DDD — e `normalizarTelefoneBrasileiro` carimbaria um `55`
na frente, criando um número que existe e é de outra pessoa. É a mesma
armadilha registrada em 11/09 em [[conversa-casa-com-lead-por-telefone]],
agora do lado da importação.

Regra: rótulo que começa com `+` só normaliza se os dígitos começarem com
`55`; sem `+`, só com 10 ou 11 dígitos (DDD + número). Número estrangeiro
entra **cru**, sem E.164, para o corretor decidir na revisão.

## Quem exportou não vira lead

- **Conversa de duas pessoas:** o nome do arquivo resolve sozinho.
  "Conversa do WhatsApp com Ana Prado" diz quem é o outro lado; o dono é o
  que sobra. Não depende de o cadastro do corretor no CRM estar escrito
  igual ao WhatsApp dele.
- **Grupo:** não há resposta dentro do arquivo. Quem completa é o cadastro
  do corretor da sessão — nome e `corretores.whatsapp`, que é `not null`
  para os 8.
- **Nunca um palpite.** "O que mais falou é o dono" tiraria do funil
  justamente o participante mais engajado, que é o melhor lead do grupo.

## Detalhes que custam tempo se não estiverem escritos

- **Marca invisível.** O iPhone injeta `U+200E` no começo de cada linha e
  antes de cada aviso de mídia, e o Android usa `U+202F` antes de AM/PM.
  Regex escrita olhando para o texto na tela não casa nada. Os fixtures do
  teste trazem os invisíveis de propósito — fixture "limpo" testa um
  formato que não existe.
- **Aviso de sistema com dois-pontos.** A separação é o primeiro `: `
  depois do horário, e `Bruna mudou o assunto do grupo para "Plantão:
  Vitra"` cairia nela. O que distingue é a forma: nome de pessoa e
  telefone são curtos, sem aspas e sem pontuação de frase.
- **Mensagem de várias linhas** não traz horário na continuação. Sem
  emendar, um cliente que escreve um parágrafo com quebras perde tudo
  menos a primeira linha.
- **`<Arquivo de mídia oculto>` conta como mensagem mas não é fala.** No
  campo "mensagem" da ficha, ele empurra para fora a frase que interessa.
- **`.zip` não é sinônimo de conversa.** Um `.csv` compactado segue para
  `extrairDeTexto` em vez de morrer com "formato não suportado" por causa
  do envelope.
- **Só `.txt`/`.csv`/`.tsv` são descomprimidos.** As mídias são quase todo
  o peso do arquivo e não têm contato dentro. `__MACOSX/` fica de fora:
  tem os mesmos nomes e conteúdo nenhum.

## O leitor de ZIP é caseiro, pelo mesmo motivo do PDF

`zipLeitura.ts` lê o diretório central e chama o `inflateRaw` que o Node já
traz — a mesma escolha de [[pdf-extrai-imagens-embutidas]]. ZIP64, senha
e compressão fora de `store`/`deflate` devolvem **motivo tipado**, que a
tela transforma numa frase; "não foi possível ler o arquivo" sem dizer por
quê é o erro que manda alguém tentar de novo à toa.

Duas armadilhas do formato, as duas com teste:

- **O campo `extra` do cabeçalho LOCAL é diferente do que o diretório
  central declara** com frequência (alinhamento, carimbo de hora). Calcular
  o início dos dados com o número do central entrega bytes deslocados, e o
  `inflate` falha com uma mensagem que não diz nada sobre a causa.
- **O registro de fim se procura de TRÁS para frente**: o comentário final
  do ZIP pode conter a própria assinatura, e a ocorrência válida é a
  última.

## O que ficou de fora, declarado

A conversa **não** é restaurada em `whatsapp_conversas` /
`whatsapp_mensagens`. Isso reconstruiria o corpus de few-shot zerado na
limpeza de 12/09, e é tentador — mas é outra obra: a 0111 exige `lead_id`,
a conversa pertence à instância de um corretor, e `e_teste` precisaria de
uma decisão própria. O que sobrevive do conteúdo são as **primeiras cinco
falas do cliente**, que viram o campo "mensagem" da ficha — é ali que o
corretor lê o que a pessoa queria antes de retomar o contato.

## Relacionadas
- [[envio-mandava-telefone-sem-ddi]] — a mesma armadilha do DDI, do outro lado
- [[conversa-casa-com-lead-por-telefone]] — variantes de telefone ao casar conversa e lead
- [[pdf-extrai-imagens-embutidas]] — o outro parser caseiro desta base
- [[nome-util-do-lead-e-modulo-puro]] — sem nome utilizável, a identidade é o telefone
- [[MOC — CRM e Painel]]
