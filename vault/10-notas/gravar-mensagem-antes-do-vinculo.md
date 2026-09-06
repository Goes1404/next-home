---
title: A IA nunca via as próprias respostas — FK violada em silêncio
aliases: [vincularInteracaoNaMensagem, manda oi do nada]
tags: [whatsapp, banco, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/repositorio.ts, src/lib/whatsapp/gravacaoDeMensagem.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — 25/08/2026
summary: O webhook gerava o uuid da interação antes de enviar; a linha de ia_interacoes só era escrita no FIM. O insert da mensagem violava a FK, caía num console.error, e NENHUMA mensagem do bot foi gravada por 2 dias.
---
# A IA nunca via as próprias respostas

Relatado como "manda oi do nada, parece que perde o contexto". Não era perda:
era **ausência**. Nenhuma mensagem do bot foi gravada entre 23/08 e 25/08.

## Causa: ordem de escrita violando uma FK, em silêncio

`whatsapp_mensagens.interacao_id` referencia `ia_interacoes` (0040). O webhook
gerava o uuid ANTES de enviar e mandava esse id no insert da mensagem — mas a
linha de `ia_interacoes` só é escrita no FIM da requisição. O insert violava a
FK, o erro caía num `console.error`, e `gravarMensagem` devolvia
`{ inedita: true }` como se tivesse gravado. O cliente recebia a resposta
normalmente; só o banco sabia. **Medido: 8 respostas numa hora, zero linhas de
bot no banco.**

Tipos, testes, build e "a mensagem chegava" — todos verdes. Só consulta no
banco revelava ([[medir-producao-nao-confiar-em-parece-funcionar]]).

## Correção por construção, não por disciplina

`interacaoId` **saiu** dos parâmetros de `gravarMensagem`. O vínculo virou
`vincularInteracaoNaMensagem`, chamada depois de `registrarInteracao` já ter
escrito a linha. **Quando um parâmetro só pode ser usado errado, ele não deve
existir** — mesma lógica que tirou `legenda` de `enviarMidiaWhatsapp`.

A mensagem continua sendo gravada **antes** da telemetria, de propósito: perder
o vínculo custa uma avaliação no Live Chat; perder a mensagem custaria o
contexto inteiro de novo.

`gravacaoDeMensagem.test.ts` lê o código-fonte para travar a ordem nos dois
chamadores ([[testes-que-leem-o-codigo]]).

## Relacionadas
- [[falha-calada-e-a-pior]]
- [[conversa-pessoal-do-corretor-e-gravada]]
