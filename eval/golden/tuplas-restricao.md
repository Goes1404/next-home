# Tuplas para gerar casos de "restrição do cliente" (F3)

Objetivo: levantar os ~20 Pass + ~20 Fail rotulados que faltam para
`validate-evaluator` medir TPR/TNR do juiz `restricaoRespeitada.ts`. Sem
isso o juiz é diagnóstico, não porteiro de release.

As dimensões abaixo NÃO são variação genérica: cada uma aponta para onde a
falha foi observada em produção (análise de erro de 23/08/2026, conversa
…8216).

## Dimensões

**D1 — Tipo de restrição** (o que o cliente limita)
`tamanho` · `n_dormitorios` · `regiao` · `estagio_da_obra` · `teto_orcamento` · `recusa_explicita` · `prazo_de_mudanca`

**D2 — Relação com o catálogo** (é aqui que a falha nasce)
`existe_opcao_que_atende` · `nao_existe_opcao` · `dado_ausente_no_catalogo`

**D3 — Forma como o cliente expressa**
`direta` · `implicita_coloquial` · `repetida` (segunda vez, depois de já ter sido ignorada)

`repetida` é a mais importante das três: nos traces reais, o cliente pediu
a mesma coisa até quatro vezes recebendo a mesma ficha de volta. É o ponto
em que ele desiste.

## As 20 tuplas

| # | D1 restrição | D2 catálogo | D3 forma | testável |
|---|---|---|---|---|
| 1 | regiao | existe_opcao_que_atende | direta | sim |
| 2 | regiao | nao_existe_opcao | direta | sim (ex.: Santos, Leblon) |
| 3 | regiao | existe_opcao_que_atende | repetida | sim |
| 4 | estagio_da_obra | existe_opcao_que_atende | direta | sim (pronto = Bosque AlphaGran) |
| 5 | estagio_da_obra | existe_opcao_que_atende | implicita_coloquial | sim ("preciso mudar rápido") |
| 6 | estagio_da_obra | nao_existe_opcao | direta | sim (não há "entrega em 30 dias") |
| 7 | recusa_explicita | existe_opcao_que_atende | direta | sim ("casa não, apartamento") |
| 8 | recusa_explicita | existe_opcao_que_atende | repetida | sim |
| 9 | teto_orcamento | dado_ausente_no_catalogo | direta | sim — e o certo é NÃO falar valor |
| 10 | teto_orcamento | dado_ausente_no_catalogo | repetida | sim |
| 11 | prazo_de_mudanca | existe_opcao_que_atende | implicita_coloquial | sim |
| 12 | prazo_de_mudanca | nao_existe_opcao | direta | sim |
| 13 | n_dormitorios | existe_opcao_que_atende | direta | sim (após enriquecer o fixture) |
| 14 | n_dormitorios | nao_existe_opcao | direta | sim (após enriquecer o fixture) |
| 15 | n_dormitorios | nao_existe_opcao | repetida | sim — cena real, ver `restricao-dormitorios-repetida` |
| 16 | n_dormitorios | dado_ausente_no_catalogo | direta | sim |
| 17 | tamanho | existe_opcao_que_atende | implicita_coloquial | sim (após enriquecer o fixture) |
| 18 | tamanho | nao_existe_opcao | direta | sim (após enriquecer o fixture) |
| 19 | tamanho | nao_existe_opcao | repetida | sim — cena real, ver `restricao-tamanho-menor` |
| 20 | tamanho | dado_ausente_no_catalogo | direta | sim |

## O bloqueio que isto revelou — RESOLVIDO em 23/08/2026

`eval/fixtures/catalogo.json` tinha 3 imóveis e **`tipologias: []` em todos**
— nenhum dormitório, suíte, metragem ou vaga.

Consequência: **nenhum caso de eval conseguia exercitar "o imóvel NÃO
atende à especificação pedida"**, que é a forma mais comum da falha F3 em
produção. Toda pergunta de tipologia caía em "dado ausente", cuja resposta
certa é a da regra 14 ("não sei, vou confirmar") — comportamento diferente,
e mais fácil. Seis das 20 tuplas eram intestáveis, incluindo as duas cenas
reais que originaram a categoria.

O fixture foi enriquecido (decisão de 23/08). Agora:

| imóvel | tipologias |
|---|---|
| Canvas Alphaville | 3 suítes/110m²/2 vagas · 4 suítes/145m²/3 vagas |
| Viva Vila do Conde | 2 dorm/49m²/1 vaga · 3 dorm/1 suíte/63m²/2 vagas |
| Bosque AlphaGran | casa 3 dorm/1 suíte/140m²/2 vagas |

Escolhidas para que existam os três desfechos de D2: pedido de 3 dormitórios
ATENDE (Viva), pedido de 5 dormitórios NÃO ATENDE (nada chega perto), e
pedido abaixo de 45m² NÃO ATENDE (o menor é 49m²).

Como a v11 ainda não tinha sido medida, o fixture novo não quebra
comparação nenhuma: a primeira medição da v11 já nasce sobre ele.

## Estado

As 20 tuplas viraram **17 casos com `restricaoDoCliente: true`** em
`casos.json` (o golden foi de 15 para 32 casos). Algumas tuplas se
fundiram por descreverem a mesma cena.

## Como virar rótulo humano

O eval já produz a planilha de rotulagem: rodar `npm run eval` grava, em
`eval/resultados/`, a resposta do agente + o veredito do juiz + a CRÍTICA
dele para cada um dos 17 casos.

O passo humano é ler os 17 e marcar Pass/Fail por conta própria, **sem
olhar o veredito do juiz antes** — concordância medida depois de ver a
resposta dele não mede nada. Com esses rótulos, `validate-evaluator`
calcula TPR e TNR de verdade.

17 é menos que os ~20 Pass + ~20 Fail do alvo. A segunda leva sai de
`exportarGolden.ts`, quando houver conversa real de cliente — que hoje não
existe, porque o corpus todo é teste.
