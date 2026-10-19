# Lacunas do desenho multi-grupo — lista deduplicada (revisão de 19/10/2026)

Fonte: auditoria em seis áreas (banco, WhatsApp/IA, painel, site,
marketing/mídia, integrações/infra, produto/negócio), ~140 achados. Achados
iguais vistos de áreas diferentes viraram um item só, e as áreas de origem
estão anotadas.

Gravidade: **B** = bloqueia o primeiro cliente; **I** = importante;
**M** = menor.

Destino:
- **F1** = entra no plano da fase 1 (sem ela a fase 1 fica errada ou insegura);
- **F2…F7** = fase existente do desenho;
- **NOVA** = fase nova "Operação e ciclo de vida", antes do primeiro cliente externo;
- **DECISÃO** = precisa de resposta do dono do produto antes (pergunta em `perguntas.md`).

Totais: 88 lacunas. F1: 30 · F2: 14 · F3: 17 · F4: 7 · F5: 3 · F6: 1 ·
F7: 2 · NOVA: 10 · DECISÃO: 4.

---

## Fase 1 — entram no plano

### L01 · Gatilhos internos gravam sem grupo e derrubam toda criação de lead · B · F1
Áreas: banco, integrações.
O gatilho AFTER `registrar_evento_lead_criado` insere em `marketing_eventos` e
`event_outbox`. A única FK de `event_outbox` é `marketing_evento_id`, que não
está na lista de colunas-mãe do plano, então cai em `grupo_atual()`, que é
nulo para chave de serviço e `anon`. Com dois grupos, o insert dá erro dentro
da transação do lead: todo lead do webhook, portal, Meta e formulário falha,
inclusive da Next Home. O mesmo acontece em `vincular_campanha_meta_canonica`
→ `marketing_campanhas` (sem coluna-mãe). E o gatilho
`meta_ads_campanha_canonica` ordena antes de `meta_ads_metricas_00_grupo`
(c < m), então roda com `new.grupo_id` nulo. Os testes da Task 3 não pegam,
porque criam lead como corretor logado.
Evidência: `0065_campanhas_eventos_outbox.sql:30-55, 80-82, 104-138`; plano
linhas 213-217 e 236-239.
O que fazer: os dois gatilhos repassam `new.grupo_id`; `marketing_evento_id →
marketing_eventos` entra no mapa; o gatilho da Meta é renomeado para ordenar
depois do `_00_grupo`; teste de lead criado pela chave de serviço com dois
grupos.

### L02 · Colunas-mãe escolhidas pelo NOME apontam para a tabela errada · B · F1
Áreas: banco, marketing, painel.
`estudio_mensagens.conversa_id` é de `estudio_conversas`;
`consultor_mensagens.conversa_id` é de `consultor_conversas`;
`meta_ads_metricas.campanha_id` é texto (id da Meta). Pela regra do plano, o
gatilho procura esses ids em `whatsapp_conversas`/`whatsapp_campanhas`, não
acha, e com dois grupos todo insert do estúdio e do consultor falha (ou dá erro
de tipo). Ficam fora da lista: `marketing_evento_id`, `entidade_id`,
`link_token`/`token`, `lote_id`/`gestor_id` (histórico de preços),
`impulsionamento_id`, `parceiro_id`, `ator_id`/`alvo_corretor_id`
(`admin_eventos`). `ia_interacoes.corretor_id` não tem FK e guarda 5.461 ids
de corretores apagados. O plano também não diz o que fazer quando a coluna-mãe
tem valor e a linha não existe, e se contradiz em `admin_eventos` ("anulável"
versus "erro sem mãe com dois grupos").
Evidência: `0096:35`, `0102:27`, `0053:17`, `0029:12-13`, `0017`, `0118:72`,
`0030:27-41`; plano 207-221.
O que fazer: mapa explícito `(tabela, coluna, tabela_mãe)` gerado das FKs
reais (`pg_constraint`), com lista declarada das colunas sem FK; valor sem
linha-mãe → erro; `admin_eventos` deriva de `alvo_corretor_id`, depois
`ator_id`, e só fica nulo quando uma função da plataforma grava explicitamente.

### L03 · O gatilho só confere a PRIMEIRA mãe; FKs secundárias atravessam grupos · B · F1
Áreas: banco, painel, marketing.
Casos concretos: `anotacoes.destinatario_id` de outro grupo (o cron de
lembretes manda o texto da nota pelo WhatsApp para corretor de outro grupo);
`venda_participantes.corretor_id` inserido por `salvar_venda`;
`leads.empreendimento_id`, `imovel_interesse_id`, `parceiro_id`;
`ativacoes_em_lead_alheio` (corretor de A, lead de B: o registro cai em B);
`imagens_geradas` e `video_jobs` (corretor + imóvel);
`whatsapp_campanhas_fila` (lead + campanha); `whatsapp_campanhas`
(corretor + imóvel); `estudio_mensagens` (conversa + imagem/vídeo);
`corretor_destaques.empreendimento_slug`. Os ids de corretor de qualquer grupo
saem pela chave pública (`corretores` com select `using (true)` até a fase 3).
Também: no UPDATE o gatilho reconfere a mãe, então quando o lead de uma venda
mudar de grupo (fase 5), a venda fica impossível de editar.
Evidência: `0100:23,58-61`; `0114:58-96,308`; `0125:136`;
`parceiro/[token]/acoes.ts:48-60`; `0146:23-31`; `0092:28-29`; `0090:30`.
O que fazer: o gatilho confere TODAS as colunas-mãe da tabela; no UPDATE, só
as que mudaram. Co-corretagem entre grupos fica recusada até a resposta da
pergunta 9.

