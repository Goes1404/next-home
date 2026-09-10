---
title: O contrato real do gpt-image-2, sondado sem gastar imagem
tags: [ia, medicao, custo]
type: nota
status: estavel
custou: 20min
codigo: src/lib/imagens/gerarImagem.ts
summary: image[] múltiplo é aceito, input_fidelity NÃO existe neste modelo, e a doc admite até 2 minutos de latência — contra os 60s da Vercel.
updated: 2026-09-10
---

# O contrato real do gpt-image-2

Sondado em 10/09/2026 ao desenhar a reestruturação da geração de imagem.

## A técnica: sondar sem gerar

Geração de imagem custa por chamada, então descobrir o contrato tentando é
caro. O truque é mandar o pedido com **um parâmetro inválido conhecido** e ler
de qual campo a API reclama:

- `size=7x7` é validado **antes de tudo** — serve para provar que o corpo foi
  aceito, mas mascara a validação de todo o resto.
- Para isolar um parâmetro específico, deixe tudo válido e ponha uma
  **sentinela inválida** num campo cuja validação você já conhece
  (`quality=ZZZ_SENTINELA`). Se o erro for da sentinela, o que veio antes
  passou.

Nenhuma das sondas gerou imagem. Custo: zero.

## O que ficou provado

| sonda | resultado |
|---|---|
| `image[]` com múltiplas imagens | **aceito** — o erro veio do `size`, não do `image` |
| `input_fidelity=high` | **rejeitado por nome:** "o modelo 'gpt-image-2' não suporta o parâmetro 'input_fidelity'" |
| `quality` | `low` · `medium` · `high` · `auto` |

**`input_fidelity` não existir tem consequência de PRODUTO, não só técnica:** a
foto real que se manda como referência é **reinterpretada**, nunca preservada
pixel a pixel. Qualquer tela que prometa "a mesma foto, só melhor" está
mentindo — e quem descobre é o corretor, na frente do cliente.

## O que a documentação oficial acrescenta

- **Estrutura de prompt recomendada: seções rotuladas** — CENA · SUJEITO ·
  DETALHES · RESTRIÇÕES.
- **Texto entre aspas, com posição e tipografia, e nomes soletrados letra a
  letra.** É a técnica documentada para o texto literal sair certo — esta base
  mediu **3 acertos em 4** sem ela.
- **Style transfer se faz identificando cada entrada por número e propósito**
  ("entrada 1: sujeito, entrada 2: estilo"), dizendo como combinam.
- **Máximo 4 imagens de referência**, e elas guiam como *referência*, **não
  como template**: copiar o layout de uma peça não é garantido. O que
  transfere bem é paleta, clima e tipo de composição.
- **Para região que precisa ser pixel-idêntica, compor por cima da imagem** —
  a própria doc diz para não confiar no prompt. É o argumento oficial a favor
  do carimbo por código de telefone e ressalva.
- **Prompt complexo pode levar até 2 minutos.** A função da Vercel morre em
  60s e o teto interno de `gerarImagem.ts` é 45s. Com duas referências, o
  estouro é provável — e estourar significa **matar a função com a imagem já
  paga**.

## Régua

Antes de acrescentar parâmetro novo à chamada de imagem, sonde com sentinela
inválida em vez de tentar e ver o que sai. Uma tentativa "para ver" custa
R$ 0,027 em `low` e R$ 0,21 em `medium`; a sonda custa nada.

Relacionadas: [[arte-de-ia-nao-e-midia-do-catalogo]] ·
[[referencia-no-chat-do-estudio]] · [[quanto-custa-uma-imagem]]
