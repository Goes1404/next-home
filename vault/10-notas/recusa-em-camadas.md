---
title: Recusa em camadas — regex para o óbvio, IA para o duvidoso
aliases: [classificarRecusa, recusaEmCamadas, recusas_detectadas, frasesDeRecusa]
tags: [whatsapp, ia, crm, decisao, medicao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/recusaEmCamadas.ts
  - src/lib/whatsapp/classificarRecusa.ts
  - src/lib/whatsapp/frasesDeRecusa.ts
  - src/lib/whatsapp/turnoDeAtendimento.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - supabase/migrations/0162_registro_de_recusas.sql
  - scripts/revisarRecusas.sql
fonte: Pergunta do usuário "como arrumamos o regex de forma definitiva?" (06/10/2026)
created: 2026-10-06
updated: 2026-10-06
summary: Regex nenhuma cobre o português inteiro, então ela deixou de decidir tudo. Agora a regex resolve o óbvio, o que tem sinal de "não" e escapou vai a uma chamada curta à IA com a última fala nossa como contexto, e toda decisão fica registrada. O "Liberar contato" do corretor vira o rótulo de falso positivo, e um conjunto de frases de referência roda no CI.
---

# Recusa em camadas

Sequência de [[quem-nao-quer-contato-e-lido-sempre]]. Lá o vocabulário da
regex foi ampliado; aqui a regex deixou de ser a única camada, porque cada
remendo abre espaço para a próxima frase que escapa.

## As três camadas

1. **Regex** (`detectarRecusa`): decide sozinha o que é certeza. De graça, em
   toda mensagem.
2. **IA** (`classificarRecusa`): só para mensagem com **sinal negativo**
   (`temSinalNegativo`) que a regex não pegou. A chamada leva a última fala
   do bot ou do corretor, porque "não" depois de "pronto ou na planta?" é
   resposta e depois de "quer receber novidades?" é recusa. Orçamento de 4s,
   temperatura 0.
3. **Registro** (`recusas_detectadas`, 0162): uma linha por decisão, com quem
   decidiu, a confiança, o trecho e o que aconteceu (acolheu, encerrou,
   marcou, registrou).

## As travas que mantêm o erro contido

- A IA só decide com **confiança ≥ 0,8** e com o **trecho copiado da fala do
  cliente** (`lerVeredito`). Trecho inventado é descartado: ele vai para a
  linha do tempo e para o aviso ao corretor.
- Com a IA calada, só a família `parada` age. Desinteresse fica registrado
  como `registrou`, que é a fila de revisão do falso negativo.
- Falha da IA (sem chave, timeout, JSON torto) devolve o resultado da regex
  sozinha. A camada nova só acrescenta.
- Recusa que só a IA reconheceu conta para o segundo "não" encerrar
  (`recusasPelaIA` → `recusasAnterioresExtra`); a regex não a vê no histórico.

## Medir em vez de remendar

- **Falso positivo**: "Liberar contato" carimba `desfeito_em` nas linhas que
  marcaram o lead (`marcarRecusasDesfeitas`).
- **Revisão semanal**: `scripts/revisarRecusas.sql` (quem decidiu, o que foi
  desfeito, o que a IA viu e não agiu, candidatas a subir para a regex).
- **CI**: `frasesDeRecusa.test.ts` cobra que a regex nunca acuse conversa
  normal, que toda recusa conhecida passe no filtro de sinal negativo e que
  a regex não pegue menos que antes (catraca `ACERTOS_DA_REGEX`, 28 de 35).

## Achados de passagem

- "Não tenho interesse em **apartamento**" é preferência (o cliente queria
  casa), não recusa. Tipo de imóvel entrou nos desarmes da regex; a IA, com
  o contexto, decide o caso.
- A guarda da ficha recortava o ramo do silêncio até o primeiro texto
  "ia_calada", e o código novo usa esse texto antes. Âncora passou a ser o
  `return` do ramo.
- Mordida de guarda que não tira o que se quer: tirar "fechei" do filtro não
  reprovou porque "outra imobiliária" ainda casava. Refeita tirando os dois.

Ver também: [[memoria-da-conversa-e-ficha-viva]], [[quando-a-ia-responde]].
