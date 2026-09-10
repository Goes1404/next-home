---
title: O tradutor de prompt de imagem
tags: [ia, painel, medicao, defeito]
type: nota
status: estavel
custou: 1 sessao
codigo: src/lib/imagens/tradutor.ts, gramatica.ts, catalogoNoPrompt.ts
summary: O ChatGPT usa o mesmo modelo; a diferença era reescrever o pedido antes de mandar. Agora há um prompt só, em português, editável, e é ele que vai.
updated: 2026-09-10
---

# O tradutor de prompt de imagem

Pedido: "nossa IA de geração de imagem não está funcionando bem, está muito
ruim e longe do que eu quero". Estava.

## Os números que abriram a investigação

| fato | número |
|---|---|
| imagens geradas na vida inteira | **8**, 1 corretor |
| artes compostas (`arte_url`) | **0** |
| com imóvel do catálogo | **0** |

Dois prompts pagos dizem tudo: a palavra `Torre.` e
`Apartamento chamado "." em ., Barueri no estágio "Lançamento"`.

## A virada, e ela veio do usuário

O ChatGPT gera imagem com o **mesmo modelo** que já usávamos (`gpt-image-2`).
A diferença de resultado não é o modelo — é que ele **reescreve o pedido antes
de mandar** para o gerador. Nós mandávamos cru.

Daí o produto: chat livre → tradutor reescreve → o corretor **lê e edita em
português** → gera. Sem templates.

## O defeito mais instrutivo: a intenção certa, a execução errada nas duas pontas

O prompt final **já era mostrado** na tela. O comentário do código dizia:

> "esconder do corretor seria tirar dele a chance de corrigir"

E entregava o texto **em inglês**, dentro de um `<p>` onde não se digita. Dar a
chance de corrigir num idioma que ele não escreve, num elemento onde não se
escreve, é o mesmo que não dar.

**Régua:** ao ler um comentário que promete uma garantia, conferir se o código
a entrega. Aqui ele entregava metade — e a metade que faltava era a que
importava.

## O que ficou de arquitetura

| módulo | LLM? | papel |
|---|---|---|
| `gramatica.ts` | não | as quatro seções da doc oficial como DADO, e a conferência do que o tradutor devolveu |
| `catalogoNoPrompt.ts` | não | imóvel → fatos seguros; campo vazio não entra |
| `imovelNaArte.ts` | não | o imóvel citado no chat e as fotos dele |
| `tradutor.ts` | 1 chamada | reescreve, em português, e devolve o que não cobriu |

O portão: prompt num `<textarea>`, botão travado abaixo do piso de 80
caracteres — que é o que mata o `Torre.`

## Duas armadilhas que quase custaram caro

- **`marketing.ts` não é do caminho de imagem.** O plano mandava apagá-lo; o
  motor de VÍDEO depende dele. Conferir os importadores antes do `git rm` foi
  o que evitou derrubar o vídeo junto. **Módulo com nome de domínio não é
  prova de que ele serve a um domínio só.**
- **A ressalva legal ficou sem dono.** Era desenhada por `compor.ts`, que foi
  apagado com o caminho de marketing. A guarda foi reescrita para a metade que
  não muda: a ressalva **nunca** se pede ao modelo generativo — 3 acertos em 4
  é ótimo para manchete e inaceitável para aviso legal. Até o carimbo existir,
  o certo é sair SEM ressalva, não com uma aproximada que parece oficial.

Relacionadas: [[o-contrato-real-do-gpt-image-2]] ·
[[arte-de-ia-nao-e-midia-do-catalogo]] · [[referencia-no-chat-do-estudio]]
