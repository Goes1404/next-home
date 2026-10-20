# Fase 2: índice dos mapas

> **Numeração (20/10/2026):** este documento foi escrito com a numeração antiga. A fase 1 (0181–0185) virou **0190–0194** (0181→0190, 0182→0191, 0183→0192, 0184→0193, 0185→0194) e a fase 2 (0186, 0187) virou **0195** e **0196**. Os números abaixo, inclusive as referências `arquivo:linha`, são os antigos.

Junta os cinco mapas `mapa-*.md` desta pasta. Eles foram lidos na branch
`fase-1-multi-grupo` (HEAD 334c337). A branch atual, `fase-2-plataforma`
(fabb1c8), só acrescentou o §20 do desenho ("Decisões do dono para a fase 2"),
então os números de linha continuam valendo. A última migration é a
`0185_pos_deploy_multi_grupo.sql` e a próxima livre é a 0186. Antes de
numerar, conferir `origin/claude/modernizar-plataforma-imobiliaria-2tm13q`.

Desenho: `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`,
§10, §11, §18 "Fase 2" (l.455-490), §19 e §20.

**Ordem que o dono decidiu (§20):** (1) painel da plataforma, criação de grupo
e convite com e-mail real; (2) medidor e cotas, com a medição do custo real por
resposta; (3) cobrança manual e suspensão; (4) o restante: pode-operar único,
teto por corretor, termos, número único, suporte e saúde por grupo.

As frentes abaixo seguem essa ordem.

---

## 1. Painel da plataforma e grupos (`mapa-plataforma.md`)

1. `grupos` tem só `id, nome, slug unique, tipo, criado_em`
   (`0181_grupos.sql:55-61`). Faltam `situacao`, plano, vencimento, contato de
   cobrança e dados institucionais. Logado lê só a linha do próprio grupo, e só
   a chave de serviço escreve (`0181:213-224`).
2. `administradores_da_plataforma` e `eh_admin_da_plataforma()` existem
   (`0181:239-264`), mas **nenhum código em `src/` as chama**. Não há guarda
   `exigirAdminDaPlataforma*` nem rota de painel.
3. Um administrador sem ficha em `corretores` cai em `ContaSemVinculo`, porque
   `getCorretorLogado` devolve `null` (`corretorSessao.ts:78`, layout
   `(painel)/layout.tsx:144-169`). A policy restritiva não abre exceção para
   ele (`0184:41-43`). Por isso o painel da plataforma precisa morar fora do
   layout `(painel)` e ler pela chave de serviço, depois de uma guarda pela
   sessão.
4. O operador não passa nas funções de unicidade (`slug_de_corretor_livre`,
   `email_de_acesso_livre`), que exigem `eh_gestor()` (`0183:233,251`).
   `criarAcessoCorretor` também é preso ao gestor do mesmo grupo
   (`admin/acoes.ts:126,144`). Criar o primeiro gestor exige um caminho novo.
5. Um grupo novo precisa nascer com `parametros_credito` (`0181:282-306`, cópia
   da Next Home) e `fiscal_config` (`0183:109-112`). Sem a linha, o fiscal
   "salva" zero linhas em silêncio (`financeiro/fiscal/acoes.ts:39-52`) e o
   crédito cai no padrão com um `console.warn` (`credito/parametros.ts:54-57`).
6. **Com o 2º grupo criado, todo insert sem `grupo_id` falha.** É o caso do
   gatilho de corretores (`0181:183-190`) e de `derivar_grupo_da_linha`
   (`0182:404-413`). O roteiro da fase 1 exige antes disso a suíte de
   isolamento e o E2E verdes (`docs/ROTEIRO-FASE-1-PRODUCAO.md:1338-1340`).
7. `admin_eventos.ator_id` aponta para `corretores` (`0030:29`), e o CHECK de
   `acao` tem 7 valores, nenhum de plataforma (`0134:124-135`). Os inserts do
   código não leem o erro (`admin/acoes.ts:198,402,459,655`), então uma ação
   nova sem migration do CHECK some do log sem aviso.
