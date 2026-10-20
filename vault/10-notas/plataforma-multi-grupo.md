---
title: Plataforma multi-grupo
tags: [infra, admin, decisao]
type: nota
status: seedling
custou: alto
codigo: docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md
created: 2026-10-18
updated: 2026-10-20
summary: Decisão de 18/10/2026 — o CRM vira produto vendido para imobiliárias e corretores independentes numa plataforma só, com vários grupos no mesmo banco. Substitui "uma instalação por cliente". A Next Home vira o grupo 1, a preço de custo.
---

# Plataforma multi-grupo

Substitui [[next-home-e-o-espelho-da-versao-geral]] (26/09). A decisão de 06/10 ("banco compartilhado com `empresa_id`")
é a mesma, só registrada; a implementação usa `grupos`/`grupo_id` (0190). Desenho completo
em `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`.

**Por que mudou:** para corretor independente pagando por mês, um banco e um
projeto Vercel por cliente custam mais do que ele paga, e cada migration
viraria N migrations.

## O que ficou decidido (pelo Matheus)

- **Grupo** = unidade de cliente. Imobiliária = grupo com gestores e
  corretores. Corretor independente = grupo de uma pessoa. **Um login, um
  grupo**; quem quer os dois usa dois logins.
- **Gestor nunca lê conversa**, nem o administrador da plataforma. A **ficha
  do lead** precisa ser completa: vira requisito, não melhoria.
- **WhatsApp**: número pessoal do corretor pela Evolution, como hoje. O risco
  de banimento é do corretor, por contrato.
- **Sites**: um site no código respondendo por vários endereços (grupo
  resolvido pelo `Host`). Endereço gratuito + domínio próprio. Portfólio com
  conteúdo livre e layout fixo. Texto de cada imóvel próprio de cada site,
  por causa de conteúdo duplicado no Google.
- **IA por grupo**: nome, região, fala preço ou não, tom, regras da casa.
  Proteções e funil iguais para todos.
- **Saída do corretor**: etiqueta de origem do lead que ninguém edita. O que
  ele trouxe vai com ele; o que o grupo deu fica, e quem herda recebe só a
  ficha.
- **Planos**: todas as ferramentas em todos; muda só a quantidade. Medidor
  único que reserva antes de gastar. Essencial R$ 97, Profissional R$ 147,
  Imobiliária R$ 127/corretor (provisórios até medir custo real).
- **Catálogo compartilhado** (fase 6): base da plataforma, cópia por grupo,
  sugestões numa tela com uma linha por imóvel; a base muda por fonte oficial.
- **Entrada e cobrança manuais** por enquanto, pelo painel da plataforma.

## O que vale saber antes de começar

- **A resposta da IA é mais de dois terços do custo de qualquer plano.** No
  pior caso o Profissional empata (~R$ 144 de custo para R$ 147). Medir o
  custo real e o cache de prompt antes de publicar preço.
- **O banco fica em `ca-central-1`** (decisão de 18/10, por dar menos
  trabalho). A política de privacidade e o contrato precisam declarar a
  transferência internacional. Região de projeto Supabase não muda depois;
  rever isso só seria barato antes do segundo grupo.
- **A leitura pública pela chave `anon` vira vazamento** num banco único
  (catálogo e telefones de todos os grupos pelo PostgREST): passa a ser
  feita no servidor, escopada pelo grupo.
- As 158 migrations nunca rodaram num banco vazio; o ambiente de testes é
  onde isso se prova.
- **As migrations multi-grupo começam em 0190**, não em 0159: a branch de
  produção já ocupava 0159–0180, e a branch a trouxe por merge. Elas nasceram
  como 0181–0185 e foram **renumeradas para 0190–0194 em 20/10/2026**: a 0188
  (prévia do link) e a 0189 (conta oculta) subiram de produção antes e já
  estão aplicadas, e a fase 1 tem de rodar depois delas — em produção e num
  banco do zero. 0181–0187 ficam como buraco declarado (`RESERVADOS` em
  `migrations.test.ts`); a 0192 mantém o recorte da [[conta-oculta]] na
  roleta, no ranking e no sorteio. A 0190
  cria `grupos`, o grupo 1 (`00000000-…-0001`), `corretores.grupo_id`,
  `grupo_atual()` e o gatilho `corretores_00_grupo`, que deixa a 0190
  aplicável sozinha em produção (o código no ar insere corretor sem grupo).
