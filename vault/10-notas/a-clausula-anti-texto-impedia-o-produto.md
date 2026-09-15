---
title: A cláusula anti-texto impedia o produto existir
aliases: [texto na imagem, textoNaCena, aspas no pedido de imagem]
tags: [midia, licao]
type: nota
status: growing
custou: medio
codigo:
  [
    src/lib/imagens/gerarImagem.ts,
    src/lib/imagens/textoNaCena.ts,
    src/lib/imagens/gramatica.ts,
    src/lib/estudio/turno.ts,
    src/app/api/imagens/gerar/route.ts,
  ]
created: 2026-09-11
updated: 2026-09-11
fonte: spec docs/superpowers/specs/2026-09-11-estudio-de-imagem-livre-design.md
summary: Toda geração levava, por código, a proibição de escrever qualquer texto na imagem — e a única fresta que a abria nunca teve chamador. Peça publicitária era impossível por construção, e ninguém tinha medido isso.
---

# A cláusula anti-texto impedia o produto existir

O Estúdio não produzia peça publicitária, e a leitura fácil era culpar o
modelo. Não era: é o mesmo `gpt-image-2` que o ChatGPT usa. Eram três
travas nossas, e a primeira é a que explica a queixa inteira.

## `textoNaCena` nunca teve um chamador

`promptFinal` tinha dois ramos: com texto ditado, manda soletrar; **sem
texto ditado, proíbe toda escrita** — "sem texto, letras, números, placas,
letreiros, logotipos, marcas, selos de preço". O campo que abria o primeiro
ramo (`textoNaCena`) não era preenchido por **nenhum** `.tsx`, rota ou
módulo: só a definição e o uso interno.

Ou seja: **100% das imagens já geradas saíram sob a proibição.** As peças
que o corretor usa como referência — manchete, metragem, voucher, logo —
eram impossíveis por construção, e nada no build, no tipo ou no teste
dizia isso. É o décimo caso de "construído e nunca ligado" nesta base, e o
primeiro em que o recurso desligado era a válvula de escape de uma
proibição.

## A proibição foi RETIRADA, e o risco está assumido

Decisão do dono do produto, com o custo apresentado: a IA vai inventar
nome de empreendimento, metragem e preço quando achar que a peça pede —
foi exatamente isso que desenhou a placa `"VISTA ALTO"` numa fachada que
ninguém batizou. **Quem publica responde pelo que está escrito.**

O que sobrou de código é a soletração: quando o corretor DITA o texto,
entre aspas no próprio pedido, a instrução de reproduzir caractere por
caractere entra. Medido na F0 de 10/09: **2 em 2** com a técnica, contra 3
em 4 sem.

## Aspas duplas são a convenção, e as simples ficam de fora

`textosEntreAspas` lê o prompt APROVADO (na rota, não na proposta do chat)
e extrai até quatro textos. Aspas retas e curvas — o teclado do celular
troca `"` por `“ ”` sozinho, e aceitar só a reta faria a técnica falhar
justamente para quem usa o painel no telefone.

Aspas SIMPLES ficam de fora de propósito: "marca d'água" e "uma sala
'moderna'" virariam texto para desenhar na peça. O erro é assimétrico —
não reconhecer custa um pedido menos preciso; reconhecer errado suja a
imagem paga.

Dois textos saem como LISTA (`"A"; "B"`), nunca colados: juntar por barra
faz o modelo desenhar o separador dentro da arte, e o defeito só aparece
na imagem.

## As outras duas travas, e por que elas acusavam o certo

- **O objetivo do briefing era literal chumbado** (`"peça de marketing de
  um imóvel"`), e o preâmbulo do engenheiro afirmava "trabalhando para uma
  imobiliária" em TODO pedido. Era isso que fazia um cachorro de Papai Noel
  receber perguntas sobre apartamento. Hoje `imovelCitado` é resolvido
  ANTES das perguntas — é puro, sem LLM — e é ele que decide o domínio.
- **A gramática exigia sujeito da lista `fachada|prédio|sala|piscina…`** e
  uma negação em "restrições". Um pedido legítimo de outro assunto saía com
  duas dicas de erro. Sobraram as duas conferências que melhoram QUALQUER
  imagem: enquadramento e luz. É o mesmo erro assimétrico de
  [[criterios-que-reprovam-o-comportamento-certo]].

## A ressalva legal virou condicional, com TRÊS desfechos

"Imagem gerada por IA, meramente ilustrativa" só é carimbada em peça
vinculada a um empreendimento — num cachorro de Papai Noel ela é ruído, e
[[aviso-por-evolucao-nao-por-mensagem]].

O detalhe que o plano não previa: `carimbada: false` significava duas
coisas opostas — "não se aplica" e "o carimbo falhou". Colapsadas num
booleano, toda imagem livre nasceria com aviso VERMELHO de falha. Viraram
três desfechos tipados (`aplicada` / `nao_se_aplica` / `falhou`), como o
`desfecho` do pareamento e o `MotivoFalhaGemini`.

## O que a revisão perdeu, e está escrito

`problemasDaCopy` (preço, promessa de valorização, superlativo — CDC/CONAR)
só lê texto que o corretor escreveu, não pixels. **Ninguém lê texto dentro
de PNG sem OCR**, então a conferência do que está escrito na peça passou a
ser humana — e a tela diz isso, fixo, em toda proposta.

## Relacionadas

- [[dado-gravado-e-nao-exibido-e-dado-perdido]]
- [[aviso-por-evolucao-nao-por-mensagem]]
- [[o-tradutor-de-prompt-de-imagem]]
- [[a-ressalva-legal-volta-por-codigo]]
