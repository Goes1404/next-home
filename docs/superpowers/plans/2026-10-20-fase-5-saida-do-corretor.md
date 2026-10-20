# Fase 5 enxuta — saída do corretor (20/10/2026)

Escopo decidido com o dono (spec §9, §19): lead que o corretor trouxe fica
com ele; lead que a imobiliária deu fica com a imobiliária; na saída o
corretor leva SÓ A FICHA, nunca a conversa. O resto da fase 5 (mover a conta
para outro grupo, conta de independente, material de marketing e link
pessoal, corretor só exclui lead dele) fica para depois.

## (a) Etiqueta de origem: coluna, não view

`leads.trazido_por` (`corretor` | `imobiliaria`), `not null`, sem grant de
UPDATE, escrita SÓ pelo gatilho `leads_trazido_por`:

- INSERT: `classificar_trazido_por(origem, origem_atribuicao, impulsionamento, por_gestor)`
  (função pura). O valor mandado pelo cliente é ignorado.
- UPDATE que troca `corretor_id`: vira `imobiliaria` (repasse da gestão).
- UPDATE que promove `whatsapp/organico` (a ficha que acabou de nascer pelo
  convite) para outra origem: reclassifica (é o caminho do impulsionamento).
- Qualquer outro UPDATE: mantém o valor antigo.

Por que coluna: a regra "ninguém edita depois" vira fato gravado; uma view
recalcularia a cada leitura e mudaria de resposta se a regra mudasse.

Classificação (ordem):

1. `origem_atribuicao = 'roleta'` → imobiliária.
2. `whatsapp/ativado_pelo_corretor`, `whatsapp/teste_do_corretor`,
   `painel/manual`, `indicacao` → corretor.
3. `painel/importacao` → corretor, salvo se quem importou é gestor.
4. `meta/ctwa` com `meta_ad_id` (etiqueta da Meta = impulsionamento do
   próprio corretor, 0127) → corretor.
5. `site…` com atribuição `link` (link pessoal) → corretor.
6. `site…`, `anuncio/…`, `whatsapp/organico`, `meta/…`, `inbound/…`,
   `parceiro` → imobiliária.
7. Resto: `link`/`manual` → corretor; senão imobiliária.

Backfill: lead com linha `repasse` em `lead_interacoes` → imobiliária; o
"importou como gestor" do passado sai do papel ATUAL do dono.

## (b) Desativar mostra a divisão e redistribui

- `devolver_leads_da_imobiliaria(p_corretor, p_destino)` (`security
  definer`): só gestor do grupo; move os leads `imobiliaria` do corretor para
  `p_destino` (ativo, do grupo, não oculto) ou, com nulo, pela ordem da
  roleta (mesmas preferências da `distribuir_lead`, mais um contador desta
  divisão para espalhar). Grava `repasse` (origem anterior) e `sistema` na
  linha do tempo e `leads_redistribuidos` em `admin_eventos`.
- `admin/acoes.ts`: `resumoDaSaida(id)` (contagens pela sessão) e
  `devolverLeadsDaImobiliaria(id, destino)`.
- `ContasManager`: "Desativar" com leads abre o painel `SaidaDoCorretor`
  em vez do `confirm`.

## (c) Planilha das fichas dele

- `GET /api/painel/fichas-do-corretor?corretor=<id>`: só gestor, lê pela
  sessão só os leads `trazido_por = corretor` daquele corretor no grupo, e
  grava `fichas_exportadas` em `admin_eventos`.
- `planilhaDasFichas` (pura): nome, telefone, e-mail, etapa, origem, imóvel
  de interesse, orçamento, renda, região, dormitórios, cadastro, visita.
  Ficam de fora `mensagem` (pode ter falas importadas), `detalhes`, dossiê,
  notas e qualquer mensagem.

## Migration

`0200_etiqueta_de_origem_e_saida.sql`: coluna + função pura + backfill +
gatilho + função de devolução + CHECK de `admin_eventos` com
`fichas_exportadas`.

## Testes

- `src/lib/crm/etiquetaDeOrigem.db.test.ts`: classificação por caminho,
  gatilho imutável, repasse vira imobiliária, devolução (destino, roleta,
  outro grupo recusado, corretor comum recusado).
- `src/lib/corretores/fichasDoCorretor.test.ts`: colunas sem conversa.
- Guardas: `funcoesSeguras.ts`, `servicoComGrupo.test.ts`, texto da roleta
  igual nas duas funções.