### L04 · A trava de mudança de grupo é uma variável que qualquer sessão liga · I · F1
Áreas: banco.
A regra 1 do gatilho libera troca de `grupo_id` quando
`current_setting('nexthome.transferindo_grupo')` está ligado, e qualquer sessão
(script, chave de serviço) faz `set_config`. Não garante a "função única
auditada" do §9.
Evidência: plano 199-203; design §9.
O que fazer: a liberação vale só quando `current_user` é uma role `NOLOGIN`
dona da função de transferência (fase 5 cria a função; fase 1 cria a role e a
regra).

### L05 · Tabelas de infraestrutura sem grupo passariam a falhar em toda escrita · B · F1
Áreas: banco.
`whatsapp_disparo_lock` (travas `resposta:<conversa>` e `<instância>`, escritas
pela chave de serviço) e `whatsapp_diagnosticos` (só `instance_name` texto) não
têm linha-mãe. Com dois grupos, `travar_disparo` levanta "grupo_id
obrigatório": a IA para de responder e o disparo para em todos os grupos.
Evidência: `0024:49-72`; `webhooks/whatsapp/route.ts:867`;
`cron/followups/route.ts:381`; `0061:11-19`; plano 192-195.
O que fazer: as duas entram em `TABELAS_GLOBAIS` como tabelas da plataforma,
sem select para `authenticated` (conferir os leitores do diagnóstico).

### L06 · Parâmetros de crédito são globais e qualquer gestor os reescreve · B · F1
Áreas: banco, WhatsApp/IA, painel.
`atualizar_parametros_credito` (security definer) aceita qualquer gestor ativo.
O gestor de um cliente muda taxa, FGTS, MCMV e ITBI do simulador e do consultor
de todos os sites, e `conferido_por` mostra o corretor do outro grupo. O ITBI
só tem as cidades da Next Home. Não existe no banco a figura do administrador
da plataforma, e a guarda da Task 5 mandaria "filtrar por grupo" uma tabela
global.
Evidência: `0103:24-118`; `0107:40-52`; `admin/credito/acoes.ts:24`.
O que fazer: fase 1 cria `administradores_da_plataforma` +
`eh_admin_da_plataforma()`; a escrita dos parâmetros passa a exigi-la; a tela
de Crédito some para gestor de grupo. Se cada grupo poderá ajustar, é a
pergunta 5.

### L07 · Corretor ou gestor desativado continua com acesso · I · F1
Áreas: banco, painel.
`corretor_atual()`, `eh_gestor()`, `getCorretorLogado()` e o `grupo_atual()`
proposto não olham `ativo`. Gestor desligado continua lendo a carteira da
imobiliária pela PostgREST.
Evidência: `0007:72-90`; `corretorSessao.ts:52-73`; `guardas.ts:35-50`;
plano 143-147.
O que fazer: as três funções devolvem nulo para corretor inativo; a sessão do
painel recusa. (Grupo suspenso fica para a fase 2.)

### L08 · Leitura de e-mail de portal casa imóvel, corretor e duplicado no banco inteiro · B · F1
Áreas: integrações.
`processarEmailDeLead` lê `empreendimentos` e `corretores` de todos os grupos;
o corretor mencionado vence o dono da caixa, então um e-mail na caixa de B que
cite "Bruna" cria o lead na Next Home. Pelo webhook, a deduplicação por
telefone e por `email_message_id` é global e reescreve a ficha de outro grupo.
Evidência: `inbound/processarEmail.ts:34-39, 70-73, 97-106, 125-153, 184`.
O que fazer: a função recebe o grupo (do dono da caixa ou do endereço de
entrada) e filtra todas as leituras e o dedupe por ele.

### L09 · Webhook de Lead Ads deduplica por telefone em todos os grupos · B · F1
Áreas: integrações.
Antes de inserir, procura `leads.telefone_e164` sem grupo; se a pessoa é lead
de B, o lead da Next Home não nasce e a ficha de B recebe `meta_lead_id`,
anúncio e campanha da Next Home.
Evidência: `webhooks/meta/route.ts:168-240`.
O que fazer: dedupe e update filtrados pelo grupo dono da conta da Meta (grupo
1 até a fase 7).

### L10 · Palavra-chave consulta leads de todas as carteiras · B · F1
Áreas: WhatsApp/IA.
`cadastrarPelaPalavraChave` procura o telefone em leads de qualquer corretor.
Corretor de A digitando num cliente de B recebe "lead de outro corretor": a IA
não atende e ele descobre que o número é cliente de outra empresa (consulta de
existência entre grupos). O registro em `ativacoes_em_lead_alheio` cai em B.
Evidência: `repositorio.ts:353-414`; `webhooks/whatsapp/route.ts:446-460`.
O que fazer: a busca "alheia" fica dentro do grupo da instância; fora dele, o
número é tratado como novo.

### L11 · Porteiro `/wa` sorteia corretor sem grupo e resolve anúncio no catálogo de todos · B · F1
Áreas: site.
`/wa` (botões da home, rodapé, contato, flutuante) chama
`sortear_corretor_whatsapp` sem imóvel: não há de onde tirar o grupo. O
fallback de `/wa/[campanha]` chama sem argumento; `preferido` (cookie) pode ser
de outro grupo e ganha a vez. `/wa/<campanha>` casa slug/nome/apelido contra
todos os imóveis publicados pela chave de serviço: o clique pago de B gera lead
em A.
Evidência: `wa/route.ts:30-33`; `wa/[campanha]/route.ts:43-59, 85-95`; `0130`.
O que fazer: a função recebe `p_grupo` explícito (do site), recusa `preferido`
de outro grupo, e a resolução da campanha filtra o grupo.

### L12 · Página do parceiro mostra o estoque de todos e indica para qualquer imóvel · B · F1
Áreas: painel, site.
`/parceiro/[token]` lista, pela chave de serviço, todos os imóveis publicados
com unidades (espelho de vendas de outros grupos). `indicarCliente` aceita
qualquer `empreendimentoId` do navegador; o lead cai no grupo do imóvel, não no
do parceiro, e sem imóvel não tem mãe. `parceiros` não tem coluna-mãe.
Evidência: `parceiro/[token]/page.tsx:34-38`; `acoes.ts:28-73`; `0125:108-123`.
O que fazer: `parceiros.grupo_id` (gravado pelo gestor que criou); página e
indicação filtradas por ele; `parceiro_id` vira mãe antes de
`empreendimento_id`.

