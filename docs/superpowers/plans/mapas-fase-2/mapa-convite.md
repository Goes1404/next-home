# Fase 2 — mapa: cadastro e convite de corretor com e-mail real

> **Numeração (20/10/2026):** este documento foi escrito com a numeração antiga. A fase 1 (0181–0185) virou **0190–0194** (0181→0190, 0182→0191, 0183→0192, 0184→0193, 0185→0194) e a fase 2 (0186, 0187) virou **0195** e **0196**. Os números abaixo, inclusive as referências `arquivo:linha`, são os antigos.

Branch `fase-1-multi-grupo`, lido em 19/10/2026. Só leitura. Caminhos relativos a
`C:/Users/User/nexthome/next-home`. `(painel)` = `src/app/corretor/(painel)`.

Fontes do desenho: `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
§2 (papéis), §10 (ferramentas de equipe escondidas em grupo de uma pessoa), §11
(painel da plataforma cria grupo + primeiro gestor), §18 "Fase 2" (convite, login,
canal com o cliente, grupo de uma pessoa, aceite de termos, mesmo número), §19 resp. 2
(e-mail real com convite e "esqueci a senha"; `nome@nexthome.com` deixa de ser criado)
e resp. 4 (número único entre grupos).

---

## 1. O que existe hoje

### 1.1 Ações do gestor — `(painel)/admin/acoes.ts`

| Símbolo | Linha | O que faz |
|---|---|---|
| `ALFABETO` / `senhaTemporaria(12)` | 34, 43-48 | senha aleatória gerada no servidor (sem 0/O/l/1) |
| `slugificar` → `normalizarParaEmail` | 51-56 | slug sai da mesma normalização do e-mail (guarda em `credenciaisIniciais.test.ts`) |
| `slugDisponivel` | 68-83 | RPC `slug_de_corretor_livre` (0183), 50 tentativas, erro → sufixo de tempo |
| `emailDeAcessoLivre` | 91-101 | RPC `email_de_acesso_livre` (0183); erro conta como ocupado |
| `criarAcessoCorretor(corretorId, email, senhaEscolhida?)` | 115-209 | `exigirGestorNaAcao` → lê ficha (confere `grupo_id` = do gestor, 144) → slug antes do login (152) → `servico.auth.admin.createUser({email, password, email_confirm: true})` (159-163) → update `corretores` {user_id, email, slug, `deve_trocar_senha: true`, grupo_id} com filtro de grupo (176-186) → se falhar, `deleteUser` compensatório (194) → `admin_eventos` `conta_criada` sem senha (198-204) → devolve a senha em claro UMA vez (208) |
| `cadastrarCorretor(dados)` | 211-261 | **insert em `corretores` EXISTE** (desde 07/10): valida nome/CRECI/WhatsApp/e-mail, slug livre, insert pela chave de serviço com `grupo_id` do gestor (245-249), depois `criarAcessoCorretor`; se o acesso falha, apaga a ficha (257) |
| `criarAcessosQueFaltam()` | 295-374 | lote para todo ativo sem `user_id` do grupo; e-mail = `candidatosDeEmail(nome, slug)` + `@nexthome.com`; senha = `senhaInicial(whatsapp)` = `nexthome` + 4 últimos dígitos (355) |
| `redefinirSenhaCorretor(corretorId)` | 377-411 | `auth.admin.updateUserById(..., {password})` (398) + `deve_trocar_senha: true` (401) + evento `senha_redefinida`; senha volta em claro |
| `alterarPapelCorretor` | 420-438 | RPC `definir_papel_corretor` (sessão do gestor; 0183:~440-468, grava `papel_alterado`) |
| `alternarAtivoCorretor` | 441-469 | update pela sessão + `admin_eventos` |
| `alternarSoWhatsapp` | 480-526 | chave de serviço, filtro de grupo |
| `redistribuirCarteira` | 546-676 | repasse com linha `repasse` antes do update |
| `traduzirErroBanco` | 679-693 | mensagens do gatilho/função |

Regra declarada (25-28): o cliente de serviço nunca decide quem pode; quem decide é
`exigirGestorNaAcao()` (`src/lib/guardas.ts:44-51`, devolve `{corretor}` com `grupoId`).

### 1.2 Tela — `(painel)/admin/contas/ContasManager.tsx` (538 linhas) e `page.tsx`

- `page.tsx:11-12`: `exigirGestorNaPagina()` + `getCorretoresParaAdmin()` (`src/lib/corretorSessao.ts:610`, select `id, nome, slug, email, papel, ativo, em_pausa, user_id`, `temLogin = user_id !== null`).
- `CartaoCredencial` (29-80): texto para copiar com `Site: <origin>/corretor/entrar`, e-mail e "Senha provisória" (32); "esta senha não aparece de novo".
- `LinhaCorretor` (83-…): campo e-mail para "Criar acesso" (94, 100, 207-210), "Redefinir senha" com `confirm` (110-113, 239).
- `CartaoLote` (279-…): copia todos os acessos com senha (286).
- `NovoCorretor` (356-~430): formulário nome/CRECI/WhatsApp/"E-mail de acesso" → `cadastrarCorretor` (379); texto promete "passa a receber leads da roleta" e "senha provisória aparece uma vez" (405-406).
- Botão do lote (~452-505): conta `ativo && !temLogin` — guarda em `credenciaisIniciais.test.ts:142-160` exige a mesma condição na tela e na action.

### 1.3 Credenciais derivadas — `src/lib/corretores/credenciaisIniciais.ts` (puro)

- `DOMINIO_ACESSO = "nexthome.com"` (24) — domínio de TERCEIRO (72.20.123.54).
- `PREFIXO_SENHA = "nexthome"`, `DIGITOS_DA_SENHA = 4` (27, 30).
- `normalizarParaEmail` (40-48), `emailInicial` (57-61), `candidatosDeEmail` (75-88), `senhaInicial` (97-105), `ehEmailDeAcesso` (108-110).
- Testes: `credenciaisIniciais.test.ts` (205 linhas): formato, guarda "e-mail nunca sai para endereço de acesso" lendo `email.ts` (119-138), "botão promete o mesmo número" (142-160), "uma normalização só" (168-205).

### 1.4 E-mail — `src/lib/email.ts`

- Único caminho de e-mail; Resend por `fetch` (`ENDERECO_API`, 31), sem SDK.
- `REMETENTE_PADRÃO = "Next Home <avisos@nexthomeimobiliaria.com.br>"` (34); env `EMAIL_REMETENTE` sobrepõe (93).
- Ordem: sem `@` → `sem_destinatario` (57); `ehEmailDeAcesso` → `endereco_de_acesso` (71-76, ANTES do fetch, guardado por teste); sem `RESEND_API_KEY` → `sem_chave` (78-83); HTTP != 2xx → `recusado`; exceção → `rede`. Nunca lança; timeout 8 s (101).
- Chamadores: `api/cron/quem-esta-esperando/route.ts:167`, `api/cron/relatorio-semanal/route.ts:116`, `lib/whatsapp/avisoDeQueda.ts:248`. Os dois crons de e-mail estão DESAGENDADOS (MEMORIA 03/09) e a chave está ausente.
- Remetente fixo "Next Home": marca por grupo nos e-mails é item da fase 3 (§18).

### 1.5 Login e troca de senha — `src/app/corretor/actions.ts`

- `entrar` (35-72): `signInWithPassword`; depois lê `corretores.deve_trocar_senha` e redireciona para `/corretor/senha` (60-69).
- Comentário 55-58 afirma "o banner do painel continua lembrando" — **não existe banner**: `deve_trocar_senha` só é lido em `actions.ts:64` (grep em `src/`). Comentário desatualizado.
- `trocarSenha` (286-331): exige senha ATUAL (`signInWithPassword` em 307-313), mínimo 8 caracteres (296), `auth.updateUser({password})` (317), zera `deve_trocar_senha` (324-327; grant da 0030:22).
- Tela `(painel)/senha/page.tsx` (+ `FormularioSenha.tsx`, `useActionState(trocarSenha)`); item "Trocar senha" no menu da conta (`navegacao.tsx:319`).
- `src/app/corretor/entrar/page.tsx` + `FormularioLogin.tsx`: não há link "esqueci a senha" (grep vazio). O comentário de `FormularioLogin.tsx:8` e 98 assume senha provisória do gestor.
- `getEmailLogado` (`corretorSessao.ts:101-105`) lê `claims.email`.

### 1.6 Proxy e rotas de Auth

- `src/proxy.ts:55-56`: `precisaLogin` = toda `/corretor/*` exceto `/corretor/entrar`; sem sessão → redirect (70-73). Matcher (105) exclui `api/` e caminhos com ponto.
- **Não existe** rota de retorno de Auth: grep por `exchangeCodeForSession`, `verifyOtp`, `auth/callback`, `auth/confirm`, `PASSWORD_RECOVERY` em `src/` = vazio.
- `@supabase/ssr ^0.12.4`, `@supabase/supabase-js ^2.111.0` (`package.json:34-35`); cliente de servidor `src/lib/supabase/server.ts` (cookies); serviço `src/lib/supabase/service.ts:32` sem sessão.
- `supabase/config.toml` (só ambiente local): `site_url = http://127.0.0.1:3000` (163), `additional_redirect_urls` (167), `enable_signup = true` (181, 225), `minimum_password_length = 6` (186), `rate_limit.email_sent = 2` (203), `enable_confirmations = false` (230), SMTP comentado (241-248), templates `invite` comentados (251-253). A configuração do projeto de produção mora no painel do Supabase, não aqui.

### 1.7 Banco

- `corretores` (types.ts:1309-1340): `email text null`, `user_id`, `deve_trocar_senha bool`, `papel text`, `ativo`, `so_whatsapp`, `slug`, `grupo_id not null`.
- Sem policy de INSERT em `corretores` (comentário `admin/acoes.ts:216-219`); insert só pela chave de serviço.
- `corretores` tem a policy "corretores sao publicos" `for select using (true)` (0001_init.sql:155), sem recorte de coluna: **`email`, `user_id`, `deve_trocar_senha` são legíveis pela chave `anon`** (0181:92-94 adia o recorte para a fase 3; 0184 só põe `isolamento_por_grupo` `to authenticated`).
- `grupos` (0181:55-61): `id, nome, slug unique, tipo in ('imobiliaria','independente'), criado_em`. **Não tem** `situacao`, plano, contato de cobrança, dados institucionais. Leitura: só o próprio grupo (0181:213-224); escrita só chave de serviço.
- `administradores_da_plataforma` + `eh_admin_da_plataforma()` (0181:239-264); nenhum código em `src/` chama a função (grep: só textos com a palavra "plataforma").
- Gatilho `corretores_00_grupo` → `carimbar_grupo_do_corretor` (0181:165-202): grupo informado > `grupo_atual()` > único grupo (warning) > **erro com 2+ grupos**. Pela chave de serviço não há `grupo_atual()`.
- `garantir_gestor_remanescente` (0183, gatilho `before update` desde 0030:88-90): impede despromover/desativar/mudar de grupo o último gestor ativo DO GRUPO. Só UPDATE — insert de gestor novo não passa por ele.
- `email_de_acesso_livre(p_email)` (0183:241-262): só gestor (`eh_gestor()`), olha `corretores.email` e `auth.users.email` em todos os grupos, devolve sim/não; listada em `FUNCOES_SEM_GRUPO` (`src/lib/grupos/funcoesSeguras.ts:38`); testes `isolamento.db.test.ts:1299-1317`, `funcoesSeguras.test.ts:69`.
- `admin_eventos` (0030:28-38): `ator_id → corretores` (on delete set null); CHECK de `acao` = 7 valores (0134:124-135: `conta_criada, senha_redefinida, papel_alterado, corretor_desativado, corretor_reativado, leads_redistribuidos, numero_desconectado`); `grupo_id` anulável só para evento da plataforma com `detalhes.origem = 'plataforma'` vindo de `service_role`/admin da plataforma (0182:252-272, 296-300); grupo nulo fica invisível a todo logado (0184:95-97). Policy de leitura: gestor (0030:45). Sem policy de INSERT.
- Os inserts em `admin_eventos` do código (`admin/acoes.ts:198, 402, 459, 655`; `admin/whatsapp/acoes.ts:58`) **não leem o erro**: valor fora do CHECK falha calado.

### 1.8 Sessão e guardas

- `getCorretorLogado` (`corretorSessao.ts:59-87`): `getClaims()`; sem ficha, sem `slug` ou `ativo=false` → `null` ("conta sem vínculo"). Carrega `papel`, `grupoId`. **Não carrega `grupos.tipo`**.
- `exigirGestorNaPagina` / `exigirGestorNaAcao` (`guardas.ts:33-51`). Login sem ficha em `corretores` (ex.: admin da plataforma puro) cai em "sem vínculo".

### 1.9 Menu — `(painel)/_componentes/navegacao.tsx` (936 linhas)

- `SubItemNav.gestor?` (45), `ItemNav.gestor?` (61); nenhum flag por tipo de grupo.
- Financeiro (181-193): `Vendas`, `Extrato e meta` (todos), `Caixa`/`Resultado`/`Fiscal`/`Contador`/`Alertas e IA`/`Desempenho` (gestor), **`Ranking de VGV` sem `gestor`** (192).
- Administração (279-299, `gestor: true`): Visão geral, Leads da equipe (roleta/pausa/repasse), Contas, WhatsApp da equipe, Construtoras, Parceiros, Preços, Crédito, Marca.
- `gruposVisiveis(ehGestor)` (367-377) é o único filtro; chamado em `NavPainel.tsx:66` e `GavetaLateral.tsx:92`; `ehGestor` vem do layout `(painel)/layout.tsx:51-52, 131, 135`.
- Testes: `navegacao.test.ts` usa `gruposVisiveis(false|true)` (9, 38, 58, 85); teto de destinos.
- Onde "roleta" aparece na tela: `admin/leads/page.tsx:35,140`, `admin/leads/TogglePausa.tsx:7` (pausa na escala), `admin/_componentes/ProntidaoDaEquipe.tsx:14`, textos de `ContasManager.tsx:145-146, 405`. A roleta em si é o gatilho `distribuir_lead` no banco.
- "Comissão": páginas de `(painel)/financeiro/*` (caixa, extrato, resultado, contador, FormularioVenda com `participantes`/co-corretagem 35-41), `leads/[id]/VendaDoLead.tsx`, `_componentes/graficos/PlacarDaEquipe.tsx`, `desempenho/MetasDaEquipe.tsx`. `financeiro/ranking/page.tsx:43-48` usa só `getCorretorLogado` (sem guarda de gestor).
- §10: "não existe bloqueio de função, só medidor" — esconder é do menu, as rotas continuam alcançáveis por URL.

### 1.10 Conexão do número — `(painel)/whatsapp/acoes.ts`

- `conectarWhatsapp(telefone?)` (289-~340): sessão → `nomeInstanciaDe(corretor.slug)` → provedor → upsert em `corretor_whatsapp_instancias` pela chave de serviço. Não consulta aceite de termos nem unicidade do número entre grupos.

---

## 2. O que NÃO existe e precisa ser criado

1. **Rota de retorno de Auth** (ex.: route handler `verifyOtp({ type, token_hash })` ou `exchangeCodeForSession`), fora do bloqueio do proxy (`proxy.ts:56` só libera `/corretor/entrar`; `api/` já fica fora do matcher).
2. **Tela "definir senha"** para quem chega por convite/recuperação: `trocarSenha` exige a senha atual (307-313) e não serve; precisa de action que aceite `updateUser({password})` com a sessão de recuperação/convite e zere `deve_trocar_senha`.
3. **Tela/ação "esqueci a senha"** a partir de `/corretor/entrar` (link inexistente) — pública, sem revelar se o e-mail existe.
4. **Convite** no lugar de `createUser` com senha: `auth.admin.inviteUserByEmail(email, { redirectTo, data })` (usa o SMTP do Supabase) ou `auth.admin.generateLink({ type: 'invite' | 'recovery', email, options: { redirectTo } })` (devolve `properties.action_link`/`hashed_token` sem enviar; o envio fica com `enviarEmail`). Hoje nada disso é chamado (grep vazio).
5. **Reenviar convite** / convite pendente (estado "convidado, ainda não aceitou") — não há coluna; `temLogin` é só `user_id !== null`.
6. **Criação de grupo + primeiro gestor pelo admin da plataforma**: não há painel, rota nem guarda `exigirAdminDaPlataforma`; `cadastrarCorretor` depende de `guarda.corretor.grupoId` (247), que o admin não tem; o insert com 2+ grupos exige `grupo_id` explícito (gatilho 0181:190).
7. **`grupos.tipo` na sessão e no menu**: campo `tipo` existe, nenhum código lê. Falta carregar no layout/sessão e um filtro (ex.: flag `equipe` em `SubItemNav`/`ItemNav`) em `gruposVisiveis`.
8. **Independente como gestor do próprio grupo**: hoje `cadastrarCorretor` insere sem `papel` (padrão `corretor`) e `definir_papel_corretor` exige um gestor ativo chamando. Para grupo de uma pessoa, o único login precisa nascer `papel='gestor'` no insert.
9. **Caminho independente → imobiliária** (mudar `grupos.tipo`): sem função.
10. **Aceite de termos**: nenhuma tabela/coluna/tela (grep "termos" em `src/` e migrations só acha texto de IA). §18 pede "por usuário antes de conectar o número" → encaixe em `conectarWhatsapp` (`whatsapp/acoes.ts:289`) e na tela de conexão.
11. **Número único entre grupos** (§19 resp. 4): sem trava no banco; `corretor_whatsapp_instancias` não tem índice único de telefone entre grupos.
12. **Contato de cobrança / remetente da plataforma / dados institucionais do grupo**: nenhuma coluna em `grupos`.
13. **Valores novos no CHECK de `admin_eventos`** (convite enviado, convite reenviado, grupo criado, termos aceitos, etc.) e aceitação de ator da plataforma (`ator_id` hoje só `corretores`).
14. **Trocar o e-mail de um corretor** (`auth.admin.updateUserById({ email })` + `corretores.email`): sem ação.

---

## 3. Onde a fase 2 encaixa (pontos exatos)

- `criarAcessoCorretor` `admin/acoes.ts:154-163`: troca `createUser({password, email_confirm})` pelo convite; o bloco de compensação (188-196) continua necessário (o Auth cria o usuário no convite).
- `cadastrarCorretor` `admin/acoes.ts:225-261`: o formulário já pede e-mail real (`ContasManager.tsx:412`); o retorno `{email, senha}` vira "convite enviado".
- `criarAcessosQueFaltam` `admin/acoes.ts:295-374` + `credenciaisIniciais.ts` (`DOMINIO_ACESSO`, `senhaInicial`, `candidatosDeEmail`): é a fábrica de `nome@nexthome.com` que §19 manda parar; o botão do lote em `ContasManager.tsx:~452-505` e a guarda `credenciaisIniciais.test.ts:142-160` andam juntos.
- `redefinirSenhaCorretor` `admin/acoes.ts:377-411`: vira envio de link de recuperação (ou fica como saída de suporte).
- `ehEmailDeAcesso` em `email.ts:71`: continua valendo para as contas antigas `@nexthome.com` que já existem em `auth.users`; a guarda `credenciaisIniciais.test.ts:119-138` exige essa recusa.
- `entrar` `actions.ts:60-69` e `trocarSenha` `actions.ts:286-331`: `deve_trocar_senha` deixa de ser necessário para quem define a senha no convite.
- `proxy.ts:56`: liberar a(s) rota(s) pública(s) de recuperação/definição de senha, se morarem em `/corretor/*`.
- `email_de_acesso_livre` (0183:241): continua sendo a conferência global antes de convidar; só gestor pode chamar — o admin da plataforma, sem ficha, recebe exceção (`eh_gestor()` falso).
- `gruposVisiveis` `navegacao.tsx:367` + `NavPainel.tsx:66` + `GavetaLateral.tsx:92` + `layout.tsx:51-52`: receber o tipo do grupo.
- `getCorretorLogado` `corretorSessao.ts:72`: o select pode trazer `grupos(tipo)` (ou consulta à parte) para a sessão saber o tipo.
- `conectarWhatsapp` `whatsapp/acoes.ts:289`: ponto do aceite de termos e da trava de número único.

---

## 4. Armadilhas (com fonte)

1. **`nexthome.com` é de terceiro** (credenciaisIniciais.ts:19-24; MEMORIA "Acesso em lote (0095)"). Contas antigas com esse e-mail não recebem convite/recuperação; e-mail de recuperação para elas é recusado por `email.ts:71` (desfecho `endereco_de_acesso`). Elas precisam trocar o e-mail antes (§2.14).
2. **Sem e-mail transacional configurado** (§19 resp. 2; `email.ts:20-28`; MEMORIA 03/09 "200 com enviados: 0 é o normal sem chave"). `enviarEmail` falha FECHADO e calado: verificar no log de runtime (`[email] RESEND_API_KEY ausente`), não no status HTTP. Se o convite usar o mailer do próprio Supabase, o SMTP embutido do Supabase é limitado (envio a membros do time e poucos por hora; no `config.toml` local `email_sent = 2`/h): sem SMTP próprio configurado no painel do Supabase, convite e "esqueci a senha" falham para corretores reais.
3. **Remetente padrão é `nexthomeimobiliaria.com.br`** (`email.ts:34`), domínio que, pela MEMORIA (SEO, 27/08 e 15/09), ainda serve o site legado da Migmidia; o domínio novo é `nexthomeimoveis.com` (MEMORIA 04/10). O Resend só envia de domínio verificado. Domínio da plataforma só depois do primeiro pagamento (§19 resp. 3).
4. **`corretores` é legível pela chave `anon` com todas as colunas** (0001:155; MEMORIA 0125/0126: "credencial nunca mora em tabela que o site público lê"). Com e-mail REAL em `corretores.email`, o e-mail pessoal de cada corretor de todos os grupos fica listável pelo PostgREST. Recorte é §15/fase 3; com e-mail real chegando na fase 2, o vazamento passa a ser de dado pessoal.
5. **Link do e-mail precisa estar na allow-list de redirect do Auth** (`site_url`/`additional_redirect_urls`, painel do Supabase em produção). URL do site hoje: `site.url` = `NEXT_PUBLIC_SITE_URL ?? next-home-drab.vercel.app` (`src/lib/site.ts:52`); painel de todos os grupos fica no endereço atual (§19 resp. 3).
6. **PKCE x link gerado pelo admin**: `@supabase/ssr` usa fluxo PKCE; `resetPasswordForEmail` disparado num navegador grava o verificador nos cookies DAQUELE navegador. Link de `generateLink`/`inviteUserByEmail` aberto em outro aparelho não tem verificador; o caminho que não depende disso é `token_hash` + `verifyOtp` num route handler. Com `action_link` padrão o token chega no fragmento `#`, que o servidor não lê.
7. **`trocarSenha` exige a senha atual** (`actions.ts:307-313`): quem chega por recuperação não sabe a atual — reaproveitar a action quebra o fluxo.
8. **Comentário falso do banner** (`actions.ts:55-58`): não há banner de `deve_trocar_senha`. Defeito recorrente nº 5 (texto desatualizado aponta o lugar errado).
9. **Gatilho de grupo com 2+ grupos** (0181:183-190): insert em `corretores` sem `grupo_id` pela chave de serviço passa a ERRO assim que existir o 2º grupo — qualquer caminho novo de criação (painel da plataforma) tem de passar o grupo explicitamente.
10. **Admin da plataforma sem ficha** cai em "sem vínculo" (`corretorSessao.ts:59-87`) e falha em todas as funções que exigem `eh_gestor()` (`email_de_acesso_livre`, `slug_de_corretor_livre`, `definir_papel_corretor`). E `admin_eventos.ator_id` só aceita `corretores(id)`.
11. **CHECK de `admin_eventos.acao` com 7 valores e inserts que ignoram erro** (0134:124-135; `admin/acoes.ts:198,402,459,655`): ação nova sem migration do CHECK some calada do log.
12. **`garantir_gestor_remanescente`** só vale para UPDATE (0030:89-90). Grupo de uma pessoa: o independente não consegue se despromover nem se desativar (é o último gestor) — o que é a regra; mas encerrar/suspender grupo (fase Operação) vai bater nele.
13. **Unicidade de e-mail é global** (Auth; §15 "dois logins são dois e-mails"): `email_de_acesso_livre` responde só sim/não e só a gestor; a mensagem "Já existe uma conta com este e-mail" (`admin/acoes.ts:166-170`) não pode revelar de qual grupo.
14. **Login órfão queima o e-mail** (`admin/acoes.ts:188-196`; MEMORIA 0095): convite também cria o usuário no Auth antes de vincular — a compensação continua obrigatória; e um convite não aceito mantém o e-mail ocupado.
15. **Contagem do botão = contagem da action** (`credenciaisIniciais.test.ts:142-160`; MEMORIA 0095 "aviso prometia 7 e criava 6"): qualquer lote de convites herda a guarda.
16. **Tabela nova** (convites, aceites de termos): revogar `anon` e `authenticated` antes de grant por coluna (`tabelasSeguras.test.ts`; MEMORIA 0116), `grupo_id` + `isolamento_por_grupo` ou entrada em `TABELAS_GLOBAIS` (`src/lib/grupos/tabelasDoGrupo.ts:15-25`) com motivo; função `security definer` nova entra em `FUNCOES_SEM_GRUPO` (`funcoesSeguras.ts`) ou cita o grupo; `types.ts` declarado à mão (regerar apaga as uniões de CHECK).
17. **Cache dos corretores públicos**: as ações chamam `revalidarCorretores()`; dado de corretor mudado fora do painel não aparece no site até virar o cache (MEMORIA 0151, chave `corretores-publicos-v2`).
18. **Esconder ≠ bloquear** (§10): `financeiro/ranking/page.tsx` não tem guarda e continua alcançável por URL; `navegacao.test.ts` (teto de destinos, `gruposVisiveis(false|true)`) muda de assinatura se o filtro ganhar tipo de grupo.
19. **"Ao promover alguém, dizer o que ele passa a LER"** (MEMORIA 12/09): o independente como gestor herda o alcance de `eh_gestor()` — num grupo de uma pessoa o alcance é ele mesmo, mas a regra do ADM que não lê conversa alheia (0134) continua valendo.
20. **Senhas vazadas (advisor do Auth) é recurso do plano Pro do Supabase** (MEMORIA 02/10); mínimo de senha do projeto: tela exige 8 (`actions.ts:296`), local `config.toml:186` = 6.
