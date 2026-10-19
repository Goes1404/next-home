# Fase 2A — Painel da plataforma, criação de grupo e convite: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O administrador da plataforma cria uma imobiliária (ou um corretor
independente) por uma tela própria, e todo login novo nasce de um convite por
e-mail real, com "esqueci a senha" — sem senha provisória e sem endereço
inventado.

**Architecture:** `grupos` ganha plano, situação, contato de cobrança e dados
institucionais; uma função `criar_grupo` (só chave de serviço) cria o grupo e as
linhas iniciais dele numa transação. Uma área `/plataforma`, fora do painel do
corretor, é guardada por `eh_admin_da_plataforma()` e lê pela chave de serviço.
O convite usa `auth.admin.generateLink` (o Supabase cria o usuário e devolve o
`hashed_token`), o e-mail sai pelo `enviarEmail` (Resend) e o link volta a uma
rota `/auth/confirmar` que chama `verifyOtp` — o mesmo caminho serve à
recuperação de senha. Sem chave de e-mail, a tela mostra o link para o gestor
mandar à mão, em vez de falhar.

**Tech Stack:** Next.js deste repositório (ler `node_modules/next/dist/docs/`
antes de mexer em rota/route handler), Supabase (Auth admin API, Postgres),
Resend via `src/lib/email.ts`, vitest, Supabase local (`npm run db:teste`).

