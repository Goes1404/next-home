# Estúdio de imagem livre — o pedido do corretor manda, não a receita

> Decisão de produto de 11/09/2026. O pedido veio assim: *"quero que
> funcione exatamente como o ChatGPT — se eu pedir para criar uma foto de
> um cachorro do Papai Noel, ele cria. Precisamos apenas melhorar o prompt
> do corretor, não deixarmos um prompt definido para o GPT."*

## O problema, medido no código

O Estúdio não produzia peça publicitária, e o motivo não era o modelo — é
o mesmo `gpt-image-2` que o ChatGPT usa. Eram três travas nossas:

1. **`SEM_TEXTO_ALGUM`** (`gerarImagem.ts:68`) entra em TODA geração que
   não dita o texto: *"sem texto, letras, números, placas, letreiros,
   logotipos, marcas, selos de preço"*. As peças que o corretor usa como
   referência (anúncio do Manacá Barueri: manchete, metragem, voucher,
   logo) são majoritariamente texto. **Elas eram impossíveis por
   construção.**
2. **`objetivo: "peça de marketing de um imóvel"`** está chumbado em
   `turno.ts:181`. Todo briefing, para qualquer assunto, é conduzido como
   se fosse anúncio de apartamento.
3. **`gramatica.ts`** exige que o prompt contenha sujeito da lista
   `fachada|prédio|torre|sala|piscina|…`. Um pedido legítimo fora de
   imóveis é reportado como incompleto.

E a trava nº 1 é pior do que parece: **`textoNaCena` — a única fresta que
permitia texto na imagem — NÃO TEM UM ÚNICO CHAMADOR.** Nenhum `.tsx`,
nenhuma rota, nenhum módulo o preenche (conferido por `grep`: só a
definição e o uso interno). Ou seja, **100% das gerações de hoje carregam
a cláusula anti-texto**. A fresta foi escrita, testada, documentada — e
nunca ligada. É o décimo caso deste padrão nesta base, e aqui ele explica
a queixa inteira.

O que NÃO era problema, e por isso não entra no escopo: `tradutor.ts`
(10/09) já reescreve o pedido do corretor antes de enviar — a metade
"melhorar o prompt" já existe e funciona. A receita `"livre"` (espinha
vazia) também já existe e já é o fallback de `receitaDoTexto`.

## As duas decisões do dono do produto

**Texto na imagem: livre total.** A IA pode escrever texto, logo e selo.
O custo foi apresentado e aceito: ela vai inventar nome de
empreendimento, metragem e preço quando achar que a peça pede — foi
exatamente isso que desenhou a placa `"VISTA ALTO"` numa fachada que
ninguém batizou, em 03/09/2026. **Quem publicar responde pelo que está
escrito na peça.**

**Caminho B: livre por padrão, dados do imóvel como opção.** Sem imóvel
citado, nada do catálogo é injetado. Citando ("Manacá", "Eternity"),
`imovelPorTexto` casa por nome e apelido e os fatos reais entram no
prompt. É a única coisa que o ChatGPT não tem — ele inventa "3
dormitórios" num imóvel que tem 2; nós temos a ficha.

## O que muda

### 1. `src/lib/imagens/gerarImagem.ts` — a cláusula deixa de ser padrão

`promptFinal(pedido, textoNaCena)` hoje tem dois ramos e o ramo padrão é
proibir. Passa a ser:

- **com `textoNaCena`**: mantém `soOTextoPedido` — aspas, soletração letra
  a letra e posição. É a técnica que mediu **2 em 2** na F0 de 10/09,
  contra a linha de base de 3 em 4 sem ela. Continua valendo para quando o
  corretor DITA a manchete.
- **sem `textoNaCena`**: nada é acrescentado. O modelo decide, como no
  ChatGPT.

A função continua sendo o ponto único por onde os dois caminhos passam
(JSON e multipart) — chamador novo não pode escapar dela.

### 2. `src/lib/imagens/receitas.test.ts` — a guarda é REESCRITA

Ela hoje lê o código-fonte e exige a cláusula nos dois caminhos. Some
junto com a decisão que ela protegia, e aí ninguém descobre que houve uma
decisão. Passa a afirmar a regra nova: **nenhum caminho manda
`pedido.prompt` cru** — os dois continuam obrigados a passar por
`promptFinal`. O comentário registra o que mudou, quando e por quê (mesmo
tratamento do `schedule` do worker de vídeo).

### 3. `src/lib/estudio/turno.ts` — o objetivo deixa de ser chumbado

`perguntarOQueFalta({ objetivo })` passa a receber:

- `"peça de marketing de um imóvel"` quando `imovelCitado` existe;
- `"imagem livre"` quando não existe.

Nada mais muda no turno: `receitaDoTexto` já cai em `"livre"`,
`imovelPorTexto` e `fatosDoImovelCitado` já são o caminho B.

