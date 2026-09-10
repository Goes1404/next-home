# Geração de imagem — o tradutor de prompt no meio do caminho

> Data: 2026-09-10 · Status: aguardando revisão do usuário

## O problema, medido

Relatado como "nossa IA de geração de imagem não está funcionando bem, está
muito ruim e longe do que eu quero". Está. Em `imagens_geradas`, vida inteira:

| fato | número |
|---|---|
| imagens geradas | **8**, 1 corretor, 7 dias |
| artes compostas (`arte_url`) | **0** |
| com imóvel do catálogo (`empreendimento_id`) | **0** |
| com briefing de marketing | 1 |

Quatro defeitos que os dados mostram sozinhos:

1. **O caminho de marketing nunca rodou.** `marketing.ts` +
   `diretorCriativo.ts` + `compor.ts` (~900 linhas: objetivo, canal, público,
   copy validada por lei, logo, rodapé) produziram **zero** peças. É o oitavo
   caso do padrão "construído e nunca ligado" desta base.
2. **Dado vazio vazou para prompt pago.** A geração de 09/09 foi
   `Apartamento chamado "." em ., Barueri no estágio "Lançamento"` — nome e
   bairro do imóvel entraram como ponto final. O pedido inteiro do corretor
   era a palavra `Torre.`
3. **O corretor pede peça e recebe render.** Ele digitou *"transforme essa
   foto em uma publicação bem chamativa para o Instagram, relatando que é a
   torre mais alta de Barueri e chamando para a visita"* — foi cru para o
   modelo de imagem, que devolveu uma foto de prédio sem uma letra.
