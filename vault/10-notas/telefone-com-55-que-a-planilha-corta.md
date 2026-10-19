---
title: O telefone com 55 que a planilha corta
aliases: [5,51198E+12, notação científica, número cortado, telefone sem os últimos dígitos, importação com 55, 55 como DDD, sem DDD]
tags: [crm, armadilha]
type: armadilha
status: evergreen
custou: medio
codigo:
  - src/lib/inbound/phoneUtils.ts
  - src/lib/leads/importacao.ts
  - src/lib/leads/coladoDaPlanilha.ts
  - src/lib/leads/googlePlanilhas.ts
  - src/app/corretor/(painel)/importar/ImportarClient.tsx
  - src/app/corretor/(painel)/importar/actions.ts
  - src/lib/leads/numeroCortado.test.ts
  - src/lib/leads/coladoDaPlanilha.test.ts
  - src/lib/leads/numeroSemDdd.test.ts
created: 2026-10-09
updated: 2026-10-09
fonte: docs/MEMORIA.md — "O telefone com 55 que a planilha corta (09/10/2026)"
summary: Excel e Google Planilhas mostram número de 12+ dígitos (todo celular com 55) como "5,51198E+12", e é isso que se cola ou exporta; a importação montava "(11) 5511-9812". E célula de 11 dígitos começando com 55 ("+55 98191-8127", sem DDD) virava DDD 55. Agora o cortado vem marcado, o sem DDD vem desmarcado, e o número inteiro é recuperado onde existe.
---

# O telefone com 55 que a planilha corta

Relato de 09/10/2026: "quando importamos uma tabela que tem 55 na frente, o
número de telefone fica errado, sem os últimos dígitos".

## Por que só com 55

- O Excel (formato Geral) e o Google Planilhas (formato Automático) mostram
  número de **12 dígitos ou mais** em notação científica. Celular com 55 tem 13
  dígitos; sem o 55, tem 11 e aparece inteiro. Por isso só a tabela com 55
  quebrava.
- O que se copia, se cola e se exporta em CSV é o que a planilha **mostra**:
  "5,51198E+12" (ou "5.51198E+12"). Os sete últimos dígitos já não estão no
  texto.
- A importação lia os dígitos que sobravam. Medido com o código antigo:

| o que chegava | antes | agora |
|---|---|---|
| `5,51198E+12` | (11) 5511-9812 | linha marcada, telefone em branco |
| `5.5119819181E+12` | (11) 98191-81**12** (o "12" do expoente virava final) | linha marcada |
| `5.511981918127E+12` | linha descartada (15 dígitos) | (11) 98191-8127 |
| `5511981918127.0` | linha descartada | (11) 98191-8127 |

- Nenhum lead gravado tinha o padrão corrompido (consulta de 09/10): o número
  errado aparecia na tela de revisão.

## O que mudou

- `lerNumeroDePlanilha` (`phoneUtils.ts`) separa notação com todos os dígitos
  (vira o número), decimal de programa (vira o número) e notação cortada.
  `normalizarTelefoneBrasileiro` devolve `null` para a cortada, então nenhum
  caminho a transforma em telefone, e `formatarTelefoneBr` a devolve como veio.
- Na importação, a linha cortada vem com o telefone em branco, desmarcada, com
  a etiqueta "número cortado" e um aviso que explica como trazer o número
  inteiro. A deduplicação não a descarta (dez números diferentes aparecem como
  o mesmo "5,51198E+12").
- Lista solta com número cortado não vai à IA: ela tende a "limpar" para
  "55119812", que tem cara de telefone.
- **Colar do Excel ou do Google:** a cópia leva junto uma versão em HTML com o
  valor cru (`x:num` no Excel, `data-sheets-value` no Google, `sdval` no
  LibreOffice). `recuperarNumerosColados` troca a notação pelo número inteiro
  só quando o número de linhas bate, as outras células da linha são iguais e o
  valor arredonda para o que a tela mostrava. O módulo só é baixado quando a
  colagem tem a notação.
- **Link do Google:** com número cortado no CSV, a mesma planilha é baixada em
  `.xlsx` (que guarda o valor cru) e a aba certa é a que tem o mesmo texto nas
  mesmas posições. Sem vencedora clara, segue o CSV com as linhas marcadas.
- O `.xlsx` enviado como arquivo já trazia o número inteiro (`numeroComoTexto`).

## O 55 que virava DDD (mesmo dia)

Depois da primeira correção: "enviar o xlsx, ele coloca o 55 como DDD".

- Com o número inteiro no `.xlsx` (5511981918127, como número, texto, `+55`,
  `p:+55` da Meta) a leitura sempre esteve certa: conferido com 16 formas no
  pipeline real.
- O "(55)" vinha de células de **11 dígitos começando com 55**: o 55 do país
  com um número **sem DDD** (a Meta grava "+55 98191-8127" quando a pessoa
  digita sem DDD) ou um número já **cortado** ("55119819181"). As duas formas
  eram lidas como DDD 55.
- "+55" explícito agora é sempre o país (`numeroSemDddComDdi`): sobra o número
  sem DDD, que segue a regra antiga de quem chega sem DDD (assume 11).
- Numa tabela em que a maioria dos telefones começa com 55 (o 55 é o país),
  o número de 10 ou 11 dígitos começando com 55 vira **"sem DDD"**: aparece só
  o número, desmarcado, com aviso. Fora dessa convenção, "55 98191-8127"
  continua sendo do DDD 55, que existe (Santa Maria, RS).
- **Telefone sem forma de telefone daqui deixa de virar telefone**
  (`assinanteValido`): celular tem 9 dígitos e começa com 9, fixo tem 8 e
  começa de 2 a 9, DDD não tem zero. É isso que pega o cortado: lido como DDD
  55, "55119819181" daria um celular começando com 1. De quebra, o americano
  de 11 dígitos ("1 415 555 2671") deixou de virar "(14) …".
- O zero de discagem a distância ("011 98191-8127", "+55 011 …") sai.

## Para diagnosticar

Telefone de 8 dígitos começando com 5511 depois do DDD, ou terminando em "12"
numa importação de planilha, é sinal desta armadilha. No banco:
`telefone_e164 ~ '^551155[0-9]{4}12$'`.

## Em aberto

- O formato do HTML da área de transferência foi conferido em documentação,
  não num Excel ou Google de verdade. Se a recuperação não acontecer, a linha
  vem marcada e o aviso explica o caminho do `.xlsx`.
- Não conferimos se o CSV do Google sai mesmo com a notação; o caminho do
  `.xlsx` só roda quando sai.

## Relacionadas
- [[importacao-de-leads-le-os-formatos-que-o-corretor-tem]]
- [[lista-de-leads-sem-cabecalho-e-lida-pela-ia]]
- [[MOC — CRM e Painel]]
