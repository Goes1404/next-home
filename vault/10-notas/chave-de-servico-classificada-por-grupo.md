---
title: Chave de serviço classificada por grupo
tags: [banco, admin, teste, decisao, licao]
type: nota
status: seedling
custou: medio
codigo:
  - src/lib/grupos/servicoComGrupo.test.ts
  - src/lib/grupos/codigoFonte.ts
  - src/lib/admin/numerosDaEquipe.ts
  - src/app/api/cron/relatorio-semanal/route.ts
  - src/app/api/cron/quem-esta-esperando/route.ts
  - src/lib/crm/enviarResumoDoDia.ts
  - test/bancoFalso.ts
fonte: docs/MEMORIA.md — A chave de serviço classificada por grupo (19/10/2026)
created: 2026-10-19
updated: 2026-10-19
summary: A chave de serviço ignora a RLS e enxerga todos os grupos. Todo arquivo que a usa está num mapa com a categoria que explica por que não atravessa grupos (por-id, equipe, agrega-por-grupo, cruza-conjuntos, plataforma), e uma guarda que lê o código cobra o que cada categoria promete.
---

# Chave de serviço classificada por grupo

A RLS não protege nada que passa pela chave de serviço (`createServiceClient`).
Com um grupo só, esquecer o grupo numa consulta não aparece; com dois, a
consulta atravessa empresas. Parte de [[plataforma-multi-grupo]] (Task 7, lacunas
L13, L16, L17, L18, L22).

## As categorias

`src/lib/grupos/servicoComGrupo.test.ts` tem o MAPA `arquivo → categoria` de
todo arquivo de `src/` e `scripts/` que usa a chave (93 hoje). Arquivo novo fora
do mapa reprova pedindo a categoria.

| categoria | quando | o que a guarda cobra |
|---|---|---|
| `por-id` | age numa linha alcançada por id confiável (sessão, token, instância do webhook) | `validadoPor` aparece no código antes do primeiro `createServiceClient()` (import não conta), ou é a primeira leitura pela chave (o token) |
| `equipe` | lê várias pessoas para mostrar ao usuário | cada `.from(...).select` tem `grupo_id` no encadeamento, ou passa por `.ler()`/`.lerView()` |
| `agrega-por-grupo` | cron que soma números | lê `grupos`, tem `for (const { id: grupoId } of grupos)`, e o resto é lido no grupo da volta |
| `cruza-conjuntos` | cron que junta duas listas | os dois lados trazem `grupo_id` e o casamento compara o grupo |
| `plataforma` | cron linha a linha, sem juntar nem somar | só o motivo |

Em helper de biblioteca o id chega do chamador: `validadoPor` nomeia o
parâmetro e o motivo diz quem validou. Isso é declaração, não prova.

## A leitura recortada

`clienteParaNumerosDaEquipe()` não devolve mais o cliente cru: devolve
`leituraDoGrupo`, que só tem `ler((c) => c.from("t").select(...))` (aplica
`grupo_id`) e `lerView(...)` (aplica `corretor_id` entre os do grupo, porque as
views só ganham `grupo_id` na 0184). O tipo de `ler` recusa view e tabela global.

**Por que callback e não `tabela("t", "colunas")`:** a primeira versão tipava a
tabela por um mapeamento genérico sobre todas as tabelas e o `tsc` foi de 65 s a
5 min, estourando a memória sem `--max-old-space-size`. Com o callback, o tipo
da consulta é o mesmo de uma chamada normal.

## O que a classificação achou

- **O resumo do dia oferecia imóvel de outro grupo.** `imoveisNovosQueCombinam`
  recebia o `grupoId` e só o usava para as taxas de crédito; os imóveis novos
  vinham de todos os grupos. Mesma família da [[plataforma-multi-grupo]] L13.
- **Import não é validação.** A primeira versão da regra `por-id` aceitava o
  nome da guarda no `import`, então tirar a chamada não reprovava. Mordida
  conferida por md5.
- **Ler o grupo e casar pelo grupo são coisas diferentes.** No aviso de novidade,
  tirar o `.in("grupo_id", ...)` dos leads não é defeito (o casamento por
  `novosPorGrupo.get(lead.grupo_id)` continua); tirar o casamento é.

## Ligações

- [[plataforma-multi-grupo]]
- [[MOC — Infraestrutura]]
