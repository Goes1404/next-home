---
title: A importação de leads lê os formatos que o corretor tem na mão
aliases: [importar xlsx, importar vcf, importar print, formatos da importação]
tags: [crm, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/leads/importacao.ts
  - src/lib/leads/xlsxLeitura.ts
  - src/lib/leads/vcard.ts
  - src/app/corretor/(painel)/importar/actions.ts
  - src/app/corretor/(painel)/importar/ImportarClient.tsx
created: 2026-09-24
updated: 2026-09-24
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

## Relacionadas
- [[importar-conversa-do-whatsapp]]
- [[falha-calada-e-a-pior]]