### L13 · "Me avise quando surgir" cruza imóvel de um grupo com lead de outro · B · F1
Áreas: site.
`avisarQuemPediuAlerta` lê imóveis novos e leads com alerta, os dois sem grupo,
e manda pelo WhatsApp do corretor de A o imóvel de B. A Task 7 classificaria
como "plataforma" e aprovaria.
Evidência: `crm/avisoDeNovidade.ts:27-100`.
O que fazer: só casa imóvel e lead do mesmo grupo; a guarda ganha categoria
"cruza dois conjuntos" que exige o casamento por grupo.

### L14 · Escrita pública pela chave `anon` não carrega o grupo sem abrir porta · B · F1
Áreas: site.
`/api/leads` e `/api/clique-whatsapp` gravam com o cliente anônimo. Em
`cliques_whatsapp` o `anon` só tem insert por coluna: passar `grupo_id` dá
"permission denied", e conceder deixa qualquer um gravar em qualquer grupo.
`/api/clique-whatsapp` aceita `corretorId` do corpo sem validar (escrita
forjada entre grupos). Clique sem corretor e sem imóvel não tem mãe e falha
calado no `sendBeacon`.
Evidência: `0143:29-31`; `api/clique-whatsapp/route.ts:23-48`;
`api/leads/route.ts:135-193`.
O que fazer: as duas rotas gravam pela chave de serviço com `grupoDoSite()` e
validam o corretor/imóvel no grupo (o §15 punha isso na fase 3, mas a Task 4
já precisa).

### L15 · Até a fase 3 nenhuma leitura pública filtra grupo, e a fase 2 já cria grupos · I · F1
Áreas: site, WhatsApp/IA.
`catalogoPublicado`, `corretoresPublicos` e `getEmpreendimentos()` (também
usado pelo webhook e pelos crons para a IA) leem tudo. O primeiro grupo de
teste criado pela tela da fase 2 apareceria em `nexthomeimoveis.com`, no
sitemap e na IA da Next Home.
Evidência: `catalogo/cache.ts:41-70`; `queries.ts:166-176`;
`webhooks/whatsapp/route.ts:890`.
O que fazer: as leituras públicas filtram `grupo_id = grupoDoSite()`; a IA lê o
catálogo do grupo da instância. A resolução pelo `Host` segue na fase 3.

### L16 · Ações e rotas usam a chave de serviço sobre id vindo do navegador · B · F1
Áreas: painel, marketing, integrações.
`desconectarNumeroDoCorretor(corretorId)` derruba o WhatsApp de corretor de
outro grupo; `trocarLinkDoParceiro(id)` idem; `/api/imagens/gerar` lê `midias`
por `midiaId` com a chave de serviço (o comentário diz "sessão") e liga a arte
ao imóvel de outro grupo. A guarda da Task 7 aceita "por-id" sem provar a
validação, e aceita um arquivo "equipe" que só tenha `grupo_id` num insert.
Evidência: `admin/whatsapp/acoes.ts:20-56`; `admin/parceiros/acoes.ts:48-56`;
`api/imagens/gerar/route.ts:59,105-136`; plano 394-403.
O que fazer: as três passam a ler o alvo pela sessão (ou conferem o grupo) antes
de agir; a guarda exige, em "por-id", a função de validação nomeada, e, em
"equipe", filtro de grupo em cada `.from()` de leitura.

### L17 · Telas do gestor somam a plataforma inteira (e as views não têm grupo) · B · F1
Áreas: painel, banco.
Visão geral (`whatsapp_funil_metricas`, `whatsapp_resposta_metricas`), WhatsApp
da equipe (instâncias, 500 `ia_interacoes`, campanhas), Desempenho
(`whatsapp_primeira_resposta`) e Prontidão (todo corretor e último login) leem
pela chave de serviço sem filtro. Nenhuma view expõe `grupo_id`, então o teste
"views respeitam o grupo" da Task 6 não tem o que conferir.
Evidência: `admin/page.tsx:103-120`; `admin/whatsapp/page.tsx:62-96`;
`financeiro/dados.ts:359-368`; `ProntidaoDaEquipe.tsx:17-36`; `0072:51-80`;
`0157:16-53`.
O que fazer: toda view do `public` ganha `grupo_id`; essas telas filtram pelo
grupo da sessão; `clienteParaNumerosDaEquipe()` devolve um cliente que exige o
grupo.

### L18 · Relatório semanal e aviso de espera somam todos e mandam a todos os gestores · I · F1
Áreas: banco, integrações, produto.
Desagendados hoje, mas religar é uma linha de SQL. Agregam o banco inteiro e
mandam a todo gestor ativo, com links da Next Home. A categoria "plataforma"
da Task 7 os aprovaria.
Evidência: `admin/numerosDaSemana.ts:18-44`;
`cron/relatorio-semanal/route.ts:55-103`; `0076`;
`cron/quem-esta-esperando/route.ts:124`.
O que fazer: os dois passam a rodar por grupo (um laço de grupos, cada um com
os próprios números e gestores); categoria "agrega por grupo" na guarda.