- **A 0190 também faz corretor desativado perder a sessão**: `grupo_atual()`,
  `corretor_atual()` e `eh_gestor()` filtram `ativo`, e `getCorretorLogado()`
  devolve nulo para ele. Antes, desativar só tirava o corretor da roleta; o
  login seguia lendo o que lia. Cria ainda `administradores_da_plataforma` +
  `eh_admin_da_plataforma()` (sem acesso pela API) e põe as **taxas de
  crédito por grupo**: `parametros_credito.grupo_id` vira a chave,
  `atualizar_parametros_credito` grava só a linha do grupo do gestor ativo
  (quem não é gestor recebe erro, não `false`) e `getParametrosCredito(grupoId)`
  leva o grupo na chave do cache. O site lê as do `grupoDoSite()`.
- **A 0191 põe `grupo_id` em toda tabela** (menos as quatro de
  `TABELAS_GLOBAIS`), com o gatilho `<tabela>_00_grupo`: o grupo vem das
  linhas-mãe tiradas das FKs reais, TODAS conferidas (mãe de outro grupo ou
  inexistente é erro); sem mãe, o informado, o de quem está logado, o único
  (com aviso) ou erro. Trocar o grupo de uma linha só pela role
  `transferidor_de_grupo` (sem login, sem membros). Os gatilhos internos que
  gravam em outra tabela (evento do lead, campanha da Meta) repassam
  `new.grupo_id`. A linha FINAL também é conferida (`<tabela>_zz_grupo_insert`
  e `_zz_grupo_update`, `after`): gatilho `before` que roda depois do carimbo
  (a roleta `leads_distribuir`) não consegue pôr mãe de outro grupo nem
  trocar o grupo. O webhook e a seleção leem as taxas pelo grupo do dono.
- **O E2E saiu de produção (19/10):** `e2e.yml` só sob demanda, contra o
  ambiente de testes (`docs/AMBIENTE-DE-TESTES.md`, depende do Matheus),
  com conta sintética e sem artefato. Playwright recusa URL de produção,
  `conectar()` recusa o banco de produção e o export do golden exige
  `--grupo` do grupo 1 e grava fora do repositório
  (`test/ambienteDeTestes.test.ts`). As migrations do projeto de testes
  entram por `npm run db:teste:remoto`, que recusa produção antes do push.
- **A 0192 (parte A) escopa as chaves únicas de negócio por grupo**: CRECI,
  item de lazer (lazer é catálogo, cada grupo tem o seu), campanha canônica
  e evento de marketing, mês fechado do contador, configuração fiscal (uma
  por grupo), código legado do imóvel e o id da mensagem do WhatsApp. Ficam
  globais, de propósito e listados em `CHAVES_UNICAS_GLOBAIS`: slugs de
  imóvel e corretor (fase 3), login, instância no provedor, tokens sorteados
  e os ids da Meta (fase 7). Slug de corretor e e-mail de acesso são
  conferidos por `slug_de_corretor_livre`/`email_de_acesso_livre`, que olham
  todos os grupos e só dizem sim/não. As portas que gravam pela chave de
  serviço sem linha-mãe passam o grupo explícito (`/wa`, Meta, e-mail de
  portal, Gmail), e scripts de catálogo exigem `--grupo`.
