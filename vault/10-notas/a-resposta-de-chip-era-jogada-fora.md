---
title: A resposta de chip era coletada e jogada fora
tags: [ia, painel, defeito, guarda]
type: nota
status: estavel
custou: 1 sessao
codigo: src/lib/estudio/turno.ts, src/lib/imagens/tradutor.ts
summary: Ao trocar montarPromptFinal pelo tradutor, as escolhas de chip pararam de chegar ao prompt. Um `no-unused-vars` foi o único sinal.
updated: 2026-09-10
---

# A resposta de chip era coletada e jogada fora

Achado ao validar a própria Onda 1, e o único sinal era um **warning de
lint**: `'respostas' is assigned a value but never used`.

## O defeito

O chat do Estúdio pergunta ("Que hora do dia?") e o corretor toca numa
alternativa. Essa escolha é gravada com `dados.tipo === "escolha"`, e
`ideiaAcumulada` a **exclui de propósito** — texto solto "Pôr do sol" viraria
uma frase do corretor sem dizer a que responde.

Enquanto `montarPromptFinal` existia, ela voltava por `respostas`. Ao
substituí-lo por `traduzirPedido`, a coleta ficou e o **consumo sumiu**:

```ts
const respostas = respostasDadas(historicoCompleto);   // coletado
// ...e nunca usado
```

Dois estragos, os dois calados:

1. **A resposta não chega ao prompt.** O corretor responde e o resultado é o
   mesmo — pergunta que não muda nada é pior que pergunta nenhuma: cobra um
   toque e mente sobre o que faz.
2. **"Story" tocado no chip virava peça QUADRADA.** `tamanhoDoTexto(ideia)` e
   `receitaDoTexto(ideia)` leem texto, e a escolha estava fora dele por
   construção.

O caminho de VÍDEO já fazia certo — ele junta `dados.escolha` ao texto. Só o
de arte não. **Dois caminhos irmãos e um só corrigido é a assinatura deste
defeito.**

## O conserto

O par viaja como PAR, não como texto solto: `EntradaDoTradutor.respostas`
vira um bloco "O corretor já respondeu isto" no prompt do motor. As
heurísticas passam a ler `ideia + escolhas`.

O que NÃO mudou: `imovelPorTexto` continua lendo só o que foi **digitado**.
Alternativa curta ("Alta", "Manhã") casaria com nome de empreendimento por
acidente — falso positivo já medido nesta base.

## A régua

- **Warning de lint em refatoração grande é dedo apontando.** Este apareceu
  entre 32 warnings pré-existentes e era o único que descrevia comportamento.
  Vale ler os que ficam em arquivo que você **acabou de mexer**.
- **Ao apagar uma função, procurar o que ela CONSUMIA**, não só quem a
  chamava. O compilador cobra o chamador; ele não cobra o argumento órfão.

Relacionadas: [[o-tradutor-de-prompt-de-imagem]] ·
[[o-contrato-real-do-gpt-image-2]]