8. Os dados institucionais vêm de `site.ts`, uma constante de build igual para
   todos (`site.ts:15-105`), importada por 83 arquivos. Os pontos que o §18
   manda trocar são `Footer.tsx:17-20,38,39,93`,
   `dadosEstruturados.ts:19-86` e `privacidade/page.tsx:12,53`. Já existe
   `cnpj`/`razao_social` por grupo em `fiscal_config`, uma segunda fonte.
9. Arquivo novo com `createServiceClient` precisa entrar no `MAPA` de
   `servicoComGrupo.test.ts:44-58`, e nenhuma categoria atual descreve "lê
   todos os grupos" (`:13-37`).

## 2. Convite e login com e-mail real (`mapa-convite.md`)

1. **O cadastro de corretor JÁ existe.** `cadastrarCorretor` está em
   `admin/acoes.ts:211-261` desde 07/10. O texto do §18 ("não existe insert em
   corretores") está desatualizado. O que falta é o convite por e-mail e o
   "esqueci a senha".
2. `criarAcessoCorretor` (`admin/acoes.ts:115-209`) usa
   `createUser({email_confirm:true, password})` (`:159-163`) e devolve a senha
   em claro. A compensação que apaga o usuário do Auth (`:188-196`) continua
   necessária com convite.
3. `criarAcessosQueFaltam` (`:295-374`) e `credenciaisIniciais.ts:24,27,97`
   são a fábrica de `nome@nexthome.com` com a senha `nexthome`+4 dígitos, que
   §19-2 manda parar. A guarda que ata o botão à action fica em
   `credenciaisIniciais.test.ts:142-160`.
4. **Não existe rota de retorno de Auth.** Um grep por
   `verifyOtp`/`exchangeCodeForSession`/`auth/callback` não acha nada.
   `proxy.ts:55-56` só libera `/corretor/entrar`, e não há link de "esqueci a
   senha".
5. `trocarSenha` exige a senha atual (`corretor/actions.ts:307-313`), então não
   serve a quem chega por convite ou recuperação. O comentário de
   `actions.ts:55-58` cita um "banner" que não existe.
6. `enviarEmail` (`email.ts:54-93`) falha fechado sem `RESEND_API_KEY`
   (`:78-83`), recusa `@nexthome.com` (`:71-76`) e tem o remetente padrão no
   domínio legado `nexthomeimobiliaria.com.br` (`:34`). O §20 decide usar
   `nexthomeimoveis.com` pela variável de ambiente.
7. Fluxo de PKCE: `generateLink`/`inviteUserByEmail` aberto noutro aparelho não
   tem verificador. O caminho que funciona é `token_hash` + `verifyOtp` num
   route handler. O link precisa estar na allow-list de redirect do Auth (no
   painel do Supabase), e `site.url` vem de `NEXT_PUBLIC_SITE_URL`
   (`site.ts:52`).
8. **`corretores` é legível pela chave `anon` com todas as colunas**
   (`0001_init.sql:155`). O recorte ficou para a fase 3 (`0181:92-94`). Com
   e-mail real, o e-mail pessoal de cada corretor fica listável pelo
   PostgREST.
9. Grupo de uma pessoa: `grupos.tipo` existe e nada o lê. A sessão não o
   carrega (`corretorSessao.ts:59-87`) e `gruposVisiveis(ehGestor)` só filtra
   por papel (`navegacao.tsx:367-377`). `cadastrarCorretor` insere sem `papel`,
   então o independente teria de nascer `gestor`.
10. Também não existe ação para trocar o e-mail de um corretor. As contas
    antigas `@nexthome.com` não recebem convite nem recuperação.

## 3. Medidor e cotas (`mapa-medidor.md`)

1. `chamarLlmJson` (`llm.ts:209`) é o caminho único de texto e já devolve
   tokens e modelo (`llmTipos.ts:21-31`), mas **não recebe grupo, corretor nem
   origem**. São 17 chamadores, mais 5 `fetch` diretos fora dele: imagem
   (`gerarImagem.ts:212`), planta (`lerPlanta.ts:131,192`), fotos do vídeo
   (`classificarFotos.ts:64`), transcrição (`audioTranscriber.ts:201`) e
   Gemini da importação (`leads/importacao.ts:488`).
2. **Só 3 caminhos gravam tokens:** o agente no webhook e no playground, o
   consultor e o financeiro. Uns 20 caminhos pagos não deixam rastro. Na
   refeita do eco, a meta da 2ª chamada some
   (`turnoDeAtendimento.ts:536,551`), e a imagem descarta o `usage`
   (`gerarImagem.ts:244-247`).
3. `ia_interacoes` não serve de medidor como está. `registrarInteracao` não
   manda `grupo_id` (`telemetria.ts:87-155`), e com 2 grupos o insert sem
   `conversa_id` (consultor, financeiro, playground, eval) **falha**
   (`0182:400-413`). Silêncios também viram linhas, e a tabela já foi apagada
   antes (`0111:139`).
4. O padrão certo é o do vídeo: `reservar_credito_video` (`0092:98-145`) com
   `for update`, mês de São Paulo e devolução no ciclo (`:153-175`, chamada em
   `video/fila.ts:133,163,279`). Ele é por corretor, com cota 5, e não por
   grupo.
5. O teto de imagens (`imagensTipos.ts:20`, `galeria.ts:148-158`,
   `api/imagens/gerar/route.ts:92-97`) conta antes e grava depois, então não é
   atômico. Pode ser forjado para baixo, porque o corretor pode apagar a arte
   (`0090:56-57`), e as linhas expiram em 48 h (`0109`).
6. A cota anti-ban (`consumir_cota_campanha_espacada`, `0158:65-143`) é por
   instância e por dia. É segurança do número e não a cota do plano: o §10 quer
   as duas lado a lado.
7. **Crédito esgotado e rate-limit são o mesmo `http_429`**
   (`llmTipos.ts:34-35`). Só `gerarImagem.ts:171-188` separa `sem_credito`.
   Dois textos mandam o corretor resolver a conta: "Recarregue"
   (`api/imagens/gerar/route.ts:293-294`) e `PlaygroundIA.tsx:46-50`.
8. **A contingência se repete a cada mensagem.** O webhook envia
   `textoDeContingencia` (`aiAgent.ts:663-672`) sem conferir `meta.fallback`
   (`route.ts:1228,1262`), e nada lembra que ela já foi enviada.
   `aberturaPelaIA.ts:176,314` já trata esse caso.
9. Há uma chave única da OpenAI para tudo, eval incluído (`.env.example:231`).
   Não há fila, prioridade nem orçamento de TPM, que fica em ~20 respostas por
   minuto com o prompt de ~10k tokens. Também não se lê `cached_tokens`
   (`openai.ts:172-173`).
10. Storage: os caminhos não carregam o grupo, exceto o do contador
    (`contador/acoes.ts:35`). A soma possível é
    `storage.objects.metadata->>'size'` pelo 1º e 2º segmento, juntando com
    `empreendimentos`, `corretores` e `leads`. Ao excluir um lead, os arquivos
    de `documentos-clientes/<lead_id>/` ficam órfãos e sem dono.

## 4. Cobrança e suspensão (`mapa-cobranca.md`)

1. **Não existe nada da plataforma** de plano, assinatura, fatura,
   `situacao` ou inadimplência em `src/` nem nas migrations.
2. Atenção aos nomes que já existem com outro sentido. O "Financeiro" do
   painel é da imobiliária (`vendas`, `caixa_*`, `fiscal_*`,
   `meses_fechados`). `video_jobs.cobranca` já existe, e `situacao` já é coluna
   de `lead_documentos` (`0179:20`).
3. Executor diário da suspensão no 5º dia: há precedente de pg_cron em SQL
   puro (`0164:98-101`). `vercel.json` já tem 4 crons (`:3-20`), e passar do
   teto recusa o deploy inteiro sem log.
4. Os crons que já percorrem os grupos sem filtrar a situação são
   `quem-esta-esperando/route.ts:95-103` e `relatorio-semanal/route.ts:97-103`.
   Os dois estão desagendados.
5. Para o aviso "desde o vencimento", a faixa global do layout é precedente
   (`FaixaConexao`, `layout.tsx:113`). Layout não re-executa entre rotas
   irmãs, então o bloqueio precisa estar em cada página e em cada action
   (`guardas.ts:26-31`).
6. Canais de aviso: `enviarEmail` está sem chave, `avisarCorretor`
   (`avisoAoCorretor.ts:14-34`) só funciona com o número do corretor
   conectado, e `grupos` não tem contato de cobrança.
7. O registro diário de assento não existe. O formato precedente é
   `whatsapp_envios_por_dia` (`0158:16`).
8. Já decidido no §20: o vencimento cai no dia do cadastro, sem pro rata, e a
   troca de plano vale no ciclo seguinte. Na suspensão param IA, listas, artes
   e vídeos; o painel abre com aviso e o site continua no ar.

## 5. Número único, pode-operar, teto e vazão (`mapa-numero.md` + `mapa-cobranca.md` §5)

1. `telefone_conectado` **não tem unique, índice nem normalização BR**
   (`0018:10`). Só `corretor_id` e `instance_name` são únicos (`0018:7-8`).
   Hoje nada impede o mesmo número em duas instâncias, nem dentro de um grupo.
2. O número só é gravado na confirmação, nunca no clique de Conectar. Isso
   acontece no webhook (`registrarEventoConexao`, `repositorio.ts:2660-2742`) e
   na sincronização (`:2558-2643`). As duas gravações **não leem `error`**, então
   uma violação de unique viraria falha calada: o número fica pareado e o
   estado continua "conectando".
3. Uma queda não limpa `telefone_conectado`: só o desconectar manual limpa
   (`whatsapp/acoes.ts:449-458`). Desativar o corretor não desconecta o número
   (`admin/acoes.ts:441-478`).
4. A ordem do deploy importa: o código que trata o erro 23505 e derruba a
   sessão (`provider.ts:349`) precisa subir **antes** do índice.
   `verificarConexaoWhatsapp` (`whatsapp/acoes.ts:378-423`) não tem campo para
   dizer que recusou.
5. O anti-ban é por `instancia_id`. Desconectar no grupo A e conectar no grupo
   B no mesmo dia começa do piso de 15 de novo, o que é uma lacuna residual.
6. `resolverInstancia` (`repositorio.ts:87-138`) **não lê
   `corretores.ativo`** nem nada do grupo, e o disparador consulta instâncias
   sem filtro de corretor ou de grupo (`campaignDispatcher.ts:263-272`).
   `MotivoDoSilencio` (`quandoAIaResponde.ts:79-85`) não tem motivo de grupo,
   plano ou cota, e um motivo novo obriga a mexer em `fraseDaDecisao` e
   `registroDoSilencio`.
7. Gate pendurado depois de uma saída antecipada herda todas elas. O
   disparador tem 3 saídas antes do laço (`campaignDispatcher.ts:240-277`), e
   os follow-ups têm o `return` da janela (`cron/followups/route.ts:648`).
8. Teto por corretor: não há coluna nem uma reserva que confira grupo e
   corretor na mesma transação.
9. Aceite de termos: não há tabela, coluna nem tela. O encaixe é
   `conectarWhatsapp` (`whatsapp/acoes.ts:289`), o mesmo ponto da trava de
   número único.

---

## Dependências entre as frentes

- **O e-mail transacional bloqueia três frentes.** Convite, recuperação de
  senha e avisos de cobrança dependem de `RESEND_API_KEY` e do domínio
  `nexthomeimoveis.com` verificado no Resend. É infraestrutura, não código, e
  deve vir primeiro.
- **O painel da plataforma é a base das outras.** Ele traz a guarda de admin, a
  leitura pela chave de serviço, a categoria nova em `servicoComGrupo`, as
  colunas novas de `grupos` e as ações de plataforma no CHECK de
  `admin_eventos`, com ator. Criar grupo, atribuir plano, marcar pagamento,
  suspender e ver a saúde dependem dele.
- **Criar o 2º grupo de verdade muda o banco.** Antes disso, todos os caminhos
  com chave de serviço precisam passar `grupo_id`. Isso inclui a telemetria
  sem conversa (consultor, financeiro, playground), da qual o medidor depende.
  Precisa também do seed de `parametros_credito` e `fiscal_config` e da suíte
  de isolamento verde.
- **O medidor depende de `grupos.plano`**, que vem da frente 1. A saída "cota
  acabou" depende de um motivo novo de silêncio no pode-operar, sem passar por
  `textoDeContingencia`. O teto por corretor também depende do medidor.
- **A suspensão depende de `grupos.situacao`, vencimento e plano** (frente 1) e
  do pode-operar, que é quem a aplica nos caminhos. O aviso depende do e-mail.
  O §20 põe o pode-operar na etapa 4, mas a etapa 3 precisa dele para valer.
- **O pode-operar reúne corretor ativo, situação do grupo e cota.** Ele precisa
  das frentes 3 e 4 para ter o que ler.
- **A saúde por grupo depende da cobrança**, para mostrar a inadimplência, e do
  painel da plataforma.
- **A trava de número único e o aceite de termos tocam o mesmo ponto**
  (`conectarWhatsapp` e a tela de conexão). Os dois são independentes das
  outras frentes.
- **A convivência do grupo de uma pessoa com o convite**: o independente nasce
  gestor do próprio grupo, e quem o cria é o operador (frente 1).

---

## Decisões de produto que o código mostra em aberto

Já decidido e fora desta lista: o remetente, o que para na suspensão, o ciclo
sem pro rata, a ordem da fase (§20), a suspensão no 5º dia (§19-6), a proibição
do número em dois grupos (§19-4), o e-mail real (§19-2) e a liberação do
pacote extra só depois de pago (§16-2).

1. **O que conta como "resposta da IA" na cota.** A 2ª chamada do eco, o
   dossiê, a classificação de recusa e a transcrição são custo sem resposta
   enviada (`turnoDeAtendimento.ts:536`, `dossierExtractor.ts:161`,
   `classificarRecusa.ts:42`).
2. **O que continua quando a cota de uma ferramenta acaba**, o que é diferente
   da suspensão. A IA cala e o corretor atende à mão? E a variação de lista, o
   dossiê, as leituras de PDF e planta? (§18: "define o que continua".)
3. **Para que lado errar quando a leitura da situação ou da cota falha.** A
   trava de segurança da casa recusa no erro (`0092:90-91`, MEMORIA 28/08), mas
   o §11 proíbe erro para o cliente final.
4. **O escopo da trava de número único.** Pode ser `telefone_conectado is not
   null`, que bloqueia o número de quem caiu e não desconectou, ou
   `status='conectado'`, que pode quebrar a reconexão de A. Falta decidir
   também a normalização (9º dígito) e se um número desconectado em A e
   conectado em B no mesmo dia herda o volume do dia.
5. **A tabela de preço por modelo e o custo fixo** do "plano a preço de custo".
   Nada disso existe, e os números do §10 dependem dessa medição.
6. **O teto por corretor**: quem o define (o gestor?), qual o padrão, e se a
   tela mostra a cota da equipe e a do corretor.
7. **As contas antigas `@nexthome.com`**: trocar o e-mail das existentes,
   aposentar o lote `criarAcessosQueFaltam` e decidir se "redefinir senha" pelo
   gestor continua como saída de suporte.
8. **O vazamento de `corretores.email` pela chave `anon`** com e-mail real:
   antecipar o recorte de colunas da fase 3 para a fase 2?
9. **Os dados institucionais**: colunas em `grupos` ou tabela própria, e se o
   CNPJ e a razão social de `fiscal_config` viram a fonte única.
10. **O slug do grupo**: lista de reservados e regra de troca.
11. **A chave e a conta separadas para eval e scripts**, que é custo e conta
    nova na OpenAI, e a prioridade atendimento > lote > eval: fila no app ou só
    chaves separadas?
12. **Armazenamento**: o que fazer com os bytes órfãos de lead excluído na
    conta do grupo.
13. **Assento**: a definição "número conectado ou lead na carteira" medida em
    que horário do dia, e o vencimento nos dias 29 a 31.
14. **Suporte**: como o corretor dá consentimento ao acesso do operador.
15. **Termos**: o texto, que vai ao advogado, e se o aceite vale por versão.
16. **Grupo de uma pessoa**: o caminho de independente para imobiliária (não
    existe função) e se as rotas de equipe escondidas no menu ficam
    alcançáveis por URL, como já acontece com `financeiro/ranking/page.tsx:43-48`.
