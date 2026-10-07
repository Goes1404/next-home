---
title: A importação de leads lê os formatos que o corretor tem na mão
aliases: [importar xlsx, importar vcf, importar print, formatos da importação]
tags: [crm, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/leads/googlePlanilhas.ts
  - src/lib/leads/importacao.ts
  - src/lib/leads/xlsxLeitura.ts
  - src/lib/leads/vcard.ts
  - src/app/corretor/(painel)/importar/actions.ts
  - src/app/corretor/(painel)/importar/ImportarClient.tsx
created: 2026-09-24
updated: 2026-10-06
fonte: pedido do usuário em 24/09/2026 ("adicionar leads de mais tipos de arquivo")
summary: Além de PDF, CSV e o .zip do WhatsApp, a importação passou a ler o .txt solto da conversa (Android), .vcf, .xlsx sem dependência nova, foto/print por IA, e o CSV do Google Contatos — que antes saía vazio, calado.
---
# A importação lê os formatos que o corretor tem na mão

Formatos aceitos desde 24/09/2026: conversa do WhatsApp (`.zip` **e**
`.txt`), `.vcf`, Excel `.xlsx`, CSV/TSV, PDF e foto ou print.

## O que custava tempo descobrir

- **O `.txt` solto da conversa caía no leitor de TABELA.** O Android exporta
  sem mídia como `.txt`, não `.zip`; o iPhone sempre como `.zip`. Só o
  `.zip` passava por `ehExportDeConversa`. Hoje a checagem mora em
  `extrairDeTexto` — vale para arquivo `.txt`, para conversa COLADA na caixa
  e para o texto de dentro do `.zip`, com o mesmo `dono` (a fala do corretor
  nunca vira lead).
- **O CSV do Google Contatos saía com ZERO leads, calado.** A coluna
  `Phone 1 - Label` ("Mobile") vem antes de `Phone 1 - Value` e casava como
  telefone; e o split por vírgula quebrava `"Prado, Ana"` em duas células,
  deslocando tudo. Hoje: coluna de rótulo (`label|type|tipo|rotulo`) é
  ignorada, CSV com cabeçalho usa leitor com aspas (inclusive campo que
  atravessa linhas), `:::` separa vários números numa célula, sobrenome é
  juntado ao nome, e a coluna de celular vence a de fixo.
- **`.xlsx` é um ZIP com XML** — `lerZip`, que já existia para o WhatsApp,
  lê o workbook sem biblioteca nova. Três armadilhas com teste: telefone
  guardado como NÚMERO em notação científica (`5.5119…E+12`); `<row r="3"/>`
  fechado, que uma regex ingênua faria engolir a linha seguinte; e célula
  vazia no meio, que desloca colunas se o índice não vier do `r="C5"`.
  Prefixo de namespace (`<x:row>`) é tirado antes. Tenta as abas em ordem e
  usa a primeira com contatos (a primeira costuma ser resumo). `.xls` antigo
  continua recusado, com a frase do que fazer.
- **`.vcf`**: o `waid=` do TEL é o número do WhatsApp em dígitos puros e
  vence o valor formatado; vCard 2.1 do Android vem em QUOTED-PRINTABLE com
  linha continuada por `=`; 3.0 dobra linha com espaço. Celular vence fixo.
  DDI estrangeiro não ganha `55` (mesma armadilha de [[importar-conversa-do-whatsapp]]).
- **Foto/print** vai ao Gemini (o mesmo da importação de PDF escaneado).
  Sem chave, a tela diz que a leitura de foto depende de IA — não
  "nenhum contato encontrado", que mandaria procurar defeito na foto.

## Tirar coluna e telefone escrito certo (03/10/2026)

- **A revisão mostra as colunas que vão para o CRM** (Nome, Telefone,
  E-mail, Observação, Imóvel de interesse), com quantos contatos têm cada
  uma, e um toque tira a coluna da importação inteira. Só o telefone não
  sai. Observação e imóvel entravam no banco SEM aparecer na revisão; agora
  aparecem em cada linha e podem ser editados ou tirados.
- **O telefone entra escrito "(11) 98191-8127"** (`formatarTelefoneBr`): na
  revisão, ao sair do campo e de novo ao gravar. Antes ia como vinha da
  planilha ("+55 11 98191-8127", "11981918127"). A chave de busca
  (`telefone_e164`) já saía certa; o que mudou é o que se lê.
- **Número com "+" e DDI diferente de 55 fica como está**: "+1 415 555 2671"
  tem onze dígitos, igual a um celular daqui, e viraria "(14) 15555-2671".

## Relacionadas
- [[importar-conversa-do-whatsapp]]
- [[falha-calada-e-a-pior]]

## Google Planilhas (06/10/2026)

- **Colar o link da planilha** na caixa de texto importa a aba do link
  (`googlePlanilhas.ts`: exportação CSV com o `gid`, baixada por
  `buscarSeguro`). Antes o link virava "lista solta" sem telefone. Planilha
  privada redireciona para o login do Google e a tela pede para compartilhar
  como "qualquer pessoa com o link".
- **Cabeçalho procurado nas 10 primeiras linhas**: planilha feita à mão abre
  com título e linha em branco. O separador sai da primeira linha que tem
  separador, senão o título fazia um CSV com vírgula ser lido por tabulação.
- **Título exato ganha do que só contém a palavra**: na planilha de leads da
  Meta, "ad_name" vinha antes de "full_name" e virava o nome do cliente.
  `_` conta como espaço ("phone_number").

## Foto ou print ganhou aba própria e passou a ser lida pela OpenAI (07/10/2026)

- A leitura de foto existia desde 24/09, mas **só pelo Gemini** (cota
  gratuita de 20 chamadas por dia, por modelo) e escondida como último item
  da aba "Enviar arquivo". Agora vai primeiro ao motor do atendimento
  (`chamarLlmJson`, OpenAI) com `detalheImagem: "high"`: em `low` a foto é
  reduzida a 512px e telefone escrito à mão vira palpite. O Gemini ficou de
  reserva, e é o único que tenta HEIC (o `sharp` não abre).
- A foto é normalizada pelo `sharp` antes (gira pelo EXIF, 2048px, JPEG) e
  vai como data URL.
- Aba **Foto ou print** com "Escolher foto ou print" e "Tirar foto agora"
  (`capture="environment"`); a leitura começa ao escolher.
- `detalheImagem` atravessa `llm.ts` → `openai.ts`; o padrão continua `low`
  (o tradutor de imagem não muda).
- **Várias fotos de uma vez** (07/10, mesmo dia): até 10, lidas uma chamada
  por foto (juntas passariam dos 12 MB da Server Action), com o mesmo
  telefone em dois prints entrando uma vez só. Foto sem telefone legível vira
  aviso com o nome do arquivo.
