---
title: O tradutor passou a olhar as fotos, e ganhou o ofício
aliases: [visão no llm.ts, leImagem, oficio.ts, skills do prompt de imagem]
tags: [ia, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/llm.ts
  - src/lib/whatsapp/openai.ts
  - src/lib/imagens/oficio.ts
  - src/lib/imagens/tradutor.ts
  - src/lib/imagens/gramatica.ts
created: 2026-09-15
updated: 2026-09-15
fonte: pedido do usuário (15/09/2026), na sequência de [[o-tradutor-era-cego-e-inventava-a-cena]]
summary: Visão entrou por `llm.ts` com `leImagem` por provedor, opcional e default-off, então o atendimento do WhatsApp não muda. O caminho cego virou degradação testada. E o "ofício" — oito regras de craft filtradas por regime — é dado, não parágrafo solto.
---
# O tradutor passou a olhar as fotos, e ganhou o ofício

Sequência direta de [[o-tradutor-era-cego-e-inventava-a-cena]]: lá o
tradutor recebia um booleano e era mandado descrever uma imagem que não
via. Aqui ele passa a ver.

## Por dentro de `llm.ts`, e não por uma porta lateral

A tentação era um `visao.ts` próprio em `src/lib/imagens/` — resolveria o
caso sem encostar no módulo por onde passa o atendimento inteiro do
WhatsApp. Foi recusado pelo motivo que esta base já pagou: `aiParser.ts` e
`campaignQueue.ts` tinham `fetch` próprio e divergiram do resto até serem
migrados. **Duplicar o caminho do motor é como as cópias começam.**

O que torna seguro entrar no caminho único é o desenho, não a coragem:

- `imagens` é **opcional**. Sem ela, o corpo da requisição é byte a byte o
  de antes — há teste afirmando que o conteúdo do usuário continua uma
  `string`.
- `Provedor.leImagem?` é **ausente = não**. Só a OpenAI declara visão hoje.
- Com foto no pedido, quem não declara visão **não é chamado**. Mandar
  imagem para um modelo de texto devolveria HTTP 400, e a cascata seguiria
  adiante achando que ele estava doente — um provedor saudável marcado
  como caído é o tipo de diagnóstico errado que custa sessão aqui.

## A decisão de OLHAR vem antes de escrever o prompt

`algumProvedorLeImagem()` existe por uma razão específica: o prompt
promete uma coisa ou outra ("você está vendo as fotos" × "você NÃO está
vendo"), e prometer errado recria a instrução impossível que causou o
defeito original. Três condições precisam valer juntas — há fotos, temos
as URLs, existe provedor com visão. Qualquer uma faltando, o caminho cego
assume.

**O caminho cego não foi apagado: virou a degradação**, e é exercitado por
teste. Sem `OPENAI_API_KEY` o estúdio continua funcionando, só avisando que
escreveu sem enxergar.

## A tela diz qual dos dois aconteceu

`viuAsFotos` viaja até o balão: *"Olhei as 2 fotos que você anexou…"* ou
*"…mas escrevi sem conseguir vê-las, então confira se bate"*. Esconder a
diferença seria o mesmo pecado que `daIa` já cobre — aprovar no escuro. Os
dois textos têm confiança diferente e o corretor precisa saber qual está
lendo.

## URL pública, e não bytes

As fotos vão como `image_url` apontando para o Storage. Conferido antes,
não suposto: `select public from storage.buckets` devolve `true` para
`empreendimentos`. Sem essa checagem, a visão falharia CALADA — a OpenAI
receberia 403, a chamada erraria, e o sintoma seria "a IA voltou a
inventar".

`detail: "low"` são **85 tokens fixos** por foto, contra ~750-1500 em
`high`. O que o tradutor precisa enxergar é assunto, enquadramento e clima
("é uma torre escura em fundo neutro"), não a marca gravada no vidro. É um
botão com nome, para girar se a saída mostrar leitura errada de detalhe
fino.

E as fotos vão **numeradas e antes do texto** (`Foto 1 de 2:`), na ordem em
que o corretor anexou — a mesma ordem das miniaturas do balão. É ela que
dá sentido a "a 1ª" e "a 2ª" na frase dele.

## O ofício: skills como DADO, filtradas por regime

O pedido foi "que o prompt tenha skills que melhorem a qualidade da
entrega". `oficio.ts` é isso, e o que decidiu o desenho foi onde ele NÃO
cabia:

| módulo | guarda |
|---|---|
| `receitas.ts` | a espinha de CADA trabalho — o corretor escolhe |
| `gramatica.ts` | a FORMA do texto: seções, tamanho, texto literal |
| `oficio.ts` | o que vale para TODA imagem de imóvel |

As oito regras, cada uma apontando um defeito conhecido: verticais
aprumadas (o prédio caindo para trás, assinatura de foto de celular), a
hora que vende (o *dusk shot* com luzes acesas, que é a capa do mercado),
céu sem HDR, escala humana sem rosto, um assunto só, sombra e reflexo
coerentes, respiro para o texto, e o que preservar ao editar.

**Filtradas por regime, de propósito.** Mandar "prefira a hora azul" para
quem está clareando uma foto gasta metade do bloco com instrução que não
se aplica — e `tradutor.ts` registra que prompt gigante DILUI o assunto,
que é o defeito que ele existe para consertar. Criar recebe a hora do dia;
editar recebe o que preservar; as regras de sempre vão nos dois.

### A régua de entrada, e a guarda que a cobra

Cada regra aponta um **defeito** e diz o que fazer no lugar. "Faça uma
imagem de alta qualidade" não muda pixel nenhum — o modelo já está
tentando. `oficio.test.ts` reprova regra vaga e regra longa demais, e
exige que todo item nomeie o que evita.

**E ela pegou uma regra minha na primeira execução, pelo motivo errado:**
o padrão `top\w*` casou em *"nunca convergindo para o TOPO"* — um
substantivo concreto, exatamente o tipo de instrução que o módulo existe
para ter. Reescrita para FRASES ("top de linha", "alta qualidade"). É a
sétima vez que uma guarda desta base tropeça no próprio recorte, e a lição
não muda: **guarda que acusa demais manda consertar o que estava certo.**

## O que continua em aberto

Nada disto foi medido com a API de verdade — não há chave neste ambiente.
O que está provado é a MECÂNICA (as imagens viajam, o prompt certo é
montado, a degradação funciona); o que falta é a medida do DESFECHO, que
só sai de gerar algumas artes reais e olhar. É a distinção que esta base já
registrou no eval: mecanismo funcionando é medida separada de resultado.

## Relacionadas
- [[o-tradutor-era-cego-e-inventava-a-cena]] — o defeito que veio antes
- [[o-contrato-real-do-gpt-image-2]] — `image[]` no gerador, e o texto literal
- [[o-tradutor-de-prompt-de-imagem]] — por que o tradutor existe
- [[MOC — IA e Atendimento]]
