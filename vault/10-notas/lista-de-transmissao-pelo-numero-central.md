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
summary: "Manda o Vitta pra quem quer Barueri até 600 mil" vira proposta (filtros estruturados: região, orçamento, dormitórios, imóvel, etapas, já respondeu/nunca respondeu, parado há N dias; o para_quem só vai ao resumo; zero vem com o número de cada filtro) com quantas pessoas, quantas nunca falaram e quantas cabem hoje (as contas da tela e do disparador); o "sim" só põe a lista na fila da tela, pelo número de QUEM PEDIU (o gestor também), e o disparador manda com todas as travas. Desfazer cancela se nada saiu; se já saiu, só pausa. Acompanhar = números, pausar e retomar com "sim". Pronto, desligado até ONDA_ATUAL = 3.
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

- **Pessoas**: a régua da tela recortada pelos filtros (seção abaixo), um
  cadastro por telefone. Sem filtro nenhum, a carteira elegível inteira, e
  o resumo diz isso com todas as letras ("Sem filtro: toda a sua carteira
  elegível: N pessoas").
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

## Os filtros (conversa da Bruna, 30/10/2026)

A gestora pediu "quem já respondeu alguma mensagem", "quem ficou em
conversa e parou de responder" e "quem não respondeu no WhatsApp". O
`para_quem` em texto só entendia região/faixa/dorms/imóvel e a palavra
desconhecida virava LUGAR: as 4 tentativas deram "ninguém". Agora a
ferramenta declara campos (`ferramentas.ts`) e o tratador lê com
`lerPedido`; **`para_quem` não filtra nada**, só aparece no resumo
("Pedido: ...").

Ordem do recorte (é a ordem do resumo e do "por quê"):

1. **Etapas** (`etapas`): `lead.etapa` nas pedidas. Fechado e perdido nunca
   entram (régua `elegivel`); só "fechado" + imóvel = compradores dele.
2. **Região**: `regiaoCasa` contra a região que o LEAD declarou.
3. **Orçamento** (`orcamento_max`): teto do lead (ficha → dossiê → renda) ≤
   valor × folga.
4. **Dormitórios**: `dormitorios_min` do lead ≤ pedido.
5. **Imóvel**: só quem combina (`leadsQueCombinam`), salvo compradores.
6. **Respondeu** (`respondeu` sim/nao): `conversasComOCorretor` lê as
   conversas do lead **com este corretor** (`whatsapp_conversas.corretor_id`),
   contando todos os cadastros do mesmo telefone, e pergunta em lote à
   `conversas_com_fala_do_cliente` (0156, a da tela de Conversas: EXISTS
   por conversa, para na primeira fala do `cliente`). "nao" leva junto o
   **teto de insistência** da tela (`tentativas_sem_resposta` < 3), que era
   o que o público `sem_resposta` já fazia.
7. **Parado há N dias** (`parado_ha_dias`): a régua das Listas sugeridas,
   último contato = maior entre `whatsapp_conversas.ultima_interacao_em`
   (toda mensagem gravada, dos dois lados, lista inclusive) e
   `leads.ultima_tentativa_em`, há ≥ N dias. **Sem contato nenhum não é
   "parado"** (é novo). `etapa_alterada_em` NÃO entra.
8. **Proteção de lista recente** (`idsProtegidosDeNovaLista`), por último.

Respondeu e parado só leem conversa de quem sobrou dos passos 1–5. Erro de
leitura = resposta "não consegui conferir", nunca recorte no escuro.

**Zero vem com o porquê**: os filtros correm também sobre as protegidas
(`publicoDaListaPeloCentral` devolve `protegidas`, que nunca entram) e a
resposta traz `porque` ("carteira elegível: 8; Em conversa: 4; destes, já
responderam: 1; destes, fora por já estarem em outra lista...: 1"),
`zerouEm` e uma `dica`: filtro → afrouxar só esse; trava → não se afrouxa.

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
- O `rpc` falso do `listas.test.ts` responde pelo nome: o contador de
  primeiro contato (0222) e a `conversas_com_fala_do_cliente` (0156), esta
  lida das `whatsapp_mensagens` do cenário.

Ligações: [[lista-de-transmissao-visivel-e-controlavel]],
[[central-imoveis-do-catalogo]], [[central-le-sem-sessao-e-sem-rls]].