4. **3 de 8 prompts saíram em INGLÊS**, contra a decisão já registrada na
   `MEMORIA.md` ("tudo em português, inclusive a espinha — prompt que ele não
   lê é prompt que ele não conserta").

### E a causa raiz do engenheiro de prompt

O módulo que deveria consertar isso existe e não funciona, por quatro motivos
somados:

- **`engenheiroDePrompt.ts` devolve `promptEn` (o que é enviado) e
  `explicacaoPt` (uma paráfrase que o corretor lê).**
- **A intenção estava certa e a execução falhou nas duas pontas.** O prompt
  final *é* mostrado na tela — o comentário do `ChatDeArte.tsx` diz "esconder
  do corretor seria tirar dele a chance de corrigir". Só que ele aparece **em
  inglês**, dentro de um `<p>` que **não é editável**. Dar a chance de
  corrigir num idioma que ele não escreve, num elemento onde não se digita, é
  o mesmo que não dar.
- **`/api/imagens/melhorar` não tem chamador nenhum na UI.** O módulo
  `melhorarPedido.ts` existe, é testado, e nenhum `.tsx` o chama. Nono caso de
  "construído e nunca ligado".
- **Reserva silenciosa:** quando o motor de texto falha, `promptEn: ideia` —
  o texto cru vira "prompt final" com etiqueta de melhorado. Foi assim que
  `Torre.` chegou ao provedor.

## A virada

A hipótese do usuário está tecnicamente correta: o ChatGPT gera imagem com o
**mesmo modelo** que já usamos (`gpt-image-2`). A diferença de resultado não é
o modelo — é que ele reescreve o pedido antes de mandar para o gerador. Nós
mandamos cru.

Então o produto vira **chat livre → tradutor reescreve → o corretor lê e edita
em português → gera**. Sem templates, sem layout pré-definido, sem briefing.

## Decisões tomadas no brainstorming

| Pergunta | Decisão |
|---|---|
| O que sai do outro lado | Peça pronta para postar, **e** edição de foto real. Vídeo/carrossel vira spec separada. |
| Templates de layout | **Não.** Chat livre, como o ChatGPT. |
| Onde entra o tradutor | **Toda imagem paga passa por ele.** Sem exceção. |
| Língua do prompt | **Português, e é ele que vai.** Nada acontece entre o que o corretor aprova e o que é enviado. |
| Catálogo | Sim: fatos **e** as fotos reais do imóvel como referência. |
| Carimbo de logo/telefone/ressalva | Botão **opcional** no fim, por código. Sem layout. |
| Trocar a foto de referência | Faixa com as fotos do imóvel, trocável a qualquer momento. |
| "Saída esperada" | Segundo anexo, papel de **estilo**, com o papel dito no prompt. |
| O prompt depois de gerar | **Fica visível no histórico, com botão de reaproveitar.** |

## O prompt é ativo, não registro

`imagens_geradas.prompt` é gravado desde sempre e **nenhuma tela o mostra**: o
histórico são 8 miniaturas com `alt=""`. Décimo caso do padrão que esta base
já registrou nove vezes — dado guardado e não exibido é indistinguível de dado
perdido.

Com o tradutor, esse campo deixa de ser log e vira o ativo mais valioso da
tela: é a receita que funcionou. O histórico passa a mostrar o prompt de cada
arte com **"gerar outra assim"**, que reabre o turno com aquele texto já no
campo editável — "igual, mas de noite" custa uma edição, não uma conversa
inteira do zero.

Duas consequências de desenho:

- **O que se guarda é o prompt APROVADO, não o que a LLM propôs.** Se o
  corretor editou, o que gerou a imagem foi a versão dele — e é essa que ele
  vai querer de volta.
- **Reaproveitar não regenera sozinho.** Cai no mesmo portão de sempre: texto
  no campo, ele lê, ajusta, aprova. Um botão que gera direto do histórico
  seria a única porta do sistema que pula a revisão.

## O que a API de fato aceita (sondado, custo zero)

Sondas com `size` inválido e com sentinela `quality` inválida — não geram
imagem e não custam nada:

| sonda | resultado |
|---|---|
| `image[]` com múltiplas imagens | **aceito** (o erro veio do `size`, não do `image`) |
| `input_fidelity=high` | **rejeitado por nome:** "o modelo 'gpt-image-2' não suporta" |
| `quality` | `low` · `medium` · `high` · `auto` |

E da documentação oficial de *image prompting*:

- **Estrutura recomendada: seções rotuladas — CENA · SUJEITO · DETALHES ·
  RESTRIÇÕES.**
- **Texto entre aspas**, com posição e tipografia, e nomes **soletrados letra
  a letra**. É a técnica documentada para subir nossa taxa de acerto literal,
  medida nesta base em **3 de 4**.
- **Style transfer: identificar cada entrada por número e propósito**
  ("entrada 1: sujeito, entrada 2: estilo") e dizer como combinam.
- **Máximo 4 imagens** de referência, e elas guiam como *referência*, não como
  template. **Copiar o layout de uma peça não é garantido**; o que transfere
  bem é paleta, clima e tipo de composição.
- **Para região que precisa ser pixel-idêntica, compor por cima da imagem** —
  não confiar no prompt. É a justificativa oficial do carimbo por código.
- **Prompt complexo pode levar até 2 minutos.** A função da Vercel morre em
  60s e o teto interno hoje é 45s. **Este é o risco número 1 desta spec.**

### O que `input_fidelity` não existir significa para a tela

A foto real é **reinterpretada**, nunca preservada pixel a pixel. A tela precisa
dizer isso. Prometer "a mesma foto, só melhor" seria mentir, e o corretor
descobriria na frente do cliente.

## Arquitetura

### Morre (~1.400 linhas que nunca produziram uma peça)

`compor.ts`, `marketing.ts`, `diretorCriativo.ts`, `/api/imagens/briefing`, e
o campo `promptEn` de toda a pilha (`engenheiroDePrompt.ts`,
`estudio/contrato.ts`, `estudio/turno.ts`).

### Nasce — `src/lib/imagens/`

| módulo | LLM? | papel |
|---|---|---|
| `gramatica.ts` | não | As boas práticas como **dado**: as quatro seções, os atributos de cada uma, os negativos. Alimenta o tradutor e depois **confere** o que ele devolveu. |
| `catalogoNoPrompt.ts` | não | Imóvel → fatos seguros. **Campo vazio não entra.** Conserto direto do `"." em ., Barueri`. |
| `tradutor.ts` | 1 chamada | Funde `engenheiroDePrompt` + `melhorarPedido`. Devolve o prompt em português, o que acrescentou, e o que não cobriu. |
| `carimbo.ts` | não | Logo, WhatsApp e ressalva por código, sob demanda. ~60 linhas no lugar das 193 do `compor.ts`. |

### Fica

`gerarImagem.ts` passa a ser o **centro**, não o papel menor: é ele que gera a
imagem do zero, edita a foto real e recebe as duas referências. O que muda é
que ele nunca mais recebe texto que o corretor não leu. Continuam também
`receitas.ts` (ambientar decorado, melhorar luz), `galeria.ts` (teto diário,
histórico) e o chat do Estúdio, com contrato novo.

### Onde a tela vive

A rota atual `/corretor/imoveis/criar-imagem` é **reaproveitada**, não
duplicada — nenhum link salvo quebra e o menu continua acendendo Marketing
pelo `MODULO_POR_SUBITEM` que já existe. O que muda é o conteúdo do turno, não
o endereço.

## O turno, ponta a ponta

1. O corretor escreve, com até dois anexos.
2. **Sem LLM:** detecta imóvel citado por nome ou apelido (`imovelPorTexto` já
   existe e já entende "Manacá" para *More na Aldeia de Barueri*).
3. **Sem LLM:** monta os fatos e separa as fotos do imóvel como referência
   candidata.
4. **Tradutor** — uma chamada, ~3s, ~R$ 0,002.
5. **Sem LLM:** a gramática confere e marca o que ficou de fora.
6. A tela mostra o **prompt em português num campo editável**, o que foi
   acrescentado (aceitar ou apagar), a foto de referência escolhida, formato e
   qualidade.
7. Aprovação → gera. **Só aqui gasta imagem.**
8. Ajuste ("mais claro", "tira a piscina") reescreve a partir do prompt
   **anterior**, nunca do zero, e é grátis até mandar gerar de novo.

Hoje o corretor paga R$ 0,027 e 17s para descobrir que o pedido estava pobre.
Aqui ele itera no texto por R$ 0,002 e 3s.

## As duas imagens e seus papéis

| entrada | papel | o que a IA tira dela |
|---|---|---|
| 1 — **base** | sujeito | o imóvel: o que aparece |
| 2 — **modelo** | estilo | paleta, clima, enquadramento, densidade de texto |

O papel de cada uma vai **escrito no prompt**, na forma documentada
("entrada 1: … / entrada 2: …"). E o tradutor lê a peça-modelo **com visão** e
escreve em português o que extraiu — o corretor lê e corrige **antes** de
gastar. É a diferença entre "copiei o estilo" e "achei que tinha copiado".

## Guardas

- **Piso de prompt:** abaixo do piso não gera sem confirmação explícita. Mata
  o `Torre.`
- **Campo vazio nunca entra no prompt.** Testável sem rede, porque
  `catalogoNoPrompt` é puro.
- **Falha do tradutor é dita em voz alta.** A tela informa que **não**
  conseguiu melhorar e pede confirmação — em vez de mandar o texto cru
  fingindo que melhorou, que é o comportamento de hoje.
- **A cláusula anti-letreiro continua em `gerarImagem.ts`**, ponto único por
  onde os dois caminhos passam. Chamador novo não tem como esquecer.
- **Teto diário de 20 por corretor** continua. O tradutor **não** consome esse
  teto: ele custa R$ 0,002 contra R$ 0,027 da imagem, e cobrá-lo do mesmo balde
  faria o corretor economizar justamente o passo que melhora o resultado.

## Fase F0 — medir antes de construir o resto

Seis gerações reais, ~R$ 0,20 no total, respondendo três perguntas que decidem
a arquitetura:

1. **Latência com 1 e com 2 referências**, em `low` e `medium`. Se passar dos
   45s, o caminho com duas imagens vai para a fila do worker que já existe para
   vídeo — porque estourar o timeout significa **matar a função com a imagem já
   paga**.
2. **Quanto do estilo de fato transfere** de uma peça-modelo real (as artes do
   Manacá e do Acqua Park que o usuário mandou).
3. **A taxa de acerto do texto literal** com a técnica documentada (aspas +
   soletrar), contra a linha de base de 3 em 4.

Medir antes de construir é a régua desta base — e é o que teria evitado as
~1.400 linhas que nunca produziram uma peça.

## Como saber se o tradutor melhora

Sem isto, volta-se a trocar prompt por opinião — o erro que esta base já
cometeu quatro vezes seguidas com o prompt da Sofia.

Prompt cru × prompt traduzido, mesmo pedido, comparados por um juiz com rubrica
calibrada contra notas humanas. Valem as réguas já registradas: **uma rodada
não separa regressão de variância**, e o juiz não pode rodar no mesmo modelo do
tradutor.

## Fora de escopo

- **Vídeo e carrossel** — spec própria, motor já existe (FFmpeg no worker,
  ~R$ 0,002 por vídeo).
- **Templates de layout** — descartados por decisão do usuário.
- **Logo e paleta por empreendimento** — não existem no banco e a peça não
  depende mais deles.

## Riscos

| risco | mitigação |
|---|---|
| Prompt de 2 min contra função de 60s | F0 mede; se estourar, vai para o worker |
| Texto na arte errado (3 em 4) | Aspas + soletrar (F0 mede); carimbo por código para telefone e ressalva |
| Estilo não transfere como o corretor espera | F0 mede com as peças reais; a tela não promete cópia de layout |
| Crédito da OpenAI acabar no meio | Já aconteceu em 02/09. A conta é a mesma do atendimento da Sofia — sem crédito, ela cai junto |
