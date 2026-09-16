---
title: PDF lido com readAsText no navegador devolve binário
aliases: [reajuste em massa não aceita PDF]
tags: [painel, midia, armadilha]
type: nota
status: evergreen
custou: baixo
codigo: [src/app/corretor/(painel)/admin/precos/PrecosManager.tsx, src/app/corretor/(painel)/admin/precos/actions.ts, src/lib/leads/pdfTexto.ts]
created: 2026-09-13
updated: 2026-09-13
fonte: relato do usuário em 13/09/2026
summary: O reajuste em massa só aceitava .csv/.txt/.tsv e lia com FileReader.readAsText. Afrouxar o `accept` não resolveria: PDF lido assim vira binário e o parser diria "nenhum dado válido" num arquivo que tem a tabela inteira dentro.
---
# PDF lido como texto no navegador é binário

Relatado como *"o upload de atualizar preços em massa não está aceitando
arquivos PDF"*. A causa visível era um `accept=".csv,.txt,.tsv"` — mas a
correção óbvia (acrescentar `.pdf` ali) teria produzido um defeito **pior**
que o original.

## Por que só afrouxar o `accept` seria pior

A tela lia o arquivo com `FileReader.readAsText`. Num PDF isso devolve os
bytes do arquivo interpretados como texto — `%PDF-1.7`, dicionários e fluxos
comprimidos. `parsearTabelaTexto` não acha linha nenhuma e a tela responde
*"Nenhum dado válido de imóvel e preço foi identificado"*.

Ou seja: o arquivo passaria a ser aceito e continuaria não funcionando, e
agora sem nada apontando para a causa. **Recusa explicada é melhor que
aceitação que não faz nada** — a mesma régua do pareamento que falhava calado.

## Onde a leitura tem de acontecer

O extrator desta casa (`extrairTextoDePdf`, em `pdfTexto.ts`) usa
`node:zlib`, que não existe no navegador. Então o PDF cruza uma Server Action
— e aqui ele PODE cruzar, diferente do book do imóvel: tabela de preços é PDF
de texto gerado de planilha, com dezenas de KB, bem abaixo do teto de corpo
de 12 MB deste projeto. O teto próprio de 8 MB recusa antes de subir, porque
estouro de corpo chega como falha genérica de plataforma e não diz o que fazer.

**Sem IA, de propósito.** O texto está literalmente dentro do arquivo;
mandá-lo para um modelo seria pagar para adivinhar o que dá para conferir — e
o que ele adivinhasse viraria preço no catálogo.

## O caso que este caminho não cobre

PDF **escaneado** (a página é uma imagem) não tem texto para extrair. Aí a
action devolve o motivo em voz alta — "copie os valores e cole na caixa
acima" — em vez de um texto vazio que a tela traduziria como "nenhum dado
válido", mandando procurar defeito no arquivo errado.

Ver também: [[dado-gravado-e-nao-exibido-e-dado-perdido]]