### 3b. `textoNaCena` ganha um chamador

Sem chamador, a técnica de soletração (a que mediu 2/2) nunca roda — e ela
é justamente o que faz a manchete sair com as PALAVRAS certas em vez de
letras embaralhadas. O Estúdio passa a extrair do pedido o texto entre
aspas e mandá-lo como `textoNaCena`:

> `fachada ao pôr do sol com a manchete "MUDE AINDA ESTE ANO"` → cena
> livre + soletração exata da manchete.

Sem aspas no pedido, `textoNaCena` segue vazio e o modelo escreve o que
quiser (que é o comportamento "como o ChatGPT" pedido). Com aspas, ele
escreve exatamente aquilo. O corretor não precisa saber da regra para a
ferramenta funcionar, e ganha precisão quando souber.

### 4. `src/lib/imagens/gramatica.ts` — conferência genérica, nunca bloqueio

As `MARCAS` de `sujeito` saem da lista de imóveis. A conferência passa a
perguntar o que vale para qualquer imagem: há enquadramento? há luz? há um
sujeito descrito? O resultado continua sendo **dica na tela**, nunca
recusa — o erro assimétrico já registrado nesta base (cinco critérios que
reprovaram o comportamento certo) manda errar para o lado de acusar de
menos.

`PISO_DE_PROMPT` (80) continua valendo sobre o prompt FINAL, depois do
tradutor — nunca sobre o que o corretor digitou. "Um cachorro de Papai
Noel" tem 24 caracteres e é um pedido legítimo; o que precisa ter corpo é
o texto que chega ao provedor.

### 5. Carimbo condicional

`carimbarRessalva` passa a ser aplicado **quando a peça está vinculada a
um empreendimento** (`imovelSlug` presente na proposta / `empreendimento_id`
na linha da galeria). Sem vínculo, não carimba.

A ressalva continua sendo escrita por CÓDIGO e nunca pedida ao modelo:
três em quatro é ótimo para uma manchete e inaceitável para um aviso
legal. E continua falhando aberto — a imagem já foi paga quando o carimbo
roda, então falha de carimbo degrada com `carimbada: false` e a tela
avisa.

## O que NÃO muda, e por quê

- **`marketing.ts` fica inteiro.** É compartilhado com o motor de VÍDEO
  (`render.ts`, `roteiro.ts`, `video/acoes.ts`). Apagá-lo derrubaria o
  vídeo junto — a pedra já registrada em 10/09.
- **Teto de 20 imagens/dia por corretor, `low` como padrão, 45s de teto.**
  São custo real (R$ 0,027 em Rápida, R$ 0,21 em Boa) e o limite de 60s do
  plano Hobby. Não são trilho criativo.
- **`receitas.ts` continua existindo** como atalho opcional para quem
  quiser ("mobiliar ambiente vazio" resolve um trabalho real e específico).
  O que muda é que ela não é mais o caminho obrigatório.

## Riscos aceitos, escritos para não serem esquecidos

1. **A IA vai inventar texto factual** — nome de empreendimento, metragem,
   preço, prazo de entrega. Com vínculo a imóvel, os fatos do catálogo
   reduzem isso; sem vínculo, não há o que conferir contra.
2. **A conferência de lei sai do código.** `problemasDaCopy` (preço,
   promessa de valorização, superlativo sem prova — CDC/CONAR) só sabe ler
   texto que o corretor escreveu, não pixels. Ninguém lê texto dentro de
   PNG sem OCR. **A revisão antes de publicar passa a ser humana**, e a
   tela precisa dizer isso em uma linha.
3. **Impersonação continua proibida** e isso não é negociável pelo
   produto: peça que imite marca, pessoa ou documento de terceiro não sai.
   Nada no código de hoje endereça isso — fica registrado como limite de
   uso, não como guarda implementada.

## Testes e guardas

- `receitas.test.ts` reescrita (regra nova, com o motivo), provocada com
  dente antes de entrar.
- Caso ponta a ponta com `"um cachorro vestido de Papai Noel"`: não casa
  imóvel, não é reprovado pela gramática, o prompt final sai **sem** a
  cláusula anti-texto e a peça sai **sem** carimbo.
- Caso com imóvel citado: fatos do catálogo entram, carimbo sai.
- Caso com texto entre aspas no pedido: vira `textoNaCena`, e a instrução
  de soletração chega ao provedor (é a que mediu 2/2). Hoje este caso é
  inalcançável — o campo não tem chamador.

## Fora de escopo

- Reescrever `ChatDeArte.tsx` além do aviso de revisão humana.
- Mexer no motor de vídeo.
- OCR ou qualquer conferência automática do texto desenhado na imagem.
- Voltar a produzir arte composta por código (logo + copy + rodapé): o
  caminho foi apagado em 10/09 e nunca entregou uma peça.