- **As portas de entrada leem dentro do grupo (Task 12).** Pela chave de
  serviço, a consulta que vem ANTES da gravação atravessava grupos: o
  imóvel e o corretor citados no e-mail de portal, o duplicado por telefone
  (e-mail, Lead Ads, palavra-chave), o estoque da página do parceiro, o
  imóvel novo do "me avise", o catálogo público e o da IA. Hoje cada uma
  filtra o grupo (o do site, o da instância ou o da Next Home nas
  integrações), e `portas.test.ts` reprova leitura de `leads`,
  `empreendimentos` ou `corretores` sem `grupo_id` nesses arquivos.
  `/api/leads` e `/api/clique-whatsapp` passaram à chave de serviço com o
  grupo do site, aceitando corretor e imóvel do corpo só se forem dele.
  `sortear_corretor_whatsapp(p_grupo, …)` sorteia só no grupo; a assinatura
  antiga fica até o deploy, presa ao grupo 1. Meta, Gmail e Pixel passam por
  `integracaoLiberada` (só o grupo 1 até a fase 7).
  O catálogo (`getEmpreendimentos`) não tem mais grupo padrão: o painel lê o
  do corretor logado e as páginas de seleção, proposta e portal o de quem
  mandou o link (com o padrão, elas saíam vazias para o grupo B).
  No painel o grupo é sempre o de quem está logado:
  `semGrupoDoSiteNoPainel.test.ts` reprova `grupoDoSite(` em
  `src/app/corretor` e `src/app/api/painel`, e também as funções do site
  que o usam por dentro (`getCorretores`, `getEmpreendimentoBySlug`, ...),
  com a lista tirada do código delas.
- **A 0192 (parte B) escopa as funções `security definer`** (Task 5), onde a
  RLS não vale: a roleta escolhe só no grupo do lead (sem ninguém elegível,
  o lead fica sem dono dentro dele), o último gestor é contado por grupo,
  funções de gestor (papel, pagamento de venda, preferência de contato)
  agem só no grupo dele, ranking e taxas da equipe contam só o grupo. Crédito
  de vídeo e reserva de visita saíram do `authenticated`. As exceções ficam
  em `src/lib/grupos/funcoesSeguras.ts`, conferidas no texto e no `pg_proc`.
- **A 0193 fecha a RLS por grupo** (Task 6): policy restritiva
  `isolamento_por_grupo` em toda tabela com `grupo_id` (soma por AND a toda
  permissiva), as seis views com `grupo_id` no fim da lista, as duas
  policies de `storage.objects` conferindo o grupo do imóvel/corretor do
  caminho, e o carimbo recusando logado que grava em outro grupo (defesa em
  profundidade, passo e da 0191). O Realtime entrou na suíte
  (`realtime.db.test.ts`, que grava de verdade e por isso divide uma trava
  de sessão com `isolamento.db.test.ts`).
- **A chave de serviço está classificada por grupo (Task 7).** Todo arquivo
  que a usa está num mapa com a categoria (`por-id`, `equipe`,
  `agrega-por-grupo`, `cruza-conjuntos`, `plataforma`) e
  `servicoComGrupo.test.ts` cobra o que cada uma promete. As telas do gestor
  leem pela leitura recortada (`leituraDoGrupo`), o relatório semanal e o
  aviso de espera rodam grupo a grupo, os scripts com chave secreta exigem
  `--grupo` e o SQL de diagnóstico fixa o grupo. Ver
  [[chave-de-servico-classificada-por-grupo]].
- **O build do CI lê o banco de teste, nunca produção (19/10).** Desde a F2b o
  `generateStaticParams` de `/empreendimentos/[slug]` consulta o catálogo em
  build, e sem variável `src/lib/supabase/env.ts` cai no fallback de produção:
  o filtro por `grupo_id` derrubou o `verificar` porque produção ainda não tem
  a coluna. O job `verificar` agora sobe o mesmo banco do `isolamento`
  (`npm run db:teste`, que imprime `NEXT_PUBLIC_SUPABASE_URL` e a chave
  publicável do stack local) e o passo do build recusa URL fora do runner.
  Guarda: `src/lib/supabase/buildDoCiSemProducao.test.ts`. O build da Vercel
  continua lendo produção, e por isso a migration sobe antes do deploy.
- **Lote de correções da revisão final da fase 1 (19/10).** 0190 e 0193
  ganharam `begin`/`commit` e `lock_timeout` (guarda
  `src/lib/migracoesAtomicas.test.ts`, que cobra também `drop policy if
  exists` antes de cada `create policy`); `slug_de_imovel_livre` (0192) confere
  o slug de imóvel em todos os grupos para `criarImovel`; a **0194 é
  pós-deploy** (apaga a assinatura antiga do sorteio e tira do `anon` o insert
  em `leads`/`cliques_whatsapp`); `gravarMensagem` não duplica fala na
  retentativa; e o job `site-publico` do `e2e.yml` voltou a vigiar produção
  todo dia, só com os specs públicos e sem segredo.
