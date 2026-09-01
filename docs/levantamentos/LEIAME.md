# Levantamentos de mercado

Fotografias do que existe no mercado, para decidir o que entra no catálogo.
São **dados de referência**, não fonte de publicação: nome, status, bairro,
tipologia e o link. Foto, planta e descrição vêm da construtora, com quem a
Next Home tem relação direta — a ingestão de PDF/Drive do painel processa
isso e é por onde 57 das 343 mídias já entraram.

## `barueri-2026-09-01.json`

Os 59 empreendimentos de Barueri listados publicamente no `apto.vc`,
gerados por `scripts/lancamentosBarueri.mjs`. Distribuição na data:
31 em construção · 20 prontos para morar · 8 lançamento.

**Por que não veio do Órulo.** Foi a primeira tentativa. Todas as URLs dos
sitemaps deles apontam para um portal Next.js que exige login — o HTML
público é uma casca cujo texto visível é "Entrar / Carregando mapa…" — e os
dados chegam por `/api/v2/*`, que o `robots.txt` deles pede explicitamente
para crawler não tocar. Sem credencial de parceiro não há o que ler; com
credencial, o caminho certo é a API oficial (eles vendem "integração
site/CRM", que é exatamente este caso de uso).

O `apto.vc` é servido pronto, libera tudo no `robots.txt` fora de
`/plugin`, `/data` e `/preview`, e traz um `__NEXT_DATA__` estruturado com
`status.name` — que é justamente o filtro "em construção" que se queria.

**Cuidado ao cruzar com o catálogo:** nome parecido não é o mesmo imóvel.
"Dom Barueri" e "Dom Parque" são de incorporadoras diferentes, e "La Vista
Barueri" não é o "Vista AlphaGran". O cruzamento automático marca esses
casos como "conferir" em vez de casar — a mesma régua do `focoDaConversa`,
onde empate entre imóveis diferentes é descartado.

## O que fazer com o levantamento

Ele não é a fila. Os 39 em obra ou lançamento foram carregados em
`catalogo_candidatos` (migrations 0078–0080) e a decisão acontece em
**Imóveis → Fila de cadastro** (`/corretor/imoveis/candidatos`).

A diferença importa: o arquivo JSON é uma foto de uma data e envelhece; a
fila LEMBRA o que já foi decidido, e é isso que impede os mesmos 30 imóveis
de voltarem à mesa toda vez que alguém roda o levantamento de novo. Rodar o
script outra vez deve fazer `upsert` por `(fonte, ref_externa)` — decisão
tomada não se apaga, só o `visto_em` é atualizado.

**Só a decisão é editável pela tela** (grant da 0080): nome, link e
`ref_externa` espelham a fonte e são recusados pelo banco se alguém tentar
mudá-los pela API. Quem popula a fila é o levantamento, com a service key.