### L19 · Integrações da Next Home ficam abertas a qualquer grupo antes da fase 7 · B · F1
Áreas: integrações, painel.
`metaAdsConfigurado()` vale para todo gestor; "Conta da Meta" e "Sincronizar
agora" mostram o gasto da Next Home ao gestor de B. `/api/gmail/conectar` liga
a caixa de qualquer corretor ao app OAuth da Next Home e a leitura cai em
`processarEmailDeLead` (global). `meta_ads_metricas` é gravada pelo cron sem
mãe e falha com dois grupos.
Evidência: `metaAds.ts:27-152`; `admin/anuncios/acoes.ts:14-25`;
`ContaDaMeta.tsx:258`; `api/gmail/conectar/route.ts:15-27`.
O que fazer: um portão único `integracaoDoGrupo(grupo, 'meta'|'gmail')` que
vale só para o grupo 1 até a fase 7; o cron carimba `grupo_id` do grupo 1.

### L20 · Funções `security definer` executáveis pelo `authenticated` sem conferir quem chama · B · F1
Áreas: marketing.
`reservar_credito_video(p_corretor)` e `devolver_credito_video` só revogam de
`public, anon`; o Supabase dá EXECUTE ao `authenticated`. Qualquer usuário
ganha vídeo de graça ou queima a cota de outro grupo. É o furo da 0135
reaparecendo; o medidor da fase 2 vai repetir o padrão.
Evidência: `0092:98-101,153-156,207-208`; comparar `0135:22-23`.
O que fazer: a Task 5 confere também o EXECUTE: toda função security definer
que recebe id de corretor/instância ou é revogada do `authenticated` ou confere
o chamador; teste com `has_function_privilege`.

### L21 · A guarda de `security definer` lê texto das migrations, não o banco · M · F1
Áreas: banco.
Cobraria filtro em funções já apagadas (`resetar_cota_campanha`,
`e164_migracao_0111`) e não vê função criada só em produção (caso
`sortear_corretor_whatsapp(preferido)`).
Evidência: `0155:155-156`; `0034:53`; plano 313-316.
O que fazer: a conferência roda contra `pg_proc` (`prosecdef`) no banco local.

### L22 · Scripts com chave secreta leem conversa de todos os grupos; logs com conteúdo pessoal · B · F1
Áreas: banco, WhatsApp/IA, integrações, produto, marketing.
`observatorio.ts`, `observatorioConsultor.ts`, `eval/exportarGolden.ts`
(grava em `eval/golden/casos.json`, versionado), `eval/casosDoConsultor.ts`,
`medirCargaPainel.sql`, `estadoDoCiclo.sql` e os scripts de catálogo
(`trazerFotosCuradas.ts`, `operacao0129.ts`, `migrar.ts`, workflows de fila)
usam `createClient` com `SUPABASE_SECRET_KEY` direto, fora da guarda da Task 7.
O runtime registra 120 caracteres da transcrição de áudio recusada e telefone
em falha; `inbound_logs.payload_raw` guarda o e-mail inteiro.
Evidência: `scripts/observatorio.ts:115,181-197`;
`exportarGolden.ts:22-63,119-146`; `audioTranscriber.ts:308`;
`processarEmail.ts:47-55,196`.
O que fazer: todo script exige `--grupo` e por enquanto aceita só o grupo 1; a
guarda passa a varrer `scripts/`; log sem conteúdo de conversa; regra escrita
nas Global Constraints: script ou migration de dados nomeia `grupo_id`.

### L23 · Repositório público expõe traços do E2E e conversas reais · B · F1 (+ pergunta 1)
Áreas: integrações, produto.
O `e2e.yml` roda contra produção com login real e, na falha, sobe
`test-results/` (traços com o DOM do painel) como artefato baixável por
qualquer um. O golden do eval guarda trechos de conversa real. A MEMORIA
publica ids e operação.
Evidência: `.github/workflows/e2e.yml:53-66`; `playwright.config.ts:33`;
`exportarGolden.ts`.
O que fazer (fase 1, independente da resposta): parar de subir traço como
artefato e de exportar golden de conversa real. Fechar o repositório é a
pergunta 1.

### L24 · Ambiente de testes "banco e deploy" não sai do plano; o E2E segue em produção · I · F1
Áreas: banco, site, integrações, produto.
O §13 põe na fase 1 ambiente separado de banco E deploy, e o §14 diz que E2E
contra produção deixa de ser aceitável. O plano entrega só banco local.
Evidência: `.github/workflows/e2e.yml:25-29,55-58`; plano Tasks 1 e 8.
O que fazer: projeto Supabase de testes + ambiente da Vercel apontando para ele;
o E2E diário passa a mirar esse ambiente (depende do Matheus criar o projeto).

### L25 · A suíte de isolamento não cobre o Realtime · M · F1
Áreas: banco.
O Live Chat assina `postgres_changes` em mensagens e conversas, e o banco de
teste sobe sem o serviço realtime.
Evidência: `0050:44-63`; `scripts/banco/dbTeste.mjs` (lista `FORA`).
O que fazer: subir o realtime no banco local e testar que o usuário de B não
recebe mudança de A.

### L26 · Telemetria e gravação de mensagem engolem o erro do insert · M · F1
Áreas: WhatsApp/IA.
`registrarInteracao` não lê o `{ error }`; `gravarMensagem` devolve
`inedita: true` em qualquer erro não-23505. O "falha em voz alta" do Review
Focus 1 vira silêncio, e o medidor da fase 2 contaria menos.
Evidência: `telemetria.ts:81-142`; `repositorio.ts:749-752`.
O que fazer: os dois leem o `error` e logam/devolvem falha.

### L27 · Checagens de unicidade global feitas pela sessão quebram com a policy restritiva · B · F1
Áreas: painel.
`slugDisponivel` e a lista de e-mails ocupados leem `corretores` pela sessão;
com a policy da Task 6 só veem o próprio grupo. O update bate na unique global,
o usuário recém-criado no Auth é apagado e o gestor vê "não vinculado;
desfeito".
Evidência: `admin/acoes.ts:57-69,139-152,218-250`.
O que fazer: a conferência de unicidade global vai para uma função
`security definer` que só devolve sim/não.

