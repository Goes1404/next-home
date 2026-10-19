# Mapa da frente "Painel da plataforma e grupos" — fase 2 multi-grupo

Branch `fase-1-multi-grupo` (HEAD 334c337), lida em 19/10/2026. Só leitura.
Caminhos relativos a `C:/Users/User/nexthome/next-home`. Desenho: spec
`docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
(§10, §11, §18 "Fase 2", §19). Lacunas: `docs/superpowers/specs/2026-10-19-lacunas-multi-grupo.md`
(L31–L44, L85, L86).

---

## 1. A tabela `grupos` (0181)

**Existe** — `supabase/migrations/0181_grupos.sql`:

- `:55-61` colunas: `id uuid`, `nome text`, `slug text not null unique`,
  `tipo text check (tipo in ('imobiliaria','independente'))`, `criado_em`.
  **Nada mais.** Sem `situacao`, plano, contato de cobrança, dados
  institucionais, vencimento.
- `:70-72` grupo 1 com id fixo `00000000-0000-0000-0000-000000000001`, slug
  `next-home`, tipo `imobiliaria`. Constante no código:
  `src/lib/grupos/grupo.ts:7` (`GRUPO_NEXT_HOME_ID`).
- `:213-224` RLS: `anon` sem nada; `authenticated` só SELECT e só a linha do
  próprio grupo (`id = grupo_atual()`). **Escrita só pela chave de serviço.**
- `:81-90` `corretores.grupo_id not null` + índice.
- Tipos escritos à mão: `src/lib/supabase/types.ts:1558-1581` (Row/Insert/Update
  só com as 5 colunas) e cabeçalho `:40-60` explicando o que é manual (regerar
  apaga as uniões de CHECK — MEMORIA "Regenerar types.ts").
- Leitores de `grupos` no app: só dois crons, que leem `id` para laço
  por grupo — `src/app/api/cron/relatorio-semanal/route.ts:97,103` e
  `src/app/api/cron/quem-esta-esperando/route.ts:95`. Nenhuma tela lê `grupos`.

**Slug do grupo** (L34): `unique` simples, sem validação de DNS, sem lista de
reservados, sem regra de troca. Não existe código que valide slug de grupo.
(O que existe para slug de **corretor/imóvel** são as funções de unicidade
global da 0183, ver §6.)

**Sessão não carrega o grupo inteiro**: `CorretorSessao`
(`src/lib/corretorSessao.ts:36-45`) tem só `grupoId`; não tem `tipo` nem
`situacao` do grupo. `getCorretorLogado` (`:59-87`) seleciona
`papel, ativo, grupo_id` de `corretores` e devolve `null` sem `slug` ou com
`ativo = false`.

---

## 2. Administrador da plataforma (0181)

**Existe no banco, sem nenhum uso no app.**

- Tabela `administradores_da_plataforma(user_id uuid pk → auth.users, criado_em)`
  — `0181_grupos.sql:239-250`. RLS ligada, `revoke all` de `anon` e
  `authenticated`: ninguém lê pela API.
- `eh_admin_da_plataforma()` — `0181:252-264`, `security definer`, `stable`,
  `execute` para `authenticated, service_role`.
- Declarada em `src/lib/grupos/funcoesSeguras.ts:27` e em
  `src/lib/grupos/tabelasDoGrupo.ts:19` (`TABELAS_GLOBAIS`).
- Teste de banco: `src/lib/grupos/isolamento.db.test.ts:350-370`
  ("só a tabela decide, e ninguém a lê pela API").
- **Grep em `src/` (fora de testes/types/funcoesSeguras): zero chamadas** a
  `eh_admin_da_plataforma` / `administradores_da_plataforma`. Não há guarda,
  rota, tela nem linha cadastrada por código.

Onde ela já age no banco:

- Carimbo de grupo `derivar_grupo_da_linha` —
  `0182_grupo_em_todas_as_tabelas.sql:389-397` (evento da plataforma em
  `admin_eventos` com grupo nulo só para `service_role` ou administrador) e
  `:414-421` (passo e: logado só grava no próprio grupo, **exceto**
  administrador da plataforma).
- **A policy restritiva NÃO abre exceção para ele**:
  `0184_isolamento_por_grupo.sql:41-43` ("Ele lê todos os grupos pelo painel da
  plataforma (fase 2), pela chave de serviço; pela sessão, vê o grupo de que
  for corretor").

### Consequências diretas para a fase 2

- **Administrador que não é corretor não abre o painel**: sem linha em
  `corretores` com `slug`, `getCorretorLogado()` devolve `null`
  (`corretorSessao.ts:78`) e o layout mostra `ContaSemVinculo`
  (`src/app/corretor/(painel)/layout.tsx:144-169`). O `proxy.ts` só exige
  sessão em `/corretor/*` (`src/proxy.ts:51-73`), não papel.
- Pela sessão, `grupo_atual()` do administrador é nulo (ou o grupo de que ele
  for corretor) → policy restritiva devolve zero linhas de outros grupos.
  Toda leitura do painel da plataforma tem de ir pela **chave de serviço**,
  depois de uma guarda que chame `eh_admin_da_plataforma()` pela sessão.

---

## 3. Guardas e telas de admin existentes

### Guardas — `src/lib/guardas.ts`

- `exigirGestorNaPagina()` `:33-37` → `notFound()` se não gestor.
- `exigirGestorNaAcao()` `:44-51` → `{ erro }` em texto.
- Ambas dependem de `getCorretorLogado()`; nenhuma conhece administrador da
  plataforma. Não existe `exigirAdminDaPlataforma*`.
- Regra documentada no arquivo e no layout de admin: guarda em **cada**
  `page.tsx` (layout não re-executa entre rotas irmãs) —
  `src/app/corretor/(painel)/admin/layout.tsx:3-19`.

### Telas em `src/app/corretor/(painel)/admin/` (todas do GESTOR do grupo)

| Rota | Arquivo | Guarda |
|---|---|---|
| `/corretor/admin` (Visão geral) | `admin/page.tsx` | `:99` |
| Leads da equipe | `admin/leads/page.tsx` | `:27` |
| Contas | `admin/contas/page.tsx` + `ContasManager.tsx` | `:11` |
| WhatsApp da equipe | `admin/whatsapp/page.tsx` | `:62` |
| Construtoras | `admin/construtoras/page.tsx` | `:29` |
| Parceiros | `admin/parceiros/page.tsx` | `:17` |
| Preços | `admin/precos/page.tsx` | `:19` |
| Crédito | `admin/credito/page.tsx` | `:20` |
| Marca | `admin/marca/page.tsx` | `:16` |
| SLA / Eventos (fora do menu) | `admin/sla/page.tsx`, `admin/eventos/page.tsx` | `:23`, `:46` |
| Anúncios (conta Meta) | `admin/anuncios/ContaDaMeta.tsx` | `:110` |

Componentes da Visão geral: `admin/_componentes/SaudeDaOperacao.tsx`
(SLA + `event_outbox`, pela sessão), `ProntidaoDaEquipe.tsx` (chave de
serviço com `.eq("grupo_id", gestor.grupoId)` `:22-27`, último login via
`auth.admin.getUserById`), `UsoDasNovidades.tsx`.

### Ações do gestor — `admin/acoes.ts` (todas com `exigirGestorNaAcao`)

- `criarAcessoCorretor` `:115-207`: confere `alvo.grupo_id === guarda.corretor.grupoId`
  (`:144`), `servico.auth.admin.createUser({ email_confirm: true })` (`:159-163`),
  vincula com `grupo_id` no SET e no filtro (`:176-186`), compensa apagando o
  usuário do Auth se o vínculo falhar (`:194`), grava `admin_eventos`
  `conta_criada` (`:198-204`).
- **`cadastrarCorretor` `:225-264` JÁ EXISTE (07/10/2026)**: insere ficha em
  `corretores` pela chave de serviço com `grupo_id` do gestor (`:245-249`) e
  chama `criarAcessoCorretor`; apaga a ficha se o login falhar (`:257`). A UI
  usa em `ContasManager.tsx:379`. **Diverge do texto da spec §18 / L31**
  ("hoje não existe insert em `corretores`"): o cadastro com senha existe; o
  que não existe é **convite por e-mail** e "esqueci a senha".
- `criarAcessosQueFaltam` `:295`, `redefinirSenhaCorretor` `:377-415`
  (senha nova pela chave de serviço + `deve_trocar_senha`), `alterarPapelCorretor`
  `:420`, `alternarAtivoCorretor` `:441-470`, `alternarSoWhatsapp` `:480`,
  `redistribuirCarteira` `:546-675`.
- Unicidade de slug/e-mail: `slugDisponivel` `:68`, `emailDeAcessoLivre` `:91`
  → RPCs `slug_de_corretor_livre` / `email_de_acesso_livre`.
- Credenciais derivadas: `src/lib/corretores/credenciaisIniciais.ts` —
  `DOMINIO_ACESSO = "nexthome.com"` `:24` (domínio de terceiro), senha
  `nexthome`+4 dígitos `:27,97`, `ehEmailDeAcesso` `:108`.

### Navegação — `src/app/corretor/(painel)/_componentes/navegacao.tsx`

- Flag `gestor?: boolean` em item/subitem (`:45`, `:61`); filtro só por papel
  em `gruposVisiveis(ehGestor)` `:367-376`. **Não há filtro por `grupos.tipo`**
  nem por administrador da plataforma.
- Administração: `:276-300`, subtópicos com `secao` Equipe/Negócio/Sistema.
- Ferramentas de equipe que o §10/L35 mandam esconder em grupo de uma pessoa:
  Financeiro com Ranking de VGV `:192` (sem `gestor`), Desempenho `:193`;
  "Leads da equipe" / redistribuir `:292`; roleta (sem item de menu — é o
  gatilho `distribuir_lead`).
- Layout passa `ehGestor = corretor?.papel === "gestor"`
  (`src/app/corretor/(painel)/layout.tsx:52-53`).
- Guardas de texto da navegação: `navegacao.test.ts`, `menuLateral.test.ts`
  (régua de destinos / cor por módulo).

---

## 4. Dados institucionais hoje (`site.ts` / `marca.ts`)

- `src/lib/site.ts:15-91` `PADRAO` (nome, nomeCompleto, wordmark, assistente,
  creci `044589-J`, descricao, keywords, url, endereço com lat/lng, 2
  WhatsApps, redes, regiões); `:13` lê `NEXT_PUBLIC_MARCA` via `lerMarca`;
  `:97-105` mescla; `url` só de `NEXT_PUBLIC_SITE_URL` (`:52`, `:104`).
  **Constante síncrona, de build, igual para todo grupo.**
- `src/lib/marca.ts:28-42` tipo `Marca` (sem razão social, CNPJ/CPF, tipo de
  CRECI J/F, encarregado LGPD, contato de cobrança); `:48-102` parser
  tolerante.
- Tela "Marca" do gestor só gera o JSON da variável:
  `admin/marca/page.tsx:10-40` (modelo "uma instalação por cliente", L61).
- 83 arquivos importam `@/lib/site`. Uso de campos institucionais por arquivo
  (contagem de `site.<campo>`): `lib/dadosEstruturados.ts` 15,
  `app/layout.tsx` 14, `(institucional)/sobre/page.tsx` 10,
  `components/layout/Footer.tsx` 7, `contato/page.tsx` 6,
  `corretores/[slug]/page.tsx` 5, `anunciar-imovel` 4, home 3, …
- Pontos exatos citados pelo §18/L33:
  - Rodapé: `src/components/layout/Footer.tsx:17-20` (redes), `:38` descrição,
    `:39` e `:93` CRECI + `nomeCompleto`.
  - JSON-LD: `src/lib/dadosEstruturados.ts:19-23` (ids/logo por `site.url`),
    `:41-66` `organizacaoJsonLd` (nome, telefone, endereço, geo, areaServed,
    sameAs), `:75-86` `websiteJsonLd`.
  - Privacidade: `src/app/(institucional)/privacidade/page.tsx:12`, `:53`
    (`site.nomeCompleto` + `CRECI site.creci` como controlador; sem CNPJ, sem
    encarregado).
  - Metadados globais: `src/app/layout.tsx:60-110`.
  - IA: `src/lib/whatsapp/aiAgent.ts:521,556` (`site.nome`, `site.regioes[0]`
    no prompt); `aberturaPelaIA.ts:164,303` e `whatsapp/acoes.ts:87`
    (`site.assistente` como padrão).
- **Já existe dado institucional POR GRUPO em outro lugar**:
  `fiscal_config` tem `cnpj` e `razao_social` (gravados em
  `src/app/corretor/(painel)/financeiro/fiscal/acoes.ts:39-52`), PK `grupo_id`
  desde `0183_funcoes_respeitam_grupo.sql:109-112`. Segunda fonte possível
  para razão social/CNPJ.
- `grupoDoSite()` fixo no grupo 1 — `src/lib/grupos/grupo.ts:17-19`; guarda
  `semGrupoDoSiteNoPainel.test.ts` impede uso no painel.
- Resolver o grupo pelo `Host` e trocar `site` por dado do grupo em cada
  requisição é fase 3 (§6, §18 Fase 3). Na fase 2 o §18 só pede **modelar e
  substituir** rodapé/JSON-LD/privacidade.

---

## 5. Saúde por grupo — de onde vêm os sinais hoje

Padrão de leitura recortada já pronto: `leituraDoGrupo(cliente, grupoId)` —
`src/lib/admin/numerosDaEquipe.ts:53-72` (`ler`/`lerView` com `grupo_id`
aplicado por construção). `clienteParaNumerosDaEquipe()` `:29-38` exige gestor.
Laço por grupo pronto como modelo: `relatorio-semanal/route.ts:97-115`.

| Sinal | Fonte existente | Onde é lido hoje |
|---|---|---|
| **Número caído** | `corretor_whatsapp_instancias.status_conexao`, `desconectado_em` (gravado 1x: `repositorio.ts:2595-2597`, `:2729-2731`; zerado `:2620`, `:2697`, `whatsapp/acoes.ts:326`), `motivo_queda_codigo`, `sessao_caida_em`, `bloqueado_ate` | `lib/admin/numerosDaSemana.ts:29,55-66` (`numeroNoAr`, `diasForaDoAr`); `admin/whatsapp/page.tsx:78,171-173`; `lib/whatsapp/avisoDeQueda.ts:45-61`; `lib/whatsapp/quedaDoNumero.ts:36-47` |
| **IA calada** | `ia_interacoes` (tem `grupo_id`): `acao` (`'respondida'` vs motivo de silêncio), `modelo` (`null` = ninguém chamado; `'nenhum'` = contingência), `fallback`, `silencio jsonb` (0149:20), `created_at` | `admin/whatsapp/page.tsx:80-82` (fallback, latência, avaliação, 500 últimas); views `whatsapp_resposta_metricas` / `whatsapp_funil_metricas` (agora com `grupo_id`, 0184) lidas em `numerosDaSemana.ts:30-33` |
| **Ativação** | prontidão por corretor: `lib/crm/primeirosPassos.ts` + `lib/crm/configuracaoDoCorretor.ts` (usados em `ProntidaoDaEquipe.tsx:29-35`); último login via Auth | só visão do gestor |
| **Inadimplência** | **não existe** (nenhuma tabela de plano, fatura, pagamento, vencimento; grep de `fatura`/`inadimpl`/`situacao` em migrations e `src/lib`: nada) | — |

Eventos de queda já auditados: `admin_eventos.acao = 'numero_desconectado'`
(gravado por `admin/whatsapp/acoes.ts:58`; lido por `admin/whatsapp/page.tsx:83-88`
com `.eq("grupo_id", ...)`).

---

## 6. `admin_eventos` e ator da plataforma

- Criação: `supabase/migrations/0030_admin_contas_e_papel.sql:27-53`.
  `ator_id uuid references corretores(id) on delete set null` (`:29`),
  `alvo_corretor_id` idem (`:38`), `detalhes jsonb`. Sem policy de INSERT
  (só `security definer` e chave de serviço).
- CHECK de `acao` vigente: `0134_adm_nao_le_conversa_alheia.sql:124-135` —
  só `conta_criada, senha_redefinida, papel_alterado, corretor_desativado,
  corretor_reativado, leads_redistribuidos, numero_desconectado`. Nenhuma ação
  de plataforma (criar grupo, suspender, marcar pagamento, acesso de suporte).
- `grupo_id` anulável: `0182:252-258` + comentário `:271-272`; nulo só com
  `detalhes.origem = 'plataforma'`, sem mãe com valor, por `service_role` ou
  administrador (`0182:389-397`). Policy restritiva torna o evento de grupo
  nulo invisível a todo logado (`0184:93-96`).
- Testes: `isolamento.db.test.ts:896` e `:934` (a marca de plataforma).
- **Ator da plataforma não cabe em `ator_id`** (FK para `corretores`): hoje
  não há coluna para `auth.users.id` do operador. L41.
- Inserts no código: `admin/acoes.ts:198,402,459,655`, `admin/whatsapp/acoes.ts:58`,
  e `definir_papel_corretor` na `0183:466`.

---

## 7. Onde a fase 2 encaixa (pontos de entrada concretos)

| Item §18 Fase 2 | Ponto de encaixe no código atual |
|---|---|
| Painel da plataforma (§11) | Nenhuma rota existe. Precisa de guarda nova sobre `eh_admin_da_plataforma()` + leitura pela chave de serviço; não pode ficar atrás de `getCorretorLogado()`/`(painel)/layout.tsx` sem tratar `ContaSemVinculo`. `proxy.ts:51-73` já exige sessão em `/corretor/*`. |
| Criar grupo + primeiro gestor | Insert em `grupos` só pela chave de serviço (0181 §6). Primeiro corretor: o carimbo `corretores_00_grupo` aceita `grupo_id` explícito; `criarAcessoCorretor` é preso à sessão de gestor do mesmo grupo (`acoes.ts:126,144`) — não serve ao operador. `slug_de_corretor_livre`/`email_de_acesso_livre` exigem `eh_gestor()` (`0183:233,251`) — o operador não passa. |
| Dados do grupo novo que precisam nascer | `parametros_credito` (PK `grupo_id`, `0181:282-306`; spec §19.5: cópia da Next Home); `fiscal_config` (PK `grupo_id`, `0183:109-112`). |
| Gestor convida corretor / login real (L31, L85) | `cadastrarCorretor`/`criarAcessoCorretor` (`acoes.ts:115-264`) com `email_confirm: true` e senha; trocar por convite (`auth.admin.inviteUserByEmail`/link) e recuperação. Depende de e-mail transacional. |
| Canal com o cliente pagante (L32) | `src/lib/email.ts`: Resend, `RESEND_API_KEY` ausente → `sem_chave` (`:78-83`); remetente `avisos@nexthomeimobiliaria.com.br` (`:34`, domínio legado); recusa `@nexthome.com` (`:71-76`). `avisarCorretor` (`src/lib/crm/avisoAoCorretor.ts:14-35`) só funciona com número conectado. |
| Dados institucionais (L33) | Tabela/colunas novas; consumidores listados em §4 deste mapa. |
| Slug do grupo (L34) | `grupos.slug` (`0181:58`). |
| Grupo de uma pessoa (L35) | `grupos.tipo` existe; `CorretorSessao` não o carrega; `gruposVisiveis` (`navegacao.tsx:367`) só filtra por papel; `garantir_gestor_remanescente` já é por grupo (`0183:403-422`). |
| Ponto único "pode operar" (L36) | `resolverInstancia` (`src/lib/whatsapp/repositorio.ts:87-117`) não lê `corretores.ativo`, situação do grupo nem cota; `textoDeContingencia` (`aiAgent.ts:663`). |
| Saúde por grupo (L42) | §5 deste mapa; `leituraDoGrupo` + laço de grupos. |
| Suporte com registro (L41) | `admin_eventos` (§6). |
| Mesmo número em dois grupos — proibido (§19.4, L86) | `corretor_whatsapp_instancias.telefone_conectado` (`0018:10`) **sem unique**; unicidade só em `corretor_id` e `instance_name` (`0018:7-8`). Trava pedida "no banco". |
| Suspensão no 5º dia (§19.6) | Nada existe (sem `situacao`, sem vencimento). |

---

## 8. Armadilhas (código + MEMORIA)

1. **O segundo grupo muda o comportamento do banco inteiro.** Carimbo
   `derivar_grupo_da_linha` passo d (`0182:404-413`) e gatilho de corretores
   (`0181:183-190`): com UM grupo, insert sem grupo cai no grupo 1 com aviso;
   com DOIS, **falha** (`grupo_id obrigatório`). Criar o primeiro grupo de
   teste em produção revela qualquer caminho que ainda insere sem grupo pela
   chave de serviço. Roteiro da fase 1 exige antes disso a suíte de isolamento
   + E2E de testes verdes no mesmo commit e gatilhos religados
   (`docs/ROTEIRO-FASE-1-PRODUCAO.md:1338-1340`, `:1462-1469`).
2. **Tabela nova da fase 2** (planos, uso, faturas, institucionais…) tem de
   ou entrar em `TABELAS_GLOBAIS` (`tabelasDoGrupo.ts:15-26`) **e** na lista
   SQL da 0182 (`0182:236-238`, que não lê o TS), ou ter `grupo_id` + gatilhos
   `<t>_00_grupo`/`_zz_grupo_*` + policy restritiva. A 0182/0184 instalaram
   isso por laço **no momento em que rodaram**; tabela criada depois não ganha
   nada sozinha. Guardas: `isolamento.db.test.ts:463,485,1763`. Chave única
   nova precisa incluir `grupo_id`/mãe ou entrar em `CHAVES_UNICAS_GLOBAIS`
   (`tabelasDoGrupo.ts:39-56`; teste `:1048`).
3. **Supabase dá ALL a `anon` e `authenticated` em toda tabela nova do
   `public`** (MEMORIA 0082, 0116; `0181:208-211`). Grant por coluna sem
   `revoke all ... from authenticated` antes é decorativo (MEMORIA 0116).
   `column_privileges` não lista DELETE (MEMORIA 0090).
4. **Chave de serviço classificada**: todo arquivo novo que use
   `createServiceClient` tem de entrar em `MAPA` de
   `src/lib/grupos/servicoComGrupo.test.ts` (`:44-58`, categorias `:13-37`).
   O painel da plataforma lê **todos** os grupos por desenho — nenhuma
   categoria atual o descreve (`plataforma` = "linha a linha, sem juntar nem
   somar"; `agrega-por-grupo` = cron com laço).
5. **Parâmetro de grupo com valor padrão é defeito** (MEMORIA "As portas de
   entrada leem dentro do grupo"): `getEmpreendimentos(grupoId = ...)` fazia
   chamador esquecido ler o grupo 1 calado. `portas.test.ts` impede o padrão.
6. **Chave única global conferida pela sessão mente depois da 0184**
   (MEMORIA lote final): usar funções `security definer` sim/não
   (`slug_de_corretor_livre`, `email_de_acesso_livre`, `slug_de_imovel_livre`).
   Elas exigem `eh_gestor()` / corretor ativo — o operador da plataforma não
   passa nelas pela sessão.
7. **`marca origem='plataforma'` em `admin_eventos` não vale para `postgres`**
   (dentro de `security definer` chamada por logado o papel é `postgres`);
   SQL à mão precisa `set local role service_role` (MEMORIA 0183 parte B).
8. **`fiscal_config` sem linha do grupo** → o update de
   `financeiro/fiscal/acoes.ts:39-52` afeta 0 linhas e responde
   "Configuração salva". **`parametros_credito` sem linha** →
   `atualizar_parametros_credito` levanta erro (`0181:364-366`) e o site cai em
   `PARAMETROS_PADRAO` com só um `console.warn`
   (`src/lib/credito/parametros.ts:54-57`). Grupo novo sem essas linhas falha
   calado em um caso e alto no outro.
9. **Comentário desatualizado**: `admin/acoes.ts:141-143` diz que a ficha de
   outro grupo aparece no select de `corretores`; depois da 0184 a policy
   restritiva recorta `authenticated` (a policy pública continua valendo só
   para `anon`). A conferência de grupo no código continua necessária para a
   chave de serviço.
10. **E-mail**: sem `RESEND_API_KEY` todo envio volta `sem_chave` com 200 do
    chamador; diagnóstico é o log de runtime, não o status (MEMORIA 03/09).
    `enviarEmail` recusa `@nexthome.com` (`email.ts:71-76`). Crons de e-mail
    desagendados.
11. **Cron**: rota chamada por `pg_cron` (`net.http_post`) precisa exportar
    `POST` (MEMORIA 03/09, `cronAceitaPost.test.ts`); `configurar_*` tem de ser
    CHAMADA, aplicar migration não agenda; cron da Vercel no Hobby (4 aceitos,
    teto não documentado; recusa derruba o deploy inteiro).
12. **Layout não re-executa entre rotas irmãs**: guarda em cada página;
    `revalidatePath(rota, "layout")` para faixa no layout (MEMORIA 0071).
13. **Portal precisa repetir `data-rota`/`data-modulo`** se o painel novo usar
    gaveta/bolha (MEMORIA 04/09).
14. **Integrações** só no grupo 1 via `integracaoLiberada`
    (`src/lib/grupos/integracoes.ts:17-31`); scripts só no grupo 1
    (`grupoDoScript.ts:46-56`) — os dois mudam quando houver grupo real.
15. **Contagem de usuários**: MEMORIA 12/09 — o lote de acessos nunca rodou e
    só 2 de 7 corretores tinham login; "trocar e-mail" pode ser "criar login".
16. **Colisão de número de migration**: conferir `origin/<branch de produção>`
    antes de numerar (MEMORIA 0181). Próxima livre nesta branch: 0186.
17. **Toda migration da 0181 em diante**: `begin;` / `set local
    lock_timeout = '5s'` / `drop ... if exists` antes de `create` / `commit;`
    (`migracoesAtomicas.test.ts`).

---

## 9. O que NÃO existe e precisa ser criado (factual)

- Rota, layout, guarda e menu do **painel da plataforma**; guarda
  `exigirAdminDaPlataforma*`; caminho para administrador sem ficha de
  corretor.
- Colunas em `grupos`: `situacao` (ativo/suspenso/encerrado), plano,
  contato de cobrança, dados institucionais (razão social, CNPJ/CPF, CRECI J/F,
  endereço, telefones, redes, encarregado LGPD) — ou tabelas próprias.
- Validação de **slug de grupo** (DNS + reservados).
- Tabelas de **planos, cotas, uso mensal, faturas/pagamentos, assento diário,
  pacotes extras**; medidor único (não mapeado aqui em detalhe: os medidores
  atuais são `reservar_cota_campanha`, `reservar_credito_video` 0092 e o teto
  de imagens em `src/lib/imagens/galeria.ts`/`imagensTipos.ts`).
- Ações de plataforma em `admin_eventos` (CHECK de `acao`) e coluna de ator
  que não seja `corretores.id`.
- **Seed do grupo novo** (`parametros_credito` copiado do grupo 1,
  `fiscal_config`).
- Fluxo de **convite** e **recuperação de senha**; remetente de e-mail da
  plataforma; chave configurada.
- **Trava de número único** entre grupos (`telefone_conectado`).
- **Filtro de menu por `grupos.tipo`** e `tipo` na sessão.
- **Saúde por grupo**: inadimplência (não há fonte); a agregação
  multi-grupo de número caído / IA calada / ativação (há fontes, não há tela).
- Ponto único "pode operar" (corretor ativo + grupo ativo + cota) em
  `resolverInstancia`, crons e disparador.
- Aceite de termos por usuário (L44).
