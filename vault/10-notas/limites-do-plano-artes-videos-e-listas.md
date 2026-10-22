---
title: Artes, vídeos e mensagens de lista têm teto por plano, por grupo e por mês
tags: [banco, admin, painel, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0214_limites_do_plano.sql, src/lib/planos/limitesDoPlano.ts, src/lib/planos/usoDaIa.ts, src/app/api/imagens/gerar/route.ts, src/app/corretor/(painel)/marketing/video/acoes.ts, src/app/corretor/(painel)/campanhas/acoes.ts, src/lib/whatsapp/listasVivas.ts, src/app/plataforma/acoes.ts, src/app/corretor/(painel)/_componentes/FaixaLimitesDoPlano.tsx]
created: 2026-10-22
updated: 2026-10-22
summary: Os três limites que estavam só no papel (spec §10) passam a valer. Teto no código, ajuste da plataforma em grupos.teto_*, contador em uso_da_ia (colunas novas) somado por gatilho; confere ANTES de gastar; falha de leitura não bloqueia; Next Home sem teto.
---

# Artes, vídeos e mensagens de lista têm teto por plano, por grupo e por mês

Irmã de [[cota-de-respostas-da-ia-por-grupo]] (mesmo formato, mesma linha de
`uso_da_ia`). Parte de [[plataforma-multi-grupo]]. Nome de trabalho:
"limites do plano" (a sigla 2D já é a das regras de operação).

**Os números** (provisórios, spec §10) moram em `src/lib/planos/limitesDoPlano.ts`:

| | Essencial | Profissional | Imobiliária | custo |
|---|---|---|---|---|
| Artes/mês | 30 | 100 | 50 por assento | sem teto |
| Vídeos/mês | 3 | 10 | 5 por assento | sem teto |
| Mensagens de lista/mês | 1.000 | 2.500 | 2.500 por imobiliária (NÃO por assento) | sem teto |

Assento = a regra provisória de `tetoDeRespostasDaIa` (número de WhatsApp
cadastrado, mínimo 1). Ajuste da plataforma: `grupos.teto_artes`,
`teto_videos`, `teto_mensagens_lista` (nulo = o plano decide; vence o plano e
não multiplica por assento). Mês de São Paulo, aviso aos 80%.

**Onde contar: gatilho, e não `count(*)` das tabelas.** `imagens_geradas` e
`video_jobs` o dono apaga (e a rotina limpa artes antigas): contar linhas vivas
devolveria a cota a quem exclui a arte. Então `contar_uso_de_recurso()`
(0214, `security definer`) soma em `uso_da_ia` (colunas novas `artes`,
`videos`, `mensagens_lista`): +1 em INSERT de `imagens_geradas`, `video_jobs` e
`whatsapp_campanhas_fila`. Só desconta o que de fato não foi gasto: vídeo que
termina em `erro` (a fila já devolve o crédito) e mensagem da fila que vira
`erro` (sem WhatsApp, barrada, conversa recente). Estender `uso_da_ia` em vez
de criar tabela: uma tela de "quanto já usei", nenhuma tabela nova para o
MAPA do `servicoComGrupo`.

**Onde bloqueia (ANTES de gastar), `conferirLimite` em `usoDaIa.ts`:**
rota `/api/imagens/gerar` (429, depois do teto diário e antes de `gerarImagem`);
`verRoteiro` e `criarVideo` (a visão que classifica as fotos já é IA paga);
`criarCampanha` (com o tamanho da lista, depois de tirar quem não tem
WhatsApp); lista viva (`listasVivas.ts`, adia quem não cabe). **Lista que não
cabe no que resta é recusada INTEIRA, com a conta** ("restam 100 de 1.000"),
não se envia "até o limite": o corretor decide o que cortar. O limite diário
anti-ban da instância é outra régua e segue valendo. Grupo suspenso é a regra
da 2C, não duplicada aqui.

**Falha de leitura NÃO bloqueia** (log e segue), como `lerCotaDaIa`: errar
custa centavos, travar a equipe por uma piscada do banco custa cliente. A
plataforma (`/plataforma/grupos/[id]`) lê em modo `estrito` e vê o erro.
Corrida aceita: duas gerações no mesmo segundo podem passar 1–2 do teto
("reservar antes de gastar" é o medidor único, outra fase).

**Telas.** Faixa `FaixaLimitesDoPlano` no layout (acabou: todos; 80%: só
gestor), barras em "Uso do plano neste mês" na Visão geral do gestor,
"restam N este mês" (`RestamNoMes`) nas telas de criar arte, vídeo e lista,
e em `/plataforma/grupos/[id]` os três usos + `FormularioLimitesDoPlano`
(`ajustarLimitesDoPlano`, guarda `exigirAdminDaPlataformaNaAcao`). O evento do
ajuste reaproveita `cota_da_ia_ajustada` com `detalhes.recurso`, para não
mexer no CHECK de `admin_eventos` (0211–0213 são de outras branches).

**Next Home (grupo 1, plano `custo`)**: nenhum bloqueio, nenhuma faixa, nenhuma
barra; teste trava (`limitesLidos.test.ts`).

**Pendente**: armazenamento (5/20/10 GB) fica fora; o medidor único e a compra
de pacote extra também.