### L28 · `catalogo_candidatos` sem dono e com chave global · I · F1 (+ F6)
Áreas: banco, marketing.
Select/update `using (true)` para todo autenticado, `unique (fonte,
ref_externa)` global, populada por script sem linha-mãe. Com dois grupos, o
script falha e qualquer usuário lê a fila da Next Home.
Evidência: `0078:30-81`; `0080:27-32`; `0079`.
O que fazer (fase 1): `grupo_id` com backfill na Next Home, unique por grupo,
script com `--grupo`. Se vira base da plataforma é fase 6.

### L29 · A sessão do painel não carrega o grupo · M · F1
Áreas: painel.
`CorretorSessao` não traz `grupo_id`. As Tasks 4 e 7 pedem "o grupo do usuário
da sessão" e não há acessor; cada arquivo faria a própria consulta.
Evidência: `corretorSessao.ts:37-72`.
O que fazer: `getCorretorLogado()` devolve `grupoId`.

### L30 · Repassar lead apaga a origem que a fase 5 vai precisar · M · F1
Áreas: painel.
`atribuirLead` e `redistribuirCarteira` sobrescrevem `origem_atribuicao` com
`manual`.
Evidência: `corretor/actions.ts:506-509`; `admin/acoes.ts:399-402`.
O que fazer: antes de sobrescrever, gravar a origem anterior em
`lead_interacoes` (sem grant update), para o backfill da etiqueta.

---

## Fase 2 — Painel da plataforma e planos

### L31 · Não existe como o gestor cadastrar corretor novo · B · F2
Áreas: painel, produto. Nenhum insert em `corretores` no app;
`criarAcessoCorretor` só cria login para ficha existente; o §11 diz "convida o
resto". Evidência: `admin/acoes.ts:76-142`.

### L32 · Canal com o cliente pagante não existe · B · F2
Áreas: produto. `corretores.email` é de fachada e `enviarEmail` o recusa;
remetente é do domínio legado; sem `RESEND_API_KEY`; `avisarCorretor` depende
do número conectado. Avisos de cota, suspensão e cobrança não têm por onde ir.
O grupo precisa de contato de cobrança e a plataforma de remetente próprio.
Evidência: `email.ts:34,61-73`; `crm/avisoAoCorretor.ts:14-27`.

### L33 · Identidade jurídica e institucional do grupo não está modelada · I · F2
Áreas: site, produto. `grupos` só tem nome/slug/tipo; site, JSON-LD, rodapé e
privacidade leem CRECI, endereço, telefones e redes de `site.ts`. Falta razão
social, CNPJ/CPF, CRECI J ou F, endereço, telefones, redes, encarregado LGPD.
Evidência: `site.ts:15-102`; `marca.ts:28-42`; `privacidade/page.tsx:53`.

### L34 · Slug do grupo vira subdomínio sem validação · M · F2
Áreas: site. Regras de DNS, nomes reservados (www, app, api, admin, painel,
mail) e o que acontece com links ao trocar o slug.

### L35 · Grupo de uma pessoa: papel do independente e menu de equipe · I · F2
Áreas: painel, produto. O menu só conhece `gestor`; não está definido se o
independente é gestor; as ferramentas de equipe não somem; não há caminho de
independente para imobiliária. Padrão sugerido: independente é gestor do
próprio grupo e o menu esconde equipe por `grupos.tipo`.
Evidência: `navegacao.tsx:45-368`; `guardas.ts:47`.

### L36 · Ponto único de "pode operar" no webhook, crons e disparador · I · F2
Áreas: WhatsApp/IA. `resolverInstancia` não lê corretor ativo nem grupo
suspenso nem cota; a falha cai em `textoDeContingencia`, que manda "já te
respondo" ao cliente a cada mensagem.
Evidência: `repositorio.ts:64-102`; `aiAgent.ts:663-704`.

### L37 · O medidor não cobre metade das chamadas pagas · I · F2
Áreas: WhatsApp/IA, marketing, integrações, produto. Dossiê, transcrição,
variação de lista, anti-eco, consultor, estúdio, tradutor, leitura de PDF,
planta, preço, lista de leads, e-mail de portal e classificação de fotos não
gravam tokens nem grupo. `imagens_geradas` expira em 48-72 h e leva a
contagem. Sem isso o plano a preço de custo não fecha e o pior caso do §15 está
subestimado. Falta decidir o que continua quando a cota acaba (a ficha depende
de LLM).

### L38 · Uma chave da OpenAI para todos: vazão, prioridade e crédito · I · F2
Áreas: WhatsApp/IA, integrações, produto, marketing. ~200k TPM ≈ 20
respostas/min, compartilhado com eval e lotes; crédito acabando cala todos; a
tela de imagem manda o corretor "recarregar" uma conta que é da plataforma.
Falta prioridade (atendimento acima de lote acima de eval), chave separada para
testes e aviso à plataforma.
Evidência: `openai.ts:46`; `llm.ts:209`; `api/imagens/gerar/route.ts:174-176,298-299`.

### L39 · Cota de armazenamento sem como atribuir bytes ao grupo · I · F2
Áreas: banco, marketing, integrações. `storage.objects` não tem grupo; caminhos
por corretor/imóvel/`marca/`/`sem-corretor`; referências, mp4 e books nunca
são apagados.
Evidência: `limpeza.ts:20`; `worker.ts:109`; `0043:20-46`.

### L40 · Cobrança manual vaga demais e assento sem histórico diário · I · F2
Áreas: painel, produto. Falta ciclo, vencimento, pro rata, carência (pergunta
6), troca de plano, faturas/NF. "Teve número conectado ou lead em algum dia do
mês" exige registro diário que não existe.

### L41 · Suporte sem canal e acesso do operador sem registro · I · F2
Áreas: painel, produto. Não há canal de suporte; `admin_eventos.ator_id`
referencia `corretores` e o CHECK de `acao` só tem ações de gestor; o acesso
real hoje é SQL direto sem log. Falta o fluxo de consentimento do §16.4.
Evidência: `painel/error.tsx:41`; `0030:27-38`.

