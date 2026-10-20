# Fase 2D enxuta — regras de operação (20/10/2026)

Escopo decidido com o dono: (a) um número de WhatsApp pertence a um grupo só;
(b) aceite dos termos de uso no primeiro acesso ao painel. Nada de cobrança.
O resto da fase 2D (pode-operar único, teto por corretor, suporte, saúde por
grupo) fica para depois.

Spec: `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
§19 (resposta 4: número proibido em dois grupos, trava no banco) e §18
Fase 2 ("aceite de termos por usuário antes de conectar o número"). Lacunas
L44 e L86.

## (a) Número em um grupo só

Decisões:

- **A trava é por GRUPO, não por instância.** Índice único em
  `telefone_conectado` também proibiria o mesmo número em duas instâncias do
  mesmo grupo — e `telefone_conectado` não é apagado quando a sessão cai, só
  no "Desconectar". Um corretor que sai sem desconectar travaria o número
  para o colega do mesmo grupo. Por isso: gatilho, não índice.
- **Gatilho `corretor_whatsapp_instancias_10_numero_de_um_grupo`** (`before
  insert or update of telefone_conectado, grupo_id`, depois do carimbo
  `_00_grupo`): compara só os dígitos; se outra instância de OUTRO grupo
  tiver o mesmo número em `telefone_conectado`, recusa com
  `numero_em_outro_grupo`. Trava de transação por número
  (`pg_advisory_xact_lock`) para dois grupos no mesmo segundo não passarem
  os dois. Reconexão do mesmo número no mesmo grupo nunca é recusada.
- **"Ocupado" = `telefone_conectado` preenchido**, conectado ou com a sessão
  caída. Liberar o número é o "Desconectar" do grupo antigo (corretor ou
  gestor), que apaga `telefone_conectado`.
- **`numero_whatsapp_em_outro_grupo(p_grupo, p_telefone)`**, `security
  definer`, só `service_role`: o código pergunta ANTES (sim/não, sem dizer
  qual grupo) para recusar com frase clara.
- **Coluna `numero_recusado_em`** em `corretor_whatsapp_instancias`: o
  número pareou no WhatsApp mas é de outro grupo; o servidor derruba a
  conexão na Evolution e carimba. A tela mostra a frase mesmo quando quem
  descobriu foi o webhook. Estado do servidor (fora do grant da sessão).

Código:

- `src/lib/whatsapp/numeroDeUmGrupo.ts` (puro + rpc por cliente recebido):
  `digitosDoNumero`, `numeroEmOutroGrupo(cliente, grupo, telefone)`,
  `FRASE_NUMERO_EM_OUTRO_GRUPO`, `ehRecusaDeNumero(erro)`.
- `conectarWhatsapp` (pareamento por código): pergunta antes de chamar a
  Evolution.
- `sincronizarConexaoInstancia` e `registrarEventoConexao`: número aberto de
  outro grupo → `recusarNumeroDeOutroGrupo` (logout na Evolution, status
  desconectado, carimbo) em vez de marcar conectado.
- `verificarConexaoWhatsapp` devolve `recusado`; `PainelConexao` mostra a
  frase e para de perguntar; a página mostra a frase vinda do carimbo.

## (b) Aceite dos termos

- Tabela `aceites_de_termos (id, grupo_id, corretor_id, versao, aceito_em)`,
  única por `(corretor_id, versao)`. Grupo pelo carimbo (mãe `corretores`),
  policy restritiva por grupo, `revoke all` de anon e authenticated, `select`
  e `insert (corretor_id, versao)` só para o próprio corretor (gestor lê os
  da equipe). Sem update nem delete: aceite não se desfaz.
- `src/lib/termos/termos.ts`: `VERSAO_DOS_TERMOS`, o texto (RASCUNHO para o
  advogado) e `caminhoDepoisDoAceite`.
- `src/lib/termos/aceite.ts`: `aceitouTermosVigentes(cliente, corretorId)`
  — erro de leitura NÃO bloqueia o painel (a migration pode chegar depois do
  deploy), só loga.
- Página `src/app/corretor/termos/` FORA do grupo `(painel)` (sem loop):
  texto, botão "Li e aceito", e "Sair". A action grava pela sessão e vai para
  `/corretor/senha` se a senha ainda é provisória, senão `/corretor`.
- O layout `(painel)` redireciona para `/corretor/termos` quem não aceitou a
  versão vigente. Login, "esqueci a senha", definir senha do convite e o
  retorno do e-mail moram fora do `(painel)` e seguem livres; "Sair" existe
  na própria página dos termos.
- `conectarWhatsapp` também recusa sem aceite (o risco do número é do
  corretor, L44).

## Testes

- `numeroDeUmGrupo.test.ts` (puro), `numeroDeUmGrupo.db.test.ts` (gatilho e
  função com dois grupos; reconexão no mesmo grupo passa).
- `repositorio` — recusa no evento de conexão (banco falso).
- `termos.test.ts`, `aceite.db.test.ts` (RLS: corretor só grava o próprio,
  não lê o de outro grupo).
- `layoutTermos.test.ts` (guarda de código: o layout redireciona; a página
  mora fora do `(painel)`; a página tem "Sair").
- Guardas existentes: `estadoDoNumero` (coluna nova no ESTADO),
  `funcoesSeguras`, `tabelasSeguras`, `isolamento`.

## Migration

`0198_regras_de_operacao.sql` (não aplicada em produção; vai antes do
deploy: o código antigo não lê nada dela, e o código novo tolera a ausência).
