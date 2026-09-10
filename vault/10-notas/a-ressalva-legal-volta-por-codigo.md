---
title: A ressalva legal volta por código, e o contraste dela é medido
tags: [ia, painel, defeito, guarda, medicao]
type: nota
status: estavel
custou: 1 sessao
codigo: src/lib/imagens/carimbo.ts, src/app/api/imagens/gerar/route.ts
summary: O aviso "imagem meramente ilustrativa" ficou sem dono quando compor.ts foi apagado. Voltou como carimbo por código — e a primeira versão dele era ilegível.
updated: 2026-09-10
---

# A ressalva legal volta por código

## O buraco

`compor.ts` desenhava "Imagem gerada por IA, meramente ilustrativa." e foi
apagado em 10/09/2026 junto com o caminho de arte composta — que nunca
produziu uma peça (`arte_url` nulo nas 8 gerações da vida inteira).

Com ele foi embora o **único lugar do sistema que escrevia a ressalva numa
imagem**. O motor de VÍDEO nunca perdeu a dele (`render.ts` a desenha no
FFmpeg). Só o caminho de imagem ficou descoberto: **dois caminhos irmãos e um
só corrigido**, a assinatura que esta base já registrou mais de uma vez.

Nada na esteira reclamou. Build, tipo e teste seguiram verdes.

## Por que SEMPRE, e não atrás de botão

O carimbo de marketing — logo, telefone, chamada — é decoração e cabe num
botão: quem vai levar a arte para o Canva não quer a marca queimada nela.

A ressalva não é decoração. Ela separa uma perspectiva ilustrativa de uma
**promessa ao cliente**, e aviso legal opcional é aviso legal esquecido — a
mesma razão pela qual a cláusula anti-invenção mora em `gerarImagem.ts` e não
na tela.

## O defeito da MINHA primeira versão: 2,08:1

O véu ia até 0,62 de preto e o texto ficava no MEIO da faixa. Sobre uma foto
de céu branco — o pior caso, e o enquadramento mais comum que esta tela gera —
isso dá **2,08:1** de contraste. Abaixo de AA: um aviso legal que não se lê.

**E passou no olho.** A amostra que eu tinha desenhado usava fundo cinza-claro
(`#e8eef2`), não branco; ali dava para ler. Foi preciso compor sobre branco
puro e calcular a luminância para o número aparecer.

O conserto são duas coisas juntas — o véu fecha mais cedo e mais forte
(0 → 0,72 → 0,82) e a linha de base desce para 62% da faixa, onde já está
escuro. Medido de novo: **9,46:1**.

**Régua: ninguém julga contraste de olho.** Medir aprova, olhar reprova — os
dois são necessários, e para contraste a ordem é medir primeiro.

## O que as guardas travam

| guarda | o que pega |
|---|---|
| contraste sobre branco puro | véu fraco / texto no lugar claro (provocada: reprovou com 2,19:1) |
| carimbo ANTES do upload | versão sem aviso ficando no bucket |
| hash sobre os bytes carimbados | nome do arquivo divergindo do conteúdo |
| `comRessalva` chegando à tela | falha do carimbo saindo calada |
| a RESSALVA cabe em todo `TAMANHOS` | texto alongado ou formato mais estreito |

## Falhar sem queimar dinheiro

A imagem **já foi paga** quando o carimbo roda. Recusar a entrega queimaria o
dinheiro e devolveria erro para quem não errou. Então degrada: os bytes
originais voltam com `carimbada: false`, e a tela é **obrigada** a dizer que a
peça saiu sem ressalva e que o corretor precisa pôr a dele.

Relacionadas: [[o-tradutor-de-prompt-de-imagem]] ·
[[o-contrato-real-do-gpt-image-2]] · [[arte-de-ia-nao-e-midia-do-catalogo]]