### L42 · Painel da plataforma sem saúde por grupo · M · F2
Áreas: produto. Só uso por ferramenta: falta ativação, número caído, IA calada,
inadimplência. `@vercel/analytics` mistura o tráfego de todos os sites.

### L43 · Cota somada na equipe sem teto por corretor · M · F2
Áreas: produto. Um corretor esgota a IA dos colegas; não está dito quem recebe
o aviso dos 80%. Padrão sugerido: gestor pode pôr teto por corretor; aviso
para quem gastou e para os gestores.

### L44 · Aceite de termos por usuário · I · F2
Áreas: produto. Quem corre o risco do número é o corretor convidado, que nunca
aceita nada. Falta tabela de aceite e passo antes de conectar o WhatsApp.

---

## Fase 3 — Sites por endereço

### L45 · Webhook, crons, worker e IA não têm `Host` · B · F3
Áreas: WhatsApp/IA, site, marketing, integrações, produto. Links ao cliente
(página do imóvel, apresentação, catálogo pessoal, seleção, proposta, portal,
`.ics`, indicação) e o prompt usam `site.url`/`site.nome`. Falta: o grupo sai
da linha (instância → corretor → grupo), `getEmpreendimentos`, `site` e
`linkDaPagina` recebem o grupo, `dominioDoGrupo(grupoId)` canônico, URL da
plataforma separada.
Evidência: `resolverMidia.ts:173,212`; `apresentacaoDigital.ts:60`;
`aiAgent.ts:521,556`; `linksAcoes.ts:59,214`; `agenda/[token]/route.ts:56-62`;
`linkDeIndicacao.ts:20`; `campaignQueue.ts:99`.

### L46 · Domínio do painel, do login e da infraestrutura · I · F3
Áreas: site, painel, integrações. Não está dito em que domínio fica o painel;
cookie de sessão é por host; login de A pelo domínio de B; webhook da Evolution,
retorno do OAuth do Gmail, pg_cron e autoDisparo presos ao domínio que vira o
da Next Home; matcher do proxy exclui `api/` e arquivos com ponto (sitemap,
robots); Host desconhecido e previews. Sugestão: painel e infraestrutura no
domínio da plataforma (depende da pergunta 3, domínio da plataforma).
Evidência: `proxy.ts:55-106`; `gmail/conectar/route.ts:21-34`;
`provider.ts:81-170`; `autoDisparo.ts:56-61`.

### L47 · `<dominio>/corretor/<slug>` colide com o painel · I · F3
Áreas: site, painel, marketing, integrações. `/corretor/*` é o painel com
login e está no robots; a página pública hoje é `/corretores/<slug>`. O desenho
deve dizer `/corretores/<slug>`.

### L48 · Slug do corretor e o que pende dele · I · F3
Áreas: banco, WhatsApp/IA, painel, site, integrações. Instância da Evolution
`nexthome-<slug>` com unique global; conectar/desconectar recalculam o nome
pelo slug (com slug repetido, o corretor de B desconecta a instância de A ou
herda o número dela); `?corretor=` de outro grupo vale; e-mail de reserva.
Fazer: instância identificada por id, slug do corretor por grupo, cookie
conferido contra o grupo do site.
Evidência: `whatsapp/acoes.ts:30-32,224,287-298,413-414`; `0018:8`.

### L49 · `corretor_destaques` tem FK em `empreendimentos(slug)` · I · F3
Áreas: banco, painel. Impede `unique(grupo_id, slug)`. Trocar por
`empreendimento_id`. Evidência: `0015:15-17,37`.

### L50 · Pixel único embutido no build · B · F3
Áreas: site, integrações. O §6 o põe no site e o §13 na fase 7; até haver Pixel
por grupo, todo evento dos outros sites iria para a conta da Next Home. Fazer:
desligado fora do grupo dono do ID já na fase 3.
Evidência: `PixelMeta.tsx:51`; layouts públicos.

### L51 · Verificação do Search Console da Next Home servida em todo domínio · B · F3
Áreas: site. `public/googleecdb70d74ecd3e26.html` sai em qualquer Host; a conta
Google da Next Home se verificaria como dona do domínio de B. Fazer: verificação
por grupo (meta tag ou DNS), arquivo estático removido.

### L52 · Porteiro e mensagem pronta citam "Next Home" · B · F3
Áreas: WhatsApp/IA, site. `mensagemDoSite()` e `PREFIXO_DO_SITE` fixos: trocar
o texto por grupo sem ensinar o porteiro descarta o visitante (defeito de
28/09). Evidência: `mensagensDoSite.ts:62-66`; `porteiro.ts:44,159-166`.

