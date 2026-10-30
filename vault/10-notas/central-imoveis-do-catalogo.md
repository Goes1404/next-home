---
title: O número central fala do catálogo (onda 2, frente F)
aliases: [informacao_de_imovel, imoveis_para_o_lead, leads_para_o_imovel, simular_financiamento, atualizar_imovel, imovelPeloCentral]
tags: [crm, decisao]
type: decisao
status: seedling
custou: baixo
codigo:
  - src/lib/central/tratadores/imoveis.ts
  - src/lib/imoveis/imovelPeloCentral.ts
  - src/lib/whatsapp/focoDaConversa.ts
  - src/lib/crm/matchDeImoveis.ts
  - src/lib/consultor/financiamento.ts
created: 2026-10-30
updated: 2026-10-30
fonte: construção da onda 2 do CRM pelo WhatsApp, 30/10/2026
summary: As cinco ferramentas de imóvel do número central reaproveitam as réguas que já existiam (imoveisCitados para achar o imóvel, matchDeImoveis para casar lead e imóvel, simularFinanciamento com as taxas do grupo). atualizar_imovel (gestor) grava por src/lib/imoveis/imovelPeloCentral.ts; o "a partir de" entra no histórico da tela de preços. Pronto, mas desligado até ONDA_ATUAL = 2.
---
# O número central fala do catálogo

Parte da onda 2 de [[crm-pelo-whatsapp-numero-central-com-ia]]. Desligado até
`ONDA_ATUAL` chegar a 2 (até lá, "ainda não sei").

## Nenhuma régua nova

- **Qual imóvel**: `imoveisCitados` (o reconhecimento da IA de atendimento,
  com os apelidos da 0136: "vitta" é o Vitra). Um termo que aponta para dois
  imóveis não decide ("Royal" com o I e o II) e vira pergunta numerada. Sem
  citação, cada palavra como pedaço do nome ou de um apelido. "2 dorms do X"
  sai do texto antes da busca e escolhe a planta. O nome da imobiliária
  (`ctx.imobiliaria`) sai do índice. Ver [[nomes-que-o-cliente-acerta]].
- **Imóvel para o lead / lead para o imóvel**: `imoveisQueCombinam` e
  `leadsQueCombinam` (`matchDeImoveis`), os mesmos da ficha e da tela do
  imóvel. Ficha manda, dossiê preenche o vazio, renda vira teto pela conta do
  simulador. Sugestão só do publicado (tem página para mandar). Lead sem
  critério não ganha sugestão inventada.
- **Simulação**: `simularFinanciamento` com `getParametrosCredito(grupo)`.
  Sem renda não há faixa do MCMV: conta pelo SBPE e diz a renda necessária.
  Prazo até 50 é lido como anos. Sempre "é estimativa".

## Escopo

- Catálogo, unidades, mídias, leads, dossiês e equipe lidos com o `grupo_id`
  da identificação (chave de serviço, [[central-le-sem-sessao-e-sem-rls]]).
- `leads_para_o_imovel`: corretor só os dele; gestor o grupo, com o nome do
  corretor. Volta só nome, etapa e o porquê (até 10). Montar lista é a
  capacidade 14 (onda 3): só se oferece.
- Fotos e planta como arquivo ficam para depois (a conversa só manda
  texto): volta o link público (`linkPublicoDoImovel`) do imóvel publicado.

## atualizar_imovel (só gestor)

- Recusa de corretor no executor (`soGestor`) e de novo em `preparar`,
  `executar` e `desfazer`.
- "O 2 dorms do X subiu para 480 mil" muda `tipologias.preco` daquela planta
  (mais de uma planta com os mesmos dormitórios → pergunta). Sem dormitórios,
  muda o `preco_a_partir`, que ganha um lote de um imóvel em
  `historico_precos_lotes`/`_itens` ("Pelo WhatsApp: X"): a tela de preços vê
  e o "Desfazer" de lá funciona. Valor abaixo de 10 mil é recusado ("480"
  sem o "mil"); salto acima de 30% vai com aviso no resumo.
- "Vendeu a unidade 32": acha por `chaveDaUnidade` no imóvel e muda o status
  (apaga o prazo de reserva, como o espelho da construtora).
- O "sim" não grava se o valor já mudou desde a proposta. O desfaz só volta
  o que está como o central deixou (unidade: status E `atualizado_em`), marca
  o lote como revertido e diz o que ficou.
- Depois de gravar, `revalidarCatalogo` + `revalidarSitePublico` em
  try/catch (a escrita não depende do cache).

## Armadilha para quem testar

O `bancoFalso` devolve a MESMA linha que o `update` depois altera
(`Object.assign`). Ler a unidade, atualizar e só então montar o "antes" deu
um desfaz que "voltava" para vendida. Capture o antes em valores antes do
`update`. As plantas do teste são os mesmos objetos na tabela e no embed do
imóvel, porque o banco falso não junta tabelas.

## Pendências

- Unidade sem cadastro (só o contador manual da planta) não é atualizada
  por aqui: a resposta manda cadastrar no painel.
- Conferir em produção que `revalidateTag` dentro do `after()` do webhook
  derruba o cache; se falhar, só loga e o site se acerta em até 1 h.