**Spec:** `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
(§2, §4, §10, §11, §15, §18 "Fase 2", §19 respostas 2–4, §20). Mapas de código:
`docs/superpowers/plans/mapas-fase-2/` (copiados da sessão de 19/10).

## Global Constraints

- Branch `fase-2-plataforma`, que nasce de `fase-1-multi-grupo` (fase 1 ainda
  não aplicada em produção). Migrations novas a partir de `0186`, conferindo
  contra `origin/*` antes.
- Toda migration: `begin;` → `set local lock_timeout = '5s';` → `drop … if
  exists` antes de `create` → `commit;` (guarda `migracoesAtomicas.test.ts`).
- Tabela nova: `revoke all … from anon, authenticated` antes de qualquer grant;
  ou tem `grupo_id` + gatilhos `<t>_00_grupo`/`_zz_grupo_*` + policy
  `isolamento_por_grupo`, ou entra em `TABELAS_GLOBAIS` (TS **e** a lista SQL da
  0182) com motivo. Função `security definer` nova: cita o grupo ou entra em
  `FUNCOES_SEM_GRUPO` com motivo.
- Todo arquivo novo que use `createServiceClient` entra no `MAPA` de
  `src/lib/grupos/servicoComGrupo.test.ts` com categoria.
- `types.ts` é editado à mão; nunca regerar.
- O administrador da plataforma **nunca** vê conversa nem ficha (§4, §11): a
  área `/plataforma` lê cadastro e números, nunca `whatsapp_mensagens`,
  `lead_observacoes_ia` nem conteúdo de lead.
- Remetente: `EMAIL_REMETENTE` (padrão desta fase: `Next Home <acesso@nexthomeimoveis.com>`,
  §20). Sem `RESEND_API_KEY`, nada quebra: a tela mostra o link para copiar.
- Senha mínima: 8 caracteres (regra da tela atual, `actions.ts`).
- Nenhuma resposta revela se um e-mail existe ou de qual grupo é ("esqueci a
  senha" e "e-mail já em uso" usam frases neutras).
- Planos válidos: `essencial`, `profissional`, `imobiliaria`, `custo` (§10).
  Situações: `ativo`, `suspenso`, `encerrado`. Tipos: `imobiliaria`,
  `independente`.
- Linha de base no Windows: `npm test` 0 falhas; `npx tsc --noEmit` só os 4
  erros de PixelMeta.

## Review Focus

1. **Link de convite/recuperação aberto em outro aparelho, ou duas vezes**: o
   primeiro uso entra; o segundo cai numa tela que explica que o link já foi
   usado e oferece mandar outro — nunca erro genérico. → Task 4.
2. **`next` adulterado no link** (`?next=https://outro.site`): só caminho
   relativo começando por `/corretor`; qualquer outra coisa vai para
   `/corretor`. → Task 4.
3. **E-mail já usado em outro grupo**: o gestor recebe "esse e-mail já tem
   acesso à plataforma", sem dizer onde. → Task 5.
4. **Conta antiga `@nexthome.com`** (domínio de terceiro): não recebe convite
   nem recuperação; a tela pede para trocar o e-mail primeiro. → Task 5.
5. **Chave pública lendo `corretores`**: com e-mail real gravado, `anon` não
   pode ler `email`, `user_id` nem `deve_trocar_senha`; o site continua
   mostrando a equipe. → Task 2.

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0186_grupos_da_plataforma.sql` | Colunas de `grupos`, slug de DNS, `criar_grupo`, `admin_eventos` com ator da plataforma |
| `supabase/migrations/0187_corretores_sem_dado_pessoal_publico.sql` | Recorte de colunas de `corretores` para `anon` |
| `src/lib/grupos/slugDoGrupo.ts` | Regra pura do slug (DNS + reservados), espelhada no SQL |
| `src/lib/guardas.ts` | `exigirAdminDaPlataformaNaPagina` / `…NaAcao` |
| `src/app/plataforma/**` | Área do administrador: layout, lista de grupos, criar grupo, ações |
| `src/lib/auth/links.ts` | Gerar link de convite/recuperação e montar a URL de volta |
| `src/lib/auth/emailsDeAcesso.ts` | Texto dos e-mails de convite e recuperação |
| `src/app/auth/confirmar/route.ts` | `verifyOtp` e redirecionamento seguro |
| `src/app/corretor/definir-senha/**` | Definir senha depois do convite/recuperação |
| `src/app/corretor/esqueci-a-senha/**` | Pedir link de recuperação |
| `src/app/corretor/(painel)/admin/acoes.ts`, `contas/ContasManager.tsx` | Gestor convida, reenvia, troca e-mail, manda link de senha |
| `src/lib/corretores/credenciaisIniciais.ts` | Sai a fábrica de `@nexthome.com`; fica só `ehEmailDeAcesso` |
| `src/lib/corretorSessao.ts`, `_componentes/navegacao.tsx` | Tipo do grupo na sessão e no menu |
| `docs/CONVITE-E-EMAIL.md` | Passo a passo do Matheus: Resend, DNS, URLs do Auth |

---

### Task 1: `grupos` da plataforma e `criar_grupo` (0186)

**Files:**
- Create: `supabase/migrations/0186_grupos_da_plataforma.sql`, `src/lib/grupos/slugDoGrupo.ts`
- Modify: `src/lib/supabase/types.ts`, `src/lib/grupos/funcoesSeguras.ts` (se `criar_grupo` entrar em `FUNCOES_SEM_GRUPO`)
- Test: `src/lib/grupos/slugDoGrupo.test.ts`, `src/lib/grupos/plataforma.db.test.ts`

**Interfaces:**
- Produces (SQL), em `grupos`: `plano text not null default 'imobiliaria' check
  (plano in ('essencial','profissional','imobiliaria','custo'))`; `situacao
  text not null default 'ativo' check (situacao in
  ('ativo','suspenso','encerrado'))`; `contato_cobranca_nome text`,
  `contato_cobranca_email text`, `contato_cobranca_telefone text`;
  `razao_social text`, `documento text` (CNPJ ou CPF, só dígitos),
  `creci text`, `creci_tipo text check (creci_tipo in ('J','F'))`,
  `encarregado_lgpd_nome text`, `encarregado_lgpd_email text`;
  `criado_por uuid references auth.users(id) on delete set null`. O grupo 1
  recebe `plano = 'custo'`. Nenhuma coluna nova tem grant para `authenticated`
  além do SELECT que a 0181 já dá (só a chave de serviço grava).
- Slug: `check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$')` e função
  `public.slug_de_grupo_reservado(p_slug text) returns boolean` (imutável)
  com a lista: `www, app, api, admin, plataforma, painel, corretor, corretores,
  auth, login, entrar, mail, email, smtp, suporte, ajuda, status, blog, docs,
  static, cdn, assets, teste, testes, dev, staging, next-home, nexthome`.
  `slugDoGrupo.ts` exporta `validarSlugDoGrupo(slug: string): { ok: true } |
  { ok: false; motivo: 'formato' | 'reservado' }` e
  `SLUGS_DE_GRUPO_RESERVADOS` — a mesma lista; teste compara as duas.
- Função `public.criar_grupo(p_nome text, p_slug text, p_tipo text, p_plano
  text, p_contato jsonb, p_criado_por uuid) returns uuid`, `security definer`,
  `set search_path = public`, EXECUTE só para `service_role` (revogada de
  `public`, `anon`, `authenticated`). Numa transação: valida slug (formato,
  reservado, livre), insere em `grupos`, copia a linha de `parametros_credito`
  do grupo 1 para o grupo novo e cria a linha de `fiscal_config` do grupo
  (vazia), e grava `admin_eventos` `acao = 'grupo_criado'`.
- `admin_eventos`: nova coluna `ator_plataforma_user_id uuid references
  auth.users(id) on delete set null`; CHECK de `acao` ganha `grupo_criado`,
  `convite_enviado`, `convite_reenviado`, `email_alterado`,
  `link_de_senha_enviado`, mantendo os 7 de hoje.

- [ ] **Step 1: Testes que falham.**
  - `slugDoGrupo.test.ts`: `"aceita imobiliaria-silva"`; `"recusa maiúscula,
    acento, espaço, hífen no começo/fim, 1 letra e 64+ letras"` (motivo
    `formato`); `"recusa www e plataforma"` (motivo `reservado`); `"a lista do
    TS é a mesma do SQL"` (lê a 0186 e compara os nomes).
  - `plataforma.db.test.ts` (`describe.skipIf(!process.env.DB_TESTE_URL)`,
    transação desfeita): `"criar_grupo cria grupo, taxas e fiscal"` (pela role
    `service_role`; `parametros_credito` do novo = valores do grupo 1;
    `fiscal_config` existe; `admin_eventos` com `grupo_criado`);
    `"criar_grupo recusa slug reservado, fora do formato e repetido"`;
    `"logado não executa criar_grupo"` (como gestor → `permission denied`);
    `"grupo 1 está no plano custo"`; `"evento com acao nova é aceito"`.
- [ ] **Step 2:** `npm run db:teste`; rodar os dois arquivos. Esperado: FAIL.
- [ ] **Step 3:** Escrever a 0186 e `slugDoGrupo.ts`; `types.ts` à mão.
- [ ] **Step 4:** Recriar o banco; os testes passam; `npm test` e `npx tsc
  --noEmit` na linha de base. Provocar a guarda "mesma lista" (tirar um nome
  do SQL), md5, ver reprovar, desfazer.
- [ ] **Step 5:** Commit `"0186: grupos da plataforma e criar_grupo"`.

---

### Task 2: E-mail real não fica público (0187)

**Files:**
- Create: `supabase/migrations/0187_corretores_sem_dado_pessoal_publico.sql`
- Modify: toda leitura de `corretores` pela chave pública que hoje usa `*` ou
  pede uma coluna que sai (procurar em `src/lib/catalogo/`, `src/lib/queries.ts`,
  `src/app/(institucional)/**`, `src/app/(vitrine)/**`)
- Test: `src/lib/grupos/plataforma.db.test.ts`, guarda nova em `src/lib/corretores/colunasPublicas.test.ts`

**Interfaces:**
- `revoke select on public.corretores from anon;` e `grant select (<colunas
  públicas>) on public.corretores to anon;`, onde colunas públicas = todas as
  que o site lê hoje, **menos** `email`, `user_id`, `deve_trocar_senha`
  (liste-as no comentário da migration). `authenticated` não muda.
- Exporte de um módulo novo `src/lib/corretores/colunasPublicas.ts` a
  constante `COLUNAS_PUBLICAS_DE_CORRETOR: string` (a lista para o `.select`),
  usada por toda leitura pública de corretores.

- [ ] **Step 1: Testes que falham.** Banco: `"anon não lê email de
  corretores"` (`select email from corretores` como `anon` → `permission
  denied`); `"anon lê a lista pública"` (select das colunas públicas como
  `anon` → ok). Guarda (vitest, lê código sem comentários): leitura de
  `.from("corretores")` em arquivos do site público usa
  `COLUNAS_PUBLICAS_DE_CORRETOR`, nunca `"*"`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Migration, constante e ajuste dos `select`.
- [ ] **Step 4:** Banco recriado; `npm test`; `npx tsc --noEmit`; `npx next
  build` contra o banco local (o build lê o catálogo — confira as variáveis do
  `db:teste`) para provar que o site público monta. Provocar a guarda.
- [ ] **Step 5:** Commit `"0187: dado pessoal do corretor fora da chave pública"`.

---

### Task 3: Guarda e área `/plataforma`

**Files:**
- Modify: `src/lib/guardas.ts`, `src/proxy.ts` (exigir sessão em `/plataforma/*`),
  `src/lib/grupos/servicoComGrupo.test.ts` (categoria nova)
- Create: `src/app/plataforma/layout.tsx`, `src/app/plataforma/page.tsx`
  (lista de grupos), `src/lib/plataforma/grupos.ts` (leituras)
- Test: `src/lib/plataforma/grupos.test.ts`, `src/lib/guardas.test.ts` (ou o
  arquivo de teste de guardas que existir)

**Interfaces:**
- `exigirAdminDaPlataformaNaPagina(): Promise<{ userId: string }>` (chama
  `notFound()` se não for) e `exigirAdminDaPlataformaNaAcao(): Promise<{ userId:
  string } | { erro: string }>` — decidem pela **sessão** (`rpc("eh_admin_da_plataforma")`
  com o cliente de servidor), nunca pela chave de serviço. Não dependem de
  ficha em `corretores` (o administrador pode não ser corretor).
- `listarGruposDaPlataforma(): Promise<ResumoDeGrupo[]>` em
  `src/lib/plataforma/grupos.ts`, com `ResumoDeGrupo = { id, nome, slug, tipo,
  plano, situacao, criadoEm: string, corretoresAtivos: number, comLogin:
  number, numerosConectados: number }`. Lê pela chave de serviço; só colunas
  de cadastro e contagens (head/count), nada de conversa nem lead.
- Categoria nova na guarda `servicoComGrupo`: `plataforma-admin` — o arquivo
  lê vários grupos de propósito e só pode chamar `createServiceClient()`
  depois de `exigirAdminDaPlataforma*` no mesmo ponto de entrada (a guarda
  confere a ordem). `src/lib/plataforma/grupos.ts` recebe o resultado da
  guarda como parâmetro (`(_prova: { userId: string })`) para o chamador não
  poder esquecê-la.
- Layout próprio, simples, no estilo do painel (tokens existentes), com a
  frase fixa "Esta área mostra cadastro e números, nunca conversas nem fichas".

- [ ] **Step 1: Testes que falham.** `"guarda recusa quem não é administrador"`
  e `"aceita sem ficha de corretor"` (cliente falso); `"listar grupos não lê
  tabela de conversa nem de lead"` (cliente falso registra as tabelas
  consultadas; só `grupos`, `corretores`, `corretor_whatsapp_instancias`);
  guarda `servicoComGrupo` reprova arquivo `plataforma-admin` sem a guarda
  antes do `createServiceClient`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar guarda, proxy, leituras e a página de lista.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`; provocar a guarda de ordem.
- [ ] **Step 5:** Commit `"Área da plataforma guardada por eh_admin_da_plataforma"`.

---

### Task 4: Links de acesso — convite e recuperação

**Files:**
- Create: `src/lib/auth/links.ts`, `src/lib/auth/emailsDeAcesso.ts`,
  `src/app/auth/confirmar/route.ts`, `src/app/corretor/definir-senha/page.tsx`
  + `FormularioDefinirSenha.tsx` + `acoes.ts`,
  `src/app/corretor/esqueci-a-senha/page.tsx` + `acoes.ts`
- Modify: `src/proxy.ts` (liberar `/corretor/esqueci-a-senha`; `/auth/*` fica
  fora da exigência de sessão), `src/app/corretor/entrar/FormularioLogin.tsx`
  (link "Esqueci a senha"), `src/lib/email.ts` (remetente padrão)
- Test: `src/lib/auth/links.test.ts`, `src/app/auth/confirmar/confirmar.test.ts`,
  `src/app/corretor/esqueci-a-senha/esqueci.test.ts`

**Interfaces:**
- `gerarLinkDeAcesso(tipo: 'invite' | 'recovery', email: string, next:
  string): Promise<{ ok: true; url: string; userId: string } | { ok: false;
  motivo: 'email_em_uso' | 'email_de_acesso' | 'falha' }>` — usa
  `auth.admin.generateLink({ type, email, options: { redirectTo } })` pela chave
  de serviço e monta a URL **do nosso domínio**
  `${site.url}/auth/confirmar?token_hash=<hashed_token>&type=<tipo>&next=<next>`
  (o `action_link` do Supabase não é usado: ele leva o token no fragmento `#`,
  que o servidor não lê, e depende de PKCE no mesmo navegador).
  `email_de_acesso` = `ehEmailDeAcesso(email)` (domínio de terceiro).
- `enviarLinkDeAcesso(tipo, email, nomeDoGrupo, url)` em `emailsDeAcesso.ts`:
  monta assunto e corpo (texto e HTML simples, em português) e chama
  `enviarEmail`; devolve o desfecho de `enviarEmail` sem lançar.
- Rota `GET /auth/confirmar`: `verifyOtp({ type, token_hash })` com o cliente
  de servidor (grava os cookies da sessão) e redireciona para `next` quando
  `next` é caminho relativo que começa por `/corretor/`; senão para
  `/corretor`. Link inválido/expirado/já usado → `/corretor/entrar?link=expirado`,
  e a tela de entrar mostra "Este link já foi usado ou expirou. Peça outro em
  'Esqueci a senha'."
- `definirSenha(formData)`: exige sessão; senha ≥ 8 e confirmação igual;
  `auth.updateUser({ password })`; zera `corretores.deve_trocar_senha`;
  redireciona para `/corretor`. Não pede a senha atual (quem chega por convite
  não tem).
- `pedirLinkDeSenha(formData)`: público; para qualquer e-mail responde a mesma
  frase ("Se houver uma conta com este e-mail, enviamos um link."); só gera e
  envia se existir conta e não for `ehEmailDeAcesso`; nunca revela o desfecho.
- O convite e a recuperação apontam `next` para `/corretor/definir-senha`.

- [ ] **Step 1: Testes que falham.**
  - **Review Focus 2:** `"next externo vira /corretor"` (`https://x.com`,
    `//x.com`, `/plataforma`, `javascript:` → `/corretor`; `/corretor/leads` →
    mantém).
  - **Review Focus 1:** `"link inválido ou usado leva a entrar com
    link=expirado"` (cliente falso com `verifyOtp` devolvendo erro).
  - `"gerarLinkDeAcesso monta a URL do nosso domínio com token_hash"`;
    `"recusa endereço de acesso @nexthome.com"`.
  - `"esqueci a senha responde igual exista ou não a conta"`.
  - `"definirSenha recusa senha curta e confirmação diferente; zera
    deve_trocar_senha"`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Ler o guia de route handlers em
  `node_modules/next/dist/docs/` antes da rota.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`. Teste manual contra o
  Supabase local: gerar um link de convite para um usuário de teste, abrir a
  URL no navegador local, definir a senha e entrar (registre no relatório).
- [ ] **Step 5:** Commit `"Convite e recuperação de senha por link no nosso domínio"`.

---

### Task 5: Gestor convida em vez de entregar senha

**Files:**
- Modify: `src/app/corretor/(painel)/admin/acoes.ts`,
  `src/app/corretor/(painel)/admin/contas/ContasManager.tsx`,
  `src/lib/corretores/credenciaisIniciais.ts` (+ teste),
  `src/app/corretor/actions.ts` (comentário falso do "banner", linhas 55–58)
- Test: `src/app/corretor/(painel)/admin/convite.test.ts`

**Interfaces:**
- `criarAcessoCorretor(corretorId, email)` passa a chamar
  `gerarLinkDeAcesso('invite', …)`, vincular `user_id`/`email` (com a
  compensação atual se o vínculo falhar), gravar `admin_eventos`
  `convite_enviado` e chamar `enviarLinkDeAcesso`. Devolve `{ ok: true;
  enviado: boolean; url?: string }` — `url` só quando o e-mail não saiu
  (`sem_chave`/`recusado`/`rede`), para o gestor copiar e mandar pelo WhatsApp.
- Novas actions: `reenviarConvite(corretorId)` (convite ainda não aceito:
  `auth.users.last_sign_in_at` nulo → `invite`; senão → `recovery`),
  `trocarEmailDoCorretor(corretorId, emailNovo)` (confere
  `email_de_acesso_livre`; `auth.admin.updateUserById({ email, email_confirm:
  true })` + `corretores.email`; `admin_eventos` `email_alterado`; depois manda
  link `recovery`), `enviarLinkDeSenha(corretorId)` (substitui
  `redefinirSenhaCorretor`: `recovery` + `link_de_senha_enviado`). Todas com
  `exigirGestorNaAcao` e conferência de `grupo_id`.
- **Saem:** `criarAcessosQueFaltam`, `senhaTemporaria`, `senhaInicial`,
  `emailInicial`, `candidatosDeEmail`, `DOMINIO_ACESSO`/`PREFIXO_SENHA`
  (fica `ehEmailDeAcesso`, que continua recusando o domínio de terceiro), o
  `CartaoLote` e o `CartaoCredencial` de senha. A tela passa a mostrar
  "Convite enviado para <e-mail>" ou, sem e-mail configurado, o link com o
  botão "Copiar link" e a frase "o e-mail não está configurado; mande este
  link ao corretor pelo WhatsApp. Ele vale por 24 horas.".
- Todo insert em `admin_eventos` destas actions lê o `{ error }` e loga com
  `console.error` (sem e-mail completo).
- **Review Focus 3:** e-mail ocupado em qualquer grupo → "Esse e-mail já tem
  acesso à plataforma. Use outro." **Review Focus 4:** conta com
  `@nexthome.com` → a linha mostra "Este acesso usa um endereço provisório.
  Troque o e-mail para mandar o link." e só oferece "Trocar e-mail".

- [ ] **Step 1: Testes que falham** (clientes falsos para Auth e e-mail):
  `"convidar vincula, registra e devolve link quando o e-mail não sai"`;
  `"convidar não revela o grupo de um e-mail em uso"`; `"conta @nexthome.com
  só oferece trocar e-mail"`; `"reenviar usa invite antes do primeiro login e
  recovery depois"`; `"trocar e-mail confere o grupo do corretor"`; guarda:
  `"nenhum arquivo cria e-mail @nexthome.com nem senha derivada"` (lê
  `src/`). Atualizar as guardas de `credenciaisIniciais.test.ts` que deixam
  de fazer sentido (reescrever, nunca apagar sem dizer por quê).
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`. Provocar a guarda do
  `@nexthome.com`.
- [ ] **Step 5:** Commit `"Gestor convida por e-mail; acabou a senha provisória"`.

---

### Task 6: Criar grupo e primeiro acesso pela plataforma

**Files:**
- Create: `src/app/plataforma/grupos/novo/page.tsx` + `FormularioNovoGrupo.tsx`,
  `src/app/plataforma/acoes.ts`, `src/app/plataforma/grupos/[id]/page.tsx`
  (dados do grupo, editar contato e institucionais)
- Test: `src/app/plataforma/acoes.test.ts`, `src/lib/grupos/plataforma.db.test.ts`

**Interfaces:**
- `criarGrupoComPrimeiroAcesso(dados)` com `exigirAdminDaPlataformaNaAcao`:
  valida (`validarSlugDoGrupo`, e-mail, plano, tipo), chama
  `rpc('criar_grupo', …)` pela chave de serviço com `p_criado_por = userId`,
  insere o primeiro corretor com `grupo_id` explícito e `papel = 'gestor'`
  (independente também é gestor do próprio grupo, §18), e convida (mesmo
  caminho da Task 5, parametrizado pelo grupo — sem `exigirGestorNaAcao`).
  Falha no convite ou no corretor → apaga o que criou (grupo, corretor,
  usuário do Auth) e devolve o erro; o slug fica livre de novo.
  Evento `admin_eventos` com `ator_plataforma_user_id = userId`.
- `editarDadosDoGrupo(id, dados)`: contato de cobrança e dados
  institucionais; plano só muda no próximo ciclo (§20) — nesta frente o
  campo plano fica só de leitura depois de criado.
- Nada na tela de grupo mostra conversa, ficha, lead ou nome de cliente.

- [ ] **Step 1: Testes que falham:** `"cria grupo, gestor e convite numa
  operação"`; `"falha no convite desfaz grupo e corretor"`; `"independente
  nasce gestor"`; `"slug reservado é recusado antes de chamar o banco"`;
  `"quem não é administrador não cria grupo"`; banco: `"grupo criado pela
  plataforma tem taxas e fiscal"` (reaproveita a Task 1).
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`. Teste manual no Supabase
  local: cadastrar o próprio usuário em `administradores_da_plataforma`,
  criar um grupo de teste, abrir o link de convite e entrar como o gestor
  novo (registre no relatório).
- [ ] **Step 5:** Commit `"Plataforma cria grupo com o primeiro acesso"`.

---

### Task 7: Tipo do grupo na sessão e no menu

**Files:**
- Modify: `src/lib/corretorSessao.ts`, `src/app/corretor/(painel)/layout.tsx`,
  `src/app/corretor/(painel)/_componentes/navegacao.tsx`, `NavPainel.tsx`,
  `GavetaLateral.tsx`, `navegacao.test.ts`
- Test: `navegacao.test.ts`

**Interfaces:**
- `CorretorSessao` ganha `tipoDoGrupo: 'imobiliaria' | 'independente'`.
- `ItemNav`/`SubItemNav` ganham `equipe?: boolean`; `gruposVisiveis(ehGestor:
  boolean, tipoDoGrupo: 'imobiliaria' | 'independente')` esconde os itens
  `equipe` no grupo de uma pessoa: Leads da equipe, Ranking de VGV,
  Desempenho, Contas (no independente não há a quem convidar). Esconder não é
  bloquear (§10): as rotas continuam existindo.

- [ ] **Step 1: Testes que falham:** `"independente não vê itens de equipe"`;
  `"imobiliária vê tudo como antes"` (snapshot da lista atual para gestor e
  corretor); teto de destinos continua valendo.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `"Menu do independente sem ferramentas de equipe"`.

---

### Task 8: Instruções para ligar o e-mail, vault e MEMORIA

**Files:**
- Create: `docs/CONVITE-E-EMAIL.md`
- Modify: `docs/MEMORIA.md`, nota nova em `vault/10-notas/` + MOC

**Conteúdo de `docs/CONVITE-E-EMAIL.md`** (para o Matheus, português simples):
criar conta no Resend; verificar `nexthomeimoveis.com` (registros que o
Resend mostra, no DNS da Hostinger); `RESEND_API_KEY` e `EMAIL_REMETENTE` na
Vercel e redeploy; no Supabase (Authentication → URL Configuration): Site URL
e Redirect URLs incluindo `<site>/auth/confirmar`; validade do link de
convite (24h) e de recuperação; como se cadastrar como administrador da
plataforma (um `insert into administradores_da_plataforma` com o
`user_id` dele, pelo SQL Editor); como testar o convite de ponta a ponta.

- [ ] **Step 1:** Escrever o documento e conferir cada nome de tela/campo
  citado contra o código (rotas, variáveis).
- [ ] **Step 2:** MEMORIA e vault: o que custou tempo nesta frente
  (`action_link` com token no `#` × `token_hash`; anon lendo e-mail de
  `corretores`; e o que mais aparecer nos relatórios).
- [ ] **Step 3:** Commit `"Como ligar convite e e-mail; MEMORIA e vault"`.

---

## Fora desta frente

- Medidor, cotas e custo real por resposta → Fase 2B.
- Cobrança, vencimento, suspensão automática e o efeito da suspensão → Fase 2C.
- Pode-operar único, teto por corretor, aceite de termos, número único entre
  grupos, suporte, saúde por grupo → Fase 2D.
- Usar os dados institucionais do grupo no rodapé/JSON-LD/privacidade → Fase 3
  (depende de resolver o grupo pelo endereço).