### L53 · Marca da Next Home fixa fora do site · B · F3
Áreas: WhatsApp/IA, painel, marketing, site, produto. Painel (títulos, login,
fila de cadastro, importador, playground, Gmail), e-mail de queda e remetente,
sonda, GET do webhook, vídeo (logo e paleta), carrossel ("NEXT HOME"),
legenda (#nexthome), `{imovel}` vazio → "lançamentos em Alphaville", capa
padrão = logotipo da Next Home, og-image com URL de produção, vinheta, fundos.
Evidência: `saudeDaConexao.ts:254-261`; `email.ts:34`; `sonda.ts:116`;
`worker.ts:63,94`; `render.ts:44-50`; `renderizarSlide.ts:32-127`;
`legenda.ts:26`; `campaignQueue.ts:64`; `mappers.ts:67-114`; `layout.tsx:84,95`.

### L54 · Regiões, mapa e globo fixos em Alphaville · I · F3
Áreas: site. Lista fixa em `lib/regioes.ts` (404 para grupo de outra cidade),
centro do mapa e do globo em Alphaville.

### L55 · Páginas por token não conferem o grupo do token contra o Host · I · F3
Áreas: site. Seleção, proposta, portal e documentos abrem em qualquer domínio
com a marca do Host; a seleção filtra pelo catálogo do Host;
`/selecao/[token]/ir/[slug]` quebra com slug por grupo. Fazer: grupo vem do
token; Host divergente redireciona.

### L56 · Cache de rota é por caminho, não por Host · I · F3
Áreas: site. `revalidate = 300`, `generateStaticParams` e `revalidatePath`
servem o HTML de um grupo nos domínios dos outros assim que a F2b de
performance tirar o `cookies()` do layout. Fazer: reescrita para segmento por
grupo ou guarda que mantém tudo dinâmico.

### L57 · Storage sem lugar para a marca do grupo e com material interno público · I · F3
Áreas: banco, marketing. Sem caminho/policy para logotipo e fundo do grupo;
referências do estúdio, artes, PDF do book e mídia de rascunho em bucket
público com URL estável.

### L58 · Política de privacidade e termos por grupo · I · F3
Áreas: site, produto. Página única com a Next Home como controladora, sem
operador, sem transferência ao Canadá, sem termos de uso; o cliente final do
WhatsApp não recebe aviso (pergunta 11).

### L59 · Endereço antigo precisa redirecionar · M · F3
Áreas: marketing. Links assados em mp4, carrossel, legenda e fila quebram
quando o grupo liga domínio próprio, é suspenso ou cancelado.

### L60 · Migrations e scripts de catálogo escrevem por slug · I · F3
Áreas: banco, marketing. `0128`, `0136-0142`, `0151`, `0057` (update em todas
as instâncias), `trazerFotosCuradas.ts`, `migrar.ts` (`codigo_legado` global).
Com slug por grupo atingem o imóvel errado. (A regra "nomeia o grupo" entra já
na fase 1, L22.)

### L61 · Tela "Marca" e guia de instalação do modelo antigo · M · F3
Áreas: produto, integrações. A tela gera `NEXT_PUBLIC_MARCA` para colar na
Vercel; `docs/INSTALAR-NOVO-CLIENTE.md` descreve uma instalação por cliente.
Aposentar os dois quando a marca vier do grupo.

---

## Fase 4 — IA de cada grupo

### L62 · Ficha completa e confiável não tem fase · I · F4
Áreas: painel. O §4 a torna requisito (é o que o gestor vê e o que fica quando
o corretor sai) e nenhuma fase a entrega. Precisa estar pronta antes da fase 5.

### L63 · O funil mostra ficha e conversa INVENTADAS · B · F4 (conserto pode sair antes)
Áreas: painel. `ModalDossieLead` exibe orçamento de R$ 1.850.000, "Alphaville
por segurança" e uma resposta da IA citando "Canvas Alphaville" fixos no
código. Evidência: `funil/ModalDossieLead.tsx:20-186`.

### L64 · Literais de Barueri/Alphaville no funil, dossiê e mensagens · I · F4
Áreas: WhatsApp/IA. "Em qual região de Barueri", exemplos do dossiê, alerta
"Imóveis em Alphaville", estilo da casa.
Evidência: `jogada.ts:939`; `aiAgent.ts:561,589`; `dossierExtractor.ts:13`;
`brokerNotifier.ts:68`.

### L65 · Segmento "alto padrão" fixo e precedência grupo × instância · I · F4
Áreas: WhatsApp/IA. Identidade, tom padrão e opção da tela dizem "alto padrão".
Falta o segmento entre os itens configuráveis e a regra de precedência entre
nome/tom do grupo e os que já existem por instância.

### L66 · IAs de marketing fora da configuração do grupo · I · F4
Áreas: marketing. Descrição do imóvel ("imobiliária de Alphaville"), variação
de lista (tom e nome fixos), legenda (proíbe valor), tradutor e estúdio.

### L67 · Evals medem só a Next Home · I · F4
Áreas: WhatsApp/IA. Nome "Sofia", tom e fixture fixos; `falou_valor` reprova o
que outro grupo permite; `PROMPT_VERSAO` deixa de identificar o prompt;
`gerarFixtureCatalogo` lê pelo `anon`.

### L68 · Fuso de São Paulo fixo · M · F4
Áreas: banco, marketing. Reserva de visita, cota diária, aquecimento, janela
anti-ban, teto de imagem, ciclo de vídeo e gasto por dia. Grupo do AM/MT/MS/RO
/RR/AC teria grade de visita com uma hora de erro. O fuso entra na configuração
de região.

---

## Fase 5 — Saída do corretor

### L69 · Corretor pode apagar ou arquivar leads do grupo antes de sair · I · F5
Áreas: painel. Desde a 0145 o corretor exclui os próprios leads, com conversa e
ficha. Fazer: só exclui lead de origem dele (depende da etiqueta).

### L70 · Mover o login de grupo × grupo derivado de `corretor_id` · I · F5
Áreas: banco. Mover `corretores.grupo_id` deixa vendas, impulsionamentos, metas
e anotações com grupo diferente da mãe. Decidir entre mover a linha e criar
ficha nova no destino com o `user_id` transferido (decisão do construtor).

### L71 · Material de marketing e link pessoal na saída · I · F5
Áreas: marketing, site. Artes, vídeos, estúdio, créditos, listas, templates,
impulsionamentos e destaques não estão no §9; o link `?corretor=` já assado em
peças e bios continua levando lead para a roleta do grupo antigo.

---

## Fase 6 — Catálogo compartilhado

### L72 · Fila de cadastro (`catalogo_candidatos`) só existe para Barueri · M · F6
Áreas: banco, marketing. Decidir se vira embrião da base da plataforma (a parte
de isolamento é L28, fase 1).

---

## Fase 7 — Integrações por grupo

### L73 · Credenciais por grupo sem lugar; tokens em texto puro · I · F7
Áreas: banco, integrações. `contas_email_google.refresh_token` em texto puro
(dá leitura da caixa inteira); tokens da Meta por grupo iriam para o mesmo
lugar. Fazer: cofre (Vault/pgsodium) e rotação. Evidência: `0125:93-106`.

### L74 · Meta por grupo: chaves e roteamento globais · M · F7
Áreas: integrações, banco. `meta_ads_metricas` com PK `(dia, campanha_id)`;
`marketing_campanhas` com `conta_externa_id = 'legacy'` e unique global; um só
`META_PAGE_ACCESS_TOKEN` que ignora `page_id`; o cron sincroniza uma conta.
Evidência: `0053:24`; `0065:5-49`; `webhooks/meta/route.ts:25-33,125`.

---

## Fase nova — Operação e ciclo de vida (antes do primeiro cliente externo)

### L75 · Planos pagos (Vercel Pro, Supabase Pro) sem fase · B · NOVA
Áreas: integrações, produto. O Hobby proíbe uso comercial; organização do
Supabase está no free (sem backup recuperável); domínio próprio por grupo e
PITR dependem disso.

### L76 · Alertas e CI que avisa · I · NOVA
Áreas: integrações, produto. Crédito da OpenAI, Evolution fora, worker de
vídeo falhando, cron com 4xx/5xx, CI vermelho (já ficou 15 dias).

### L77 · Evolution como infraestrutura de centenas de instâncias · I · NOVA
Áreas: WhatsApp/IA, integrações. Um servidor, uma chave que lê e envia por
qualquer número, segredo de webhook global aceito para qualquer instância
(a coluna por instância existe e não é usada), sem backup das sessões, sem
limpeza das instâncias de quem sai.
Evidência: `provider.ts:56-170`; `webhooks/whatsapp/route.ts:193-218`.

### L78 · Escala e justiça entre grupos nos crons · I · NOVA
Áreas: banco, WhatsApp/IA, marketing, integrações. Disparador lê instâncias
sem ordem e para no orçamento de 60 s; tetos globais (2 respostas atrasadas, 10
follow-ups, 20 listas, `limit 50`, 1 caixa do Gmail a cada 5 min); trava da
roleta `pg_advisory_xact_lock(hashtext('roleta_leads'))` serializa a plataforma
inteira. Fazer: rodízio por grupo.
Evidência: `campaignDispatcher.ts:79-86,235-262`; `cron/followups/route.ts:64-646`;
`0115:275`.

### L79 · Render de vídeo no GitHub Actions · I · NOVA
Áreas: marketing. Grátis só por ser repositório público (logs públicos); fila
FIFO global, uma execução por vez, `ref` na branch da Next Home, secrets de
produção sem ambiente de teste.
Evidência: `video/fila.ts:156-163`; `render-video.yml:42-83`.

### L80 · Encerramento de grupo · I · NOVA
Áreas: banco, produto. Só existe suspender/reativar. Falta exportar e apagar
tudo (linhas, Storage público, instâncias da Evolution, logins do Auth que
prendem o e-mail, tokens do Gmail, domínio ligado), com auditoria. Prazo de
guarda após cancelar é a pergunta 7.

### L81 · Pedido do titular (LGPD art. 18): excluir lead deixa dados espalhados · I · NOVA
Áreas: produto. FKs `on delete set null` deixam `ia_correcoes`,
`ia_interacoes.contexto`, `whatsapp_campanhas_fila`, `inbound_logs`,
`ativacoes_em_lead_alheio`, `historico_envios`; documentos no bucket
`documentos-clientes` não são apagados. Falta quem recebe o pedido e o prazo.

### L82 · Retenção por tipo de dado · I · NOVA
Áreas: produto. Só as artes expiram. Mensagens, telemetria com dossiê, payload
de portal e documentos ficam para sempre.

### L83 · Exportação dos dados · I · NOVA
Áreas: produto. Nenhuma tela exporta leads, fichas, vendas, catálogo ou
conversas; a política de privacidade promete portabilidade.

### L84 · Pronto para vender · I · NOVA
Áreas: produto. Domínio da plataforma (pendente), site de vendas com planos,
termos e privacidade da plataforma como operadora, conta de demonstração fora
dos dados de produção.

---

## Dependem de decisão do dono do produto

### L85 · Login com e-mail de fachada, senha padrão, sem recuperação · B · DECISÃO (pergunta 2) → F2
Áreas: painel, produto. `<nome>@nexthome.com` (domínio de terceiro) com senha
`nexthome`+4 dígitos; e-mail do Auth é único na plataforma, então colide entre
grupos; sem convite nem "esqueci a senha"; a redefinição do primeiro gestor
passa pelo Matheus.
Evidência: `credenciaisIniciais.ts:24-109`.

### L86 · Mesmo WhatsApp conectado em dois grupos · I · DECISÃO (pergunta 4) → F2
Áreas: banco, WhatsApp/IA, marketing. Dedup global de `provider_message_id`
faz o segundo grupo perder a mensagem calado; cota, espaçamento, aquecimento e
disjuntor são por instância, então o mesmo chip manda o dobro. Se for
permitido: chave de dedup por instância e anti-ban por telefone. Se for
proibido: unique de telefone conectado.
Evidência: `0027:11-13`; `0158:20`; `0062:57,101-103`; `repositorio.ts:749-792,2029-2061`.

### L87 · Gmail para clientes exige verificação do Google · I · DECISÃO (pergunta 10) → F7
Áreas: integrações, produto. `gmail.readonly` é restrito: app Interno não serve a
outras empresas e o modo Teste vence a cada 7 dias. Verificação + avaliação
anual de segurança tem custo e prazo.

### L88 · Lixeira ou exclusão imediata · I · DECISÃO (pergunta 8) → NOVA
Áreas: produto. Backup do Supabase restaura o banco inteiro; desfazer o erro de
um grupo voltaria todos no tempo. Lixeira com prazo resolve sem restaurar.
