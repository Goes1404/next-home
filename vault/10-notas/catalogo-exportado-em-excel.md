---
title: O catálogo exportado em Excel
aliases: [exportar catálogo, planilha do catálogo, xlsx]
tags: [painel, decisao]
type: nota
status: growing
custou: baixo
codigo:
  - src/lib/imoveis/xlsxEscrita.ts
  - src/lib/imoveis/planilhaDoCatalogo.ts
  - src/lib/imoveis/planilhaDoCatalogo.test.ts
  - src/app/api/painel/catalogo-excel/route.ts
  - src/app/corretor/(painel)/imoveis/page.tsx
summary: Imóveis → "Exportar Excel" baixa o catálogo inteiro numa tabela, uma linha por imóvel, com leads contados pela RLS da sessão.
updated: 2026-10-06
---

# O catálogo exportado em Excel

Tela de Imóveis → **Exportar Excel ↓** (`/api/painel/catalogo-excel`). Uma
linha por imóvel, rascunho incluso: nome, situação, estágio, prazo de
entrega, cidade, bairro, endereço, link do mapa, valor "a partir de", leads,
construtora, faixa de metragens, plantas (uma por linha) e descrição.

- **Sem dependência nova.** `xlsxEscrita.ts` escreve o ZIP e os XMLs (texto
  como `inlineStr`, cabeçalho em negrito, filtro, linha congelada). O teste
  confere a ida e a volta pelo leitor da casa (`lerPlanilhaXlsx`), e o
  openpyxl abriu o arquivo.
- **Valor e leads saem como número**, para quem recebe somar e ordenar.
- **Leads pela RLS da sessão**: corretor vê os dele, ADM os da equipe;
  arquivado fica de fora. Um lead conta uma vez, pelo imóvel de interesse ou
  pelo do cadastro (a regra de `procuraPorImovel`, do gráfico da mesma tela).
  A leitura pagina de 1000 em 1000 (teto do PostgREST).
- **Zero em banheiro e vaga é ausência**, como na página do imóvel.
- Catálogo vazio na leitura vira erro 500: `getEmpreendimentosDoPainel`
  devolve `[]` em falha, e uma planilha em branco passaria como verdade.

Ver [[ordem-do-catalogo-no-site-tem-tela]].
