---
title: Lista de transmissão pelo número central (onda 3, frente L)
aliases: [montar_lista, acompanhar_lista, listaPeloCentral, lista pelo central]
tags: [campanhas, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/tratadores/listas.ts
  - src/lib/central/tratadores/listas.test.ts
  - src/lib/whatsapp/listaPeloCentral.ts
  - src/lib/whatsapp/listaPeloCentral.test.ts
  - src/app/corretor/(painel)/campanhas/acoes.ts
  - src/lib/whatsapp/primeiroContatoNoEnvio.ts
created: 2026-10-30
updated: 2026-10-30
fonte: construção da onda 3 do CRM pelo WhatsApp, 30/10/2026
summary: "Manda o Vitta pra quem quer Barueri até 600 mil" vira proposta com quantas pessoas, quantas nunca falaram e quantas cabem hoje (as contas da tela e do disparador); o "sim" só põe a lista na fila da tela, pelo número de QUEM PEDIU (o gestor também), e o disparador manda com todas as travas. Desfazer cancela se nada saiu; se já saiu, só pausa. Acompanhar = números, pausar e retomar com "sim". Pronto, desligado até ONDA_ATUAL = 3.
---
# Lista de transmissão pelo número central

Parte da onda 3 de [[crm-pelo-whatsapp-numero-central-com-ia]]. Desligado até
`ONDA_ATUAL` chegar a 3 (até lá, "ainda não sei").

## O central não envia: enfileira

O "sim" grava `whatsapp_campanhas` + `whatsapp_campanhas_fila` e acende a
corrente, como a tela. Quem manda é o disparador de sempre, item a item, com
todas as travas ([[fluxo-de-campanhas]]): janela e expediente, pausa
automática, pedido de parada, mesmo telefone uma vez só, conversa nas
últimas 24 h, [[primeiro-contato-tem-teto-proprio]], texto conferido
([[texto-da-lista-conferido-antes-de-sair]]) e cota. Um segundo caminho de
envio seria um segundo lugar para esquecer uma delas.

## Por que um domínio novo, e não `criarCampanha`

`campanhas/acoes.ts` depende da sessão do navegador (`getCorretorLogado`,
`createClient`) e tem meia dúzia de guardas que leem o código dele
(`protecaoDaLista`, `textoConferidoNoEnvio`, `sessaoCaida`, `contextoDaCampanha`).
Refatorar quebraria as guardas; por isso `whatsapp/listaPeloCentral.ts`
**repete o `criarCampanha` passo a passo** com as mesmas peças
(`leadsDoCorretor`, `elegivel`, `idsProtegidosDeNovaLista`,
`conferirNumerosNoWhatsapp`, `conferirLimite`, `contextoDaLista`,
`variaveisSemValor`, `montarFilaCampanha`, `acenderCorrenteDeDisparo`), e
`listaPeloCentral.test.ts` cobra a ordem. Ele entrou na lista de quem pode
inserir lista/fila (`listaDeTransmissao.test.ts`). Pausar e retomar repetem
`pausarCampanha`/`retomarCampanha` (base da pausa automática, texto
conferido de novo).

## As contas da proposta

- **Pessoas**: a régua da tela recortada pelo pedido, um cadastro por
  telefone. Lugar = `regiaoCasa` contra a região que o LEAD declarou; "até
  600 mil" = teto do lead (ficha → dossiê → renda) até 600 mil × folga;
  com imóvel, só quem combina (`leadsQueCombinam`, a tela "Leads que
  combinam"), salvo compradores. Palavra que não se entende vira lugar: o
  filtro **estreita**, nunca alarga para a carteira inteira.
- **Nunca falaram**: `quemNuncaFalou`, a pergunta de
  `nuncaFalouComOCorretor` em lote, contando os outros cadastros do mesmo
  telefone (arquivados também). Em dúvida, primeiro contato.
- **Cabem hoje no primeiro contato**: `min(nunca, vagas)`, com as vagas do
  disparador (conexão/volta da queda, `contarPrimeirosContatos`).
- **Saem hoje** (estimativa): quem já conversou + as vagas, limitado pela
  cota (limite pelo uso − enviadas hoje − fila de outras listas para hoje) e
  pelo relógio (`previsaoDeTermino`; domingo, zero).
- Sem texto ditado, vai o `MENSAGEM_PADRAO` da tela (o teste confere que é
  igual ao de `NovaCampanha.tsx`).

## Sempre o número de quem pediu

Número, carteira e listas são de `ctx.corretorId`, também para o gestor
(spec 3.5, item 14). Desconectado: resposta clara, sem proposta; e o "sim"
confere de novo. Acompanhar só vê as listas da própria pessoa (a tela faz
igual).

## Desfazer (spec 4.6)

Pausa primeiro (o disparador para de pegar a lista), depois conta o que
saiu: nada → cancela como `cancelarCampanha`; algo (ou envio sem
comprovante, que pode ter saído) → fica pausada e a resposta diz isso.
Desfazer pausar = retomar, e vice-versa.

## Armadilhas de teste

- O `bancoFalso` não tem `rpc` nem `count`, e não põe o `grupo_id` que o
  gatilho da 0191 põe na lista e na fila: `listas.test.ts` embrulha o
  cliente (`comContagemERpc`).
- `idsProtegidosDeNovaLista` filtra pelo embed (`campanha.corretor_id`): no
  falso, a linha da fila leva essa chave com ponto.
- O falso funde insert com o mesmo `telefone`: telefones diferentes na fila.
- "mil".startsWith("mi") é verdade: a faixa "600 mil" virou 600 milhões até
  o teste pegar.

Ligações: [[lista-de-transmissao-visivel-e-controlavel]],
[[central-imoveis-do-catalogo]], [[central-le-sem-sessao-e-sem-rls]].
