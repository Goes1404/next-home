---
title: As duas seções novas da home — quando morar e quanto cabe
aliases: [escolha-de-estagio, cabe-no-bolso, estagioDeCompra]
tags: [front-publico, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/estagioDeCompra.ts, src/components/home/EscolhaDeEstagio.tsx, src/components/home/CabeNoBolso.tsx]
created: 2026-09-11
updated: 2026-09-11
fonte: pedido do dono em 11/09/2026, depois de remover a faixa de números e os "três passos"
summary: A home tinha UM eixo de navegação (o lugar). Ganhou os outros dois que decidem uma compra — o prazo ("quando você quer morar?", duas portas com a contagem real) e o dinheiro ("cabe no seu bolso?", a mesma conta do corretor respondendo quantos imóveis fecham). Nenhum número é inventado: os dois saem do catálogo publicado.
---
# As duas portas da home

Saíram da home a faixa de números e a seção de "três passos"; no lugar
entraram duas seções escolhidas MEDINDO o catálogo antes de desenhar
qualquer coisa — a régua da casa é não prometer o que o cadastro não
sustenta.

## 1. "Quando você quer morar?" — dois grupos, duas contagens

A home só oferecia o eixo do LUGAR (as regiões). A primeira pergunta de
quem compra é o prazo, e as duas respostas são pessoas diferentes com
dinheiro diferente na mão.

O agrupamento está em [[estagio-de-compra-e-o-que-o-cadastro-diz]] —
`pronto_para_morar` de um lado, os outros cinco do outro. Medido no dia:
**9 prontos, 16 em obra**, os dois lados cheios.

Detalhes que importam: lado vazio não vira porta (porta para sala vazia é
o defeito que os chips de região já tiveram); a cor é a do selo de estágio
(`statusCor.ts`), então a seção não inventa paleta; e a contagem sai do
catálogo já carregado, sem consulta nova.

## 2. "Cabe no seu bolso?" — o eixo do dinheiro

A home não tinha **nenhuma** entrada por preço, que é o filtro que de fato
decide. O select "até R$ X" da busca não serve: ele pede justamente a
resposta que a pessoa veio procurar.

Dois campos (renda e entrada) e a resposta em número de imóveis: *"6
imóveis cabem, de 21 com preço publicado"*. A conta é `simularFinanciamento`
— o mesmo módulo puro do consultor do painel e da página `/financiamento` —
rodando uma vez por imóvel. Regra de três sobre a parcela ignoraria
subsídio, ITBI e teto de FGTS, e daria um número que o corretor
desmentiria na primeira conversa.

Roda no navegador; nada é enviado. O denominador é honesto: só os imóveis
com preço publicado entram, e a frase diz quantos ficaram sob consulta.

## Duas coisas que a construção ensinou

- **O link só vale com o filtro atrás dele.** A listagem não tinha filtro
  de estágio: sem levá-lo pela pilha (tipo, `bate()`, `parseFiltros`, chip
  de filtro ativo e select do formulário), as portas seriam decoração. Este
  projeto já cometeu esse erro duas vezes (`?filtro=parados` e
  `?campanha=`). Conferido no ar: 25 / 9 / 16, e valor inválido devolve a
  lista inteira.
- **Placeholder que parece valor é pior que campo vazio.** A primeira
  versão do simulador trazia "50.000" como placeholder, com o "R$"
  desenhado à esquerda do campo — indistinguível de um valor preenchido, e
  a pessoa leria uma entrada que ela não tem. O exemplo foi para a linha de
  ajuda, e o que se digita passa a ser formatado ("80.000"). É a mesma
  lição de [[placeholder-de-uma-linha-cabe-em-320px]], agora do lado do
  site público.
