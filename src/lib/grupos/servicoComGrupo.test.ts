import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";
import { leiturasDe, semComentarios, type Leitura } from "./codigoFonte";

/**
 * A chave de serviço classificada por grupo (Task 7, L13, L16, L17, L18, L22).
 *
 * A chave de serviço ignora a RLS: ela enxerga TODOS os grupos. Cada arquivo
 * que a usa (`createServiceClient`, ou a leitura da equipe
 * `clienteParaNumerosDaEquipe`) está declarado em MAPA com a categoria que
 * explica por que ele não atravessa grupos, e a guarda cobra o que cada
 * categoria promete:
 *
 * - `por-id`: age numa linha alcançada por id de fonte confiável (instância
 *   do webhook, token, id validado pela sessão). `validadoPor` é a FUNÇÃO
 *   que validou, chamada (`nome(`) antes do primeiro `createServiceClient()`,
 *   ou o trecho de código que valida (a leitura pelo token, a leitura pela
 *   sessão). Nome de parâmetro não vale.
 * - `helper`: recebe o id por parâmetro e não valida nada. A prova mora em
 *   quem importa: cada importador está no MAPA ou em IMPORTADORES e chama a
 *   validação antes de usar o que importou, no mesmo ponto de entrada.
 * - `equipe`: lê várias pessoas para mostrar ao usuário. Cada leitura
 *   (`.from("x")...select`) do arquivo FILTRA o grupo no mesmo encadeamento
 *   (`.eq("grupo_id", x)` ou `.in("grupo_id", xs)`; na lista do `select` não
 *   conta), ou passa pela leitura recortada (`.ler(`/`.lerView(` de
 *   `leituraDoGrupo`), que aplica o grupo por construção.
 * - `agrega-por-grupo`: cron que soma números. Lê a lista de grupos e roda
 *   um laço; toda outra leitura obedece à regra de `equipe` (os números E os
 *   destinatários são do grupo da volta).
 * - `cruza-conjuntos`: cron que junta duas listas. As leituras filtram o
 *   grupo, e o casamento compara o grupo das duas linhas; só o primeiro
 *   lado, casado depois da leitura, pode ter o grupo apenas na projeção.
 * - `plataforma`: só o que age linha a linha, sem juntar nem somar (cada
 *   linha fica no próprio grupo).
 * - `plataforma-admin`: a área `/plataforma`, que lê VÁRIOS grupos de
 *   propósito (o painel do administrador da plataforma). A chave só entra
 *   depois de `exigirAdminDaPlataformaNaPagina`/`NaAcao` no mesmo ponto de
 *   entrada, ou numa função exportada que recebe a prova dessa guarda
 *   (`_prova: { userId: string }`) — e aí todo importador chama a guarda
 *   antes de usá-la. Nenhuma consulta toca tabela de conversa, mensagem,
 *   dossiê ou nota (§4, §11: o administrador nunca vê conversa nem ficha), e
 *   `leads` só entra para CONTAR (`select` com `head: true`).
 *
 * Arquivo novo fora do MAPA reprova pedindo a categoria. A regressão é
 * calada: o código segue funcionando com um grupo só.
 *
 * Os scripts com chave secreta (`scripts/`) exigem `--grupo` e recusam grupo
 * diferente do 1 (`grupoDoScript`). Os logs do áudio e do e-mail não levam
 * conteúdo de conversa.
 */

type Categoria =
  | { categoria: "por-id"; validadoPor: string }
  | { categoria: "equipe" }
  | { categoria: "agrega-por-grupo" }
  | { categoria: "cruza-conjuntos"; lados: [string, string] }
  | { categoria: "plataforma" }
  | { categoria: "plataforma-admin" }
  | { categoria: "helper" };

type Entrada = Categoria & { motivo: string };

/** Motivo comum do painel: o id vem do navegador e a sessão o confere. */
const POR_SESSAO = "id lido ou conferido pela sessão do usuário antes de a chave agir";

const MAPA: Record<string, Entrada> = {
  // ── Scripts: o grupo vem de --grupo, validado antes da chave ──────────────
  "scripts/catalogo/gerarVariantes.ts": { categoria: "por-id", validadoPor: "grupoDoScript", motivo: "--grupo validado; as mídias lidas são do imóvel do grupo" },
  "scripts/catalogo/operacao0129.ts": { categoria: "por-id", validadoPor: "grupoDoScript", motivo: "--grupo validado; os imóveis lidos são do grupo" },
  "scripts/catalogo/trazerFotos0128.ts": { categoria: "por-id", validadoPor: "grupoDoScript", motivo: "--grupo validado; o imóvel alvo é lido no grupo" },
  "scripts/catalogo/trazerFotos0137.ts": { categoria: "por-id", validadoPor: "grupoDoScript", motivo: "--grupo validado; o imóvel alvo é lido no grupo" },
  "scripts/catalogo/trazerFotosCuradas.ts": { categoria: "por-id", validadoPor: "grupoDoScript", motivo: "--grupo validado; o imóvel alvo é lido no grupo" },
  "scripts/catalogo/trazerVideos0128.ts": { categoria: "por-id", validadoPor: "grupoDoScript", motivo: "--grupo validado; o imóvel alvo é lido no grupo" },
  "scripts/ops/conferirLista.ts": { categoria: "por-id", validadoPor: "grupoDoScript", motivo: "--grupo validado; a lista pedida só é lida no grupo" },
  "scripts/ops/retomarLista.ts": { categoria: "por-id", validadoPor: "grupoDoScript", motivo: "--grupo validado; a lista pedida só é lida no grupo" },
  "scripts/video/worker.ts": { categoria: "plataforma", motivo: "worker de render: pega um job por vez da fila, e cada job grava no próprio grupo" },

  // ── Páginas e rotas por token: o token sorteado é a credencial ────────────
  "src/app/s/[site]/(institucional)/contador/[token]/baixar/route.ts": { categoria: "por-id", validadoPor: "lerAcessoContador", motivo: "token do contador; o arquivo é lido no grupo do link" },
  "src/app/s/[site]/(institucional)/contador/[token]/page.tsx": { categoria: "por-id", validadoPor: "lerAcessoContador", motivo: "token do contador; os meses são lidos no grupo do link" },
  "src/app/s/[site]/(institucional)/documentos/[token]/acoes.ts": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; age no lead do link" },
  "src/app/s/[site]/(institucional)/documentos/[token]/page.tsx": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; lê a documentação do lead do link" },
  "src/app/s/[site]/(institucional)/parceiro/[token]/acoes.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "a primeira leitura é a do parceiro pelo token; o resto filtra o grupo dele" },
  "src/app/s/[site]/(institucional)/parceiro/[token]/page.tsx": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "a primeira leitura é a do parceiro pelo token; o espelho filtra o grupo dele" },
  "src/app/s/[site]/(institucional)/portal/[token]/page.tsx": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; lê só o lead do link" },
  "src/app/s/[site]/(institucional)/proposta/[token]/acoes.ts": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; grava o evento do link" },
  "src/app/s/[site]/(institucional)/proposta/[token]/page.tsx": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; lê os eventos do link" },
  "src/app/s/[site]/(institucional)/selecao/[token]/ir/[slug]/route.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "a leitura do link pelo token decide; o imóvel só conta se estiver na seleção dele" },
  "src/app/api/agenda/[token]/route.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "token da agenda .ics; lê as visitas do corretor dono do token" },
  "src/app/corretor/actions.ts": { categoria: "por-id", validadoPor: "exigirSessao", motivo: "a chave só grava a ficha do próprio usuário da sessão (filtro por user_id da sessão)" },
  "src/app/corretor/completar-cadastro/acoes.ts": { categoria: "por-id", validadoPor: "supabase.auth.getUser()", motivo: "primeiro acesso: a chave grava só a ficha do user_id da sessão verificada" },
  "src/lib/crm/enviosDeLeadParaGrupo.ts": { categoria: "plataforma", motivo: "fila dos avisos nos grupos, lida pelo cron; cada linha carrega o grupo e toda leitura filtra por ele" },
  "src/lib/crm/linkPublico.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "é a leitura do link pelo token: devolve o grupo do link a quem chama" },
  "src/lib/financeiro/acessoContador.ts": { categoria: "por-id", validadoPor: "tokenComFormatoValido", motivo: "token do contador; devolve o grupo do link a quem chama" },
  "src/lib/crm/eventosDoLink.ts": { categoria: "helper", motivo: "grava o evento do link cujo token quem chama acabou de validar" },
  "src/lib/crm/visualizacoesDaVitrine.ts": { categoria: "helper", motivo: "vitrine (0245, 29/10/2026): grava a visualização do link cujo token quem chama acabou de validar (lerLinkPublico, rota do clique); o grupo vem do carimbo pelo token" },
  "src/app/s/[site]/(institucional)/v/[codigo]/route.ts": { categoria: "por-id", validadoPor: '.eq("codigo", codigo)', motivo: "link curto da vitrine (0245): a leitura pelo código sorteado só devolve o token, e a seleção confere token e validade" },

  // ── Portas de entrada públicas e webhooks: grupo explícito ou credencial ──
  "src/app/api/clique-whatsapp/route.ts": { categoria: "por-id", validadoPor: "siteDaRequisicao", motivo: "grava no grupo do site; corretor do corpo só vale se for do grupo" },
  "src/app/api/leads/route.ts": { categoria: "por-id", validadoPor: "siteDaRequisicao", motivo: "grava no grupo do site; corretor e imóvel do corpo só valem se forem do grupo" },
  "src/app/wa/route.ts": { categoria: "por-id", validadoPor: "siteDaRequisicao", motivo: "porteiro: sorteia e grava o clique no grupo do site" },
  "src/app/wa/[campanha]/route.ts": { categoria: "por-id", validadoPor: "siteDaRequisicao", motivo: "porteiro: imóvel e sorteio dentro do grupo do site" },
  "src/app/api/webhooks/meta/route.ts": { categoria: "por-id", validadoPor: "assinaturaValida", motivo: "assinatura da Meta; integração presa ao grupo 1 até a fase 7" },
  "src/app/api/webhooks/asaas/route.ts": { categoria: "por-id", validadoPor: "tokenDoAsaasValido", motivo: "token do webhook do Asaas (0241, 29/10/2026) conferido antes da chave; o grupo sai da assinatura/cliente do pagamento gravados em grupos" },
  "src/app/api/webhooks/portais/[portal]/route.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "webhook dos portais (0245, 29/10/2026): o token sorteado da URL decide a integração e o grupo; nada do corpo escolhe grupo" },
  "src/lib/portais/receberLead.ts": { categoria: "helper", motivo: "grava o lead do portal na integração que a rota validou pelo token; leituras e recibo com o grupo dela" },
  "src/lib/inbound/gravarLeadsRecebidos.ts": { categoria: "helper", motivo: "miolo comum do e-mail e dos portais (29/10/2026): grupo explícito de quem chama; leituras com grupo_id (portas.test.ts)" },
  "src/app/api/webhooks/whatsapp/route.ts": { categoria: "por-id", validadoPor: "resolverInstancia", motivo: "a instância (com o segredo dela) decide o corretor e o grupo da mensagem" },
  "src/lib/whatsapp/repositorio.ts": { categoria: "helper", motivo: "parte da instância que o webhook validou pelo segredo; a palavra-chave filtra o grupo dela" },
  "src/lib/inbound/processarEmail.ts": { categoria: "helper", motivo: "grupo explícito de quem chama (portal = grupo 1; Gmail = grupo da conta); leituras com grupo_id (portas.test.ts)" },

  // ── Painel: o id vem do navegador e é conferido pela sessão ───────────────
  "src/app/api/notificacoes/route.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "inscreve o aparelho só para o corretor da sessão, no grupo dele" },
  "src/app/corretor/(painel)/marketing/impulsionamentos/RoletaDosAnuncios.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "roleta do grupo da sessão; o corretor comum só lê a dele" },
  "src/app/corretor/(painel)/marketing/impulsionamentos/roletaAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "grava a roleta do próprio número, ou de quem o gestor escolheu, no grupo da sessão" },
  "src/app/corretor/(painel)/_componentes/acoesDasNotificacoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "notificação de teste só para os aparelhos do corretor da sessão" },
  "src/app/corretor/(painel)/_componentes/acoesRapidas.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "pausa a IA e liga a roleta só do número do corretor da sessão" },
  "src/app/corretor/(painel)/_componentes/ControlesRapidos.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "lê o modo da IA e a roleta só do corretor da sessão" },
  "src/app/api/gmail/retorno/route.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/api/imagens/gerar/route.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "a mídia do catálogo só é lida no grupo do corretor da sessão (L16)" },
  "src/app/api/painel/contador-excel/route.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "o mês é lido no grupo do gestor da sessão" },
  "src/app/api/painel/dados-do-grupo/route.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "a chave só grava o registro da exportação; os dados são lidos pela sessão no grupo do gestor (0202)" },
  "src/app/plataforma/grupos/[id]/exportar/route.ts": { categoria: "por-id", validadoPor: "exigirAdminDaPlataformaNaAcao", motivo: "EXCEÇÃO declarada ao §4: só grupo com cancelamento registrado (resposta 7 do dono); lê os dados de UM grupo, o do id da rota, sem conversa (exportacaoDoGrupo.test.ts), e registra o download no grupo (0202)" },
  "src/app/api/painel/fichas-do-corretor/route.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "a chave só grava o registro da exportação; o corretor e as fichas são lidos pela sessão no grupo do gestor" },
  "src/app/corretor/(painel)/_componentes/acoesMensagemPelaIA.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/_componentes/acoesSugestao.ts": { categoria: "por-id", validadoPor: "sugestaoDoCorretor", motivo: "a sugestão é lida pela sessão (RLS) antes de a chave mudar o status" },
  "src/app/corretor/(painel)/_componentes/acoesVisitaCombinada.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/admin/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "toda escrita pela chave filtra o grupo do gestor" },
  "src/app/corretor/(painel)/admin/anuncios/ContaDaMeta.tsx": { categoria: "por-id", validadoPor: "exigirGestorNaPagina", motivo: "a única leitura pela chave (cliques) filtra o grupo do gestor; Meta só no grupo 1" },
  "src/app/corretor/(painel)/admin/portais/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "liga, troca o token e desliga a integração com portais (0245) só no grupo do gestor" },
  "src/app/corretor/(painel)/admin/portais/page.tsx": { categoria: "por-id", validadoPor: "exigirGestorNaPagina", motivo: "lê o token e os recibos dos portais (0245) só do grupo do gestor" },
  "src/app/corretor/(painel)/admin/parceiros/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "trocar o link confere o grupo do gestor (L16)" },
  "src/app/corretor/(painel)/admin/whatsapp/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "derrubar o número confere o grupo do gestor (L16)" },
  "src/app/corretor/(painel)/conversas/acoes.ts": { categoria: "por-id", validadoPor: "exigirSessao", motivo: "a conversa é lida pela sessão; a chave só assina URL de documento dela" },
  "src/app/corretor/(painel)/conversas/documentoAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/financeiro/contador/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "o arquivo do mês mora em <grupo>/<mês> do gestor" },
  "src/app/corretor/(painel)/leads/[id]/Documentacao.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/leads/[id]/PedidoDoSite.tsx": { categoria: "por-id", validadoPor: 'supabase.from("leads").select("detalhes, parceiro_id").eq("id", leadId)', motivo: "o parceiro é o do lead que a sessão acabou de ler (RLS de leads)" },
  "src/app/corretor/(painel)/leads/[id]/titularAcoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "o banco apaga o lead pela sessão do gestor (só o grupo dele); a chave só remove a pasta desse lead no Storage depois (0202)" },
  "src/app/corretor/(painel)/leads/[id]/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "corretor da sessão; o lead é lido pela RLS. A chave só tira do Storage o áudio do retorno do lead que o banco acabou de excluir (pasta do grupo dele)" },
  "src/app/corretor/(painel)/leads/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "corretor da sessão; os leads são lidos e excluídos pela RLS. A chave só tira do Storage o áudio do retorno dos leads que o banco excluiu" },
  "src/app/corretor/(painel)/leads/[id]/documentacaoAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/perfil/gmailAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/perfil/page.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/suporte/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "chamado com a Astro (0240): nome, ficha e grupo saem da sessão; a chave conta e insere chamados do corretor da sessão e lê o nome do grupo dele" },
  "src/app/corretor/(painel)/suporte/meusChamados.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "lista só os chamados com corretor_origem_id do corretor da sessão (0240)" },
  "src/app/corretor/(painel)/agenda/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/indique/page.tsx": { categoria: "por-id", validadoPor: "exigirGestorNaPagina", motivo: "indique e ganhe (0247, 29/10/2026): código e nome pela linha do grupo da sessão; indicações e créditos (tabelas globais) filtrados pelas colunas do grupo da sessão; das contas indicadas, só nome e situação" },
  "src/app/corretor/termo-de-adesao/page.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "termo de adesão (0247, 29/10/2026): lê a linha do grupo da sessão (plano, mensalidade, documento) e o aceite desse grupo" },
  "src/app/corretor/termo-de-adesao/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "termo de adesão (0247, 29/10/2026): só o gestor da sessão grava o aceite do PRÓPRIO grupo; ficha lida por id e grupo da sessão; hash do IP e navegador dos cabeçalhos da requisição" },
  "src/app/corretor/(painel)/agenda/page.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/agenda/acoesConfirmacao.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "pedido de confirmação da visita (0246): visita, lead e conversa lidos no grupo da sessão, só da visita que o corretor da sessão faz" },
  "src/app/corretor/(painel)/financeiro/desempenho/metasAcoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "metas da equipe (0246): corretores conferidos contra a equipe da sessão; toda escrita leva o grupo do gestor" },
  "src/app/corretor/(painel)/admin/leads/regrasAcoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "regras de distribuição (0246): quem recebe conferido contra a equipe da sessão; toda leitura e escrita leva o grupo do gestor" },
  "src/app/corretor/(painel)/whatsapp/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/whatsapp/BlocoDoCentral.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/lib/crm/estadoDosPrimeirosPassos.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "primeiros passos do Início (29/10/2026): a chave só CONTA os aparelhos com aviso (inscricoes_push, sem grant para a sessão) do corretor da sessão; o resto é contado pela sessão" },

  // ── Helpers: o id chega por parâmetro de quem chama ──────────────────────
  // Nada aqui valida: a prova mora em quem importa. A guarda `helper` cobra
  // que todo importador esteja no MAPA ou em IMPORTADORES e chame a validação
  // antes do primeiro uso do que importou (ou repasse a quem chama).
  "src/lib/consultor/repositorio.ts": { categoria: "helper", motivo: "corretor da sessão (consultor) e conversa conferida por conversaDoCorretor" },
  "src/lib/estudio/repositorio.ts": { categoria: "helper", motivo: "corretor da sessão (estúdio) e conversa conferida por conversaDoCorretor" },
  "src/lib/imagens/galeria.ts": { categoria: "helper", motivo: "corretor da sessão, passado pela rota de geração" },
  "src/lib/video/fila.ts": { categoria: "helper", motivo: "corretor da sessão; o worker pega o job pela trava, um por vez" },
  "src/lib/corretores/convite.ts": { categoria: "helper", motivo: "grupo provado por quem chama (gestor da sessão ou operador da plataforma); a ficha só é lida e escrita com o grupo no filtro" },
  "src/lib/crm/retornoPeloGrupo/audioNoStorage.ts": { categoria: "helper", motivo: "recebe o cliente da chave de quem validou o lead (sessão, gestor ou rotina do grupo); cada leitura filtra o grupo do lead e todo caminho é conferido contra a pasta desse grupo" },
  "src/lib/crm/retornoPeloGrupo/index.ts": { categoria: "plataforma", motivo: "o webhook autenticado entrega a mensagem do grupo; o grupo sai do número central configurado em grupos e o corretor do grupo de WhatsApp dele, sempre no mesmo grupo" },
  "src/lib/crm/retornoPeloGrupo/mensagemDoCliente.ts": { categoria: "plataforma", motivo: "aviso por lead ao dono atual, chamado pelo webhook autenticado; toda leitura filtra o grupo da instância" },
  "src/lib/crm/retornoPeloGrupo/situacao.ts": { categoria: "helper", motivo: "recebe o cliente e o grupo de quem conferiu o grupo de WhatsApp do corretor; cada leitura filtra grupo_id e corretor_id" },
  "src/lib/crm/retornoPeloGrupo/retornoNaFicha.ts": { categoria: "por-id", validadoPor: 'p.sessao.from("leads").select("grupo_id").eq("id", p.leadId)', motivo: "o grupo do lead é lido pela sessão (RLS) antes de assinar; link só para caminho da pasta desse grupo" },
  "src/lib/crm/agendaDoCorretor.ts": { categoria: "helper", motivo: "corretor da instância que o webhook validou" },
  "src/lib/notificacoes/push.ts": { categoria: "helper", motivo: "notifica os aparelhos do corretor que o chamador já escolheu" },
  "src/lib/crm/avisoAoCorretor.ts": { categoria: "helper", motivo: "manda ao próprio corretor, a partir da linha que o cron leu" },
  "src/lib/crm/envioAutorizado.ts": { categoria: "helper", motivo: "caminho <lead>/... montado por quem chama depois de validar o lead" },
  "src/lib/whatsapp/aberturaPelaIA.ts": { categoria: "helper", motivo: "conversa e instância do corretor validadas por quem chama (sessão ou webhook)" },
  "src/lib/whatsapp/aprendizadoContinuo.ts": { categoria: "helper", motivo: "exemplos só das conversas do corretor da instância" },
  "src/lib/whatsapp/importarHistorico.ts": { categoria: "helper", motivo: "conversa da instância que o webhook validou" },
  "src/lib/whatsapp/impulsionamentos.ts": { categoria: "helper", motivo: "lead e corretor da mensagem que o webhook validou" },
  "src/lib/whatsapp/midiaRecebida.ts": { categoria: "helper", motivo: "mídia da mensagem que o webhook validou, guardada na pasta do lead" },
  "src/lib/whatsapp/respostaAosFollowups.ts": { categoria: "helper", motivo: "conversa em atendimento, validada por quem chama" },
  "src/lib/agenda/respostaDaConfirmacao.ts": { categoria: "helper", motivo: "resposta ao pedido de confirmação (0246) na conversa que o webhook validou pela instância" },
  "src/lib/agenda/pedidoDeConfirmacao.ts": { categoria: "helper", motivo: "pedido de confirmação de UMA visita (0246) no grupo que quem chama provou (sessão do corretor ou a linha da varredura); toda leitura filtra esse grupo" },
  "src/lib/whatsapp/primeiroContatoNoEnvio.ts": { categoria: "helper", motivo: "conta e libera o primeiro contato do corretor que quem chama já resolveu (instância, dono da lista, sorteado da roleta)" },
  "src/lib/whatsapp/telemetria.ts": { categoria: "helper", motivo: "grava a interação da conversa que quem chama atendeu" },
  "src/lib/planos/consumoDaIa.ts": { categoria: "plataforma", motivo: "só INSERE a linha do livro do consumo (0233), uma por chamada paga; nunca lê. O grupo vem do corretor pelo carimbo, que confere o grupo informado contra ele" },
  "src/lib/marcaDoCrm/ler.ts": { categoria: "helper", motivo: "nome, logo e endereço principal do grupo que quem chama validou (sessão, ficha lida pelo cron, instância do webhook); lê UMA linha pelo id" },
  "src/lib/imovelPublico/ler.ts": { categoria: "helper", motivo: "slug do grupo, grupo pelo slug da URL (a ficha pública) e base do link do imóvel do grupo que quem chama validou; lê UMA linha de grupos" },
  "src/lib/sites/siteDoGrupo.ts": { categoria: "helper", motivo: "lê o site editável do grupo que quem chama provou (gestor da sessão ou o grupo que o endereço resolveu); UMA linha pelo id" },
  "src/lib/marcaDoCrm/gravarLogo.ts": { categoria: "helper", motivo: "grava a logo do grupo que quem chama provou (gestor da sessão ou operador da plataforma); só toca a linha e a pasta desse grupo" },
  "src/lib/whatsapp/casaDoGrupo.ts": { categoria: "helper", motivo: "identidade da IA (nome da casa, região, tom) do grupo que quem chama validou; lê UMA linha de grupos pelo id" },
  "src/lib/cobranca/webhookDoAsaas.ts": { categoria: "helper", motivo: "recebe o cliente da chave da rota que conferiu o token do Asaas; acha UM grupo pela assinatura/cliente do pagamento e grava o pagamento só nele (0241)" },
  "src/lib/plataforma/criarConta.ts": { categoria: "helper", motivo: "núcleo da criação de conta (29/10/2026): confere a própria prova antes de escrever (a guarda da plataforma de novo, ou o pedido do teste grátis relido pela chave) e só toca o grupo que acabou de criar" },
  "src/lib/planos/cobrancaDoGrupo.ts": { categoria: "helper", motivo: "cobrança do grupo que quem chama validou (instância do webhook ou do disparador, sessão do painel); toda leitura filtra o grupo (fase 2C)" },
  "src/lib/indicacoes/indicacao.ts": { categoria: "helper", motivo: "indique e ganhe (0247, 29/10/2026): recebe o cliente da chave de quem já provou o grupo (teste grátis que acabou de criar a conta, conversão do pedido e registro do pagamento depois da guarda da plataforma, webhook do Asaas pelo token); lê e grava só as linhas das duas contas da indicação" },
  "src/lib/planos/usoDaIa.ts": { categoria: "helper", motivo: "cota da IA do grupo que quem chama validou (instância do webhook, sessão, guarda da plataforma); toda leitura filtra o grupo" },

  // ── Telas da equipe: toda leitura filtra o grupo do gestor ────────────────
  "src/lib/admin/numerosDaEquipe.ts": { categoria: "equipe", motivo: "fonte da leitura recortada: só expõe consultas com o grupo aplicado" },
  "src/lib/agenda/lerAgenda.ts": { categoria: "equipe", motivo: "agenda do próprio corretor; toda leitura filtra grupo e corretor da sessão" },
  "src/app/corretor/(painel)/agenda/acoesDaEquipe.ts": { categoria: "equipe", motivo: "gestor passa visita; visita e destino lidos no grupo da sessão" },
  "src/lib/agenda/lerVisitaRecebida.ts": { categoria: "equipe", motivo: "visita do corretor da sessão, no grupo dele, ainda marcada" },
  "src/lib/agenda/compromissos.ts": { categoria: "equipe", motivo: "reuniões e bloqueios; toda consulta filtra o grupo passado pela sessão ou pelo número do corretor" },
  "src/lib/agenda/confirmacao.ts": { categoria: "plataforma", motivo: "cobrança por visita, ao corretor que a faz (grupo da própria linha)" },
  "src/lib/agenda/conversaDeAgenda.ts": { categoria: "helper", motivo: "estado da conversa do corretor que quem chama já resolveu" },
  "src/app/corretor/(painel)/_componentes/acoesDaVisitaPassada.ts": { categoria: "equipe", motivo: "resposta da visita pelo corretor da sessão (responder_visita confere quem fez)" },
  "src/lib/agenda/lerEquipe.ts": { categoria: "equipe", motivo: "agenda da equipe para o gestor; toda leitura filtra o grupo da sessão" },
  "src/lib/financeiro/metasDaEquipeDados.ts": { categoria: "equipe", motivo: "placar das metas do mês (0246): metas, visitas, etapas e donos lidos só no grupo da sessão" },
  "src/lib/crm/regrasDoGrupo.ts": { categoria: "equipe", motivo: "regras de distribuição (0246) do grupo do gestor da sessão" },
  "src/lib/financeiro/primeirasRespostas.ts": { categoria: "equipe", motivo: "horários da primeira resposta da equipe, só do grupo do gestor" },
  "src/app/corretor/(painel)/admin/page.tsx": { categoria: "equipe", motivo: "Visão geral do gestor (L17)" },
  "src/app/corretor/(painel)/admin/whatsapp/page.tsx": { categoria: "equipe", motivo: "WhatsApp da equipe (L17)" },
  "src/app/corretor/(painel)/marketing/impulsionamentos/DistribuicaoDaEquipe.tsx": { categoria: "equipe", motivo: "distribuição de leads da equipe: status dos números e grupos de leads do grupo do gestor" },
  "src/app/corretor/(painel)/admin/_componentes/AcessosDoSuporte.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "acessos do suporte da Astro (0243): a chave lê acessos_de_suporte só do grupo do gestor da sessão" },
  "src/app/corretor/(painel)/admin/_componentes/ProntidaoDaEquipe.tsx": { categoria: "equipe", motivo: "Prontidão da equipe (L17)" },
  "src/app/corretor/(painel)/admin/_componentes/UsoDasNovidades.tsx": { categoria: "equipe", motivo: "uso das ferramentas novas pela equipe" },
  "src/app/corretor/(painel)/marketing/impulsionamentos/page.tsx": { categoria: "equipe", motivo: "anúncios pagos: campanhas e falas por lead do grupo" },

  // ── Crons que somam: laço de grupos ───────────────────────────────────────
  "src/app/api/cron/relatorio-semanal/route.ts": { categoria: "agrega-por-grupo", motivo: "cada gestor recebe os números do grupo dele (L18)" },
  "src/app/api/cron/quem-esta-esperando/route.ts": { categoria: "agrega-por-grupo", motivo: "cada corretor é avisado de quem espera por ele, grupo a grupo (L18)" },

  // ── Crons que juntam duas listas ──────────────────────────────────────────
  "src/lib/crm/avisoDeNovidade.ts": { categoria: "cruza-conjuntos", lados: ["empreendimentos", "leads"], motivo: "imóvel novo só avisa lead do mesmo grupo (L13)" },
  "src/lib/crm/enviarResumoDoDia.ts": { categoria: "cruza-conjuntos", lados: ["empreendimentos", "leads"], motivo: "imóvel novo do resumo só cruza com leads do grupo do corretor" },

  // ── Crons linha a linha ───────────────────────────────────────────────────
  "src/app/api/cron/event-outbox/route.ts": { categoria: "plataforma", motivo: "processa o outbox linha a linha; cada evento é do grupo da própria linha" },
  "src/app/api/cron/followups/route.ts": { categoria: "plataforma", motivo: "follow-ups e respostas atrasadas por conversa, cada uma com a instância do próprio corretor" },
  "src/lib/crm/leadsSemRetorno.ts": { categoria: "plataforma", motivo: "lista das 18h por grupo com o envio ligado; cada leitura filtra o grupo da vez e a lista vai só aos gestores desse grupo" },
  "src/lib/notificacoes/leadNovo.ts": { categoria: "plataforma", motivo: "aviso por lead, ao corretor dono dele" },
  "src/lib/notificacoes/leadsQueCombinam.ts": { categoria: "cruza-conjuntos", lados: ["empreendimentos", "leads"], motivo: "imóvel publicado/atualizado só cruza com leads do grupo dele, e cada corretor é avisado só dos próprios (0245)" },
  "src/lib/notificacoes/lembreteDeVisita.ts": { categoria: "plataforma", motivo: "lembrete por visita, a quem a faz; visita e lead do mesmo grupo (0224)" },
  "src/lib/agenda/confirmacaoAutomatica.ts": { categoria: "plataforma", motivo: "confirmação automática (0246): visita a visita, cada uma no próprio grupo (lido na volta do laço dos grupos que ligaram a opção)" },
  "src/lib/notificacoes/leadParado.ts": { categoria: "plataforma", motivo: "aviso por lead, ao corretor dono dele; dono e grupo conferidos no claim" },
  "src/lib/notificacoes/senhaVencendo.ts": { categoria: "plataforma", motivo: "aviso por ficha, ao próprio corretor da ficha" },
  "src/lib/notificacoes/clienteRespondeu.ts": { categoria: "plataforma", motivo: "aviso por lead, só se o dono é o do número que o webhook validou, no mesmo grupo" },
  "src/lib/whatsapp/roletaDosAnuncios.ts": { categoria: "plataforma", motivo: "repasse de UM lead, para quem o banco escolhe dentro do grupo da roleta" },
  "src/lib/crm/alertaSemContato.ts": { categoria: "plataforma", motivo: "alerta por lead, ao corretor dono dele" },
  "src/lib/crm/alertaSemResposta.ts": { categoria: "plataforma", motivo: "alerta por conversa, ao corretor dono dela" },
  "src/lib/crm/enviarRelatorioDasAvaliacoes.ts": { categoria: "plataforma", motivo: "por instância: cada corretor recebe só as avaliações dele" },
  "src/lib/crm/lembretesDeTarefa.ts": { categoria: "plataforma", motivo: "lembrete por tarefa, ao corretor dono dela" },
  "src/lib/crm/lembretesDeAnotacao.ts": { categoria: "plataforma", motivo: "lembrete por anotação, ao destinatário dela (saiu da rota dos follow-ups em 30/10/2026); o lead e o autor são os da própria anotação" },
  "src/lib/grupos/encerramento.ts": { categoria: "plataforma", motivo: "rotina dos 90 dias: um grupo cancelado por vez; cópia, apagar e logins só desse grupo (0202)" },
  "src/lib/imagens/limpeza.ts": { categoria: "plataforma", motivo: "apaga arte vencida linha a linha (arquivo e linha da própria arte)" },
  "src/lib/imoveis/reservasVencidas.ts": { categoria: "plataforma", motivo: "libera reserva vencida unidade a unidade" },
  "src/lib/inbound/gmailCaixa.ts": { categoria: "plataforma", motivo: "conta a conta; o lead nasce no grupo da conta (grupo_id dela)" },
  "src/lib/metaAds.ts": { categoria: "plataforma", motivo: "sincroniza a conta da Meta da Next Home, carimbada no grupo 1 (fase 7)" },
  "src/lib/whatsapp/avisoDeQueda.ts": { categoria: "plataforma", motivo: "varre instância a instância; a faixa lê só o corretor da sessão" },
  "src/lib/whatsapp/campaignDispatcher.ts": { categoria: "plataforma", motivo: "disparo item a item, pela instância do corretor dono da lista" },
  "src/lib/central/numeroDoCentral.ts": { categoria: "plataforma", motivo: "lê a tabela global do número central da plataforma (0249); nenhum dado de grupo" },
  "src/lib/central/identificar.ts": { categoria: "plataforma", motivo: "acha quem escreve ao central pelo telefone entre todos os grupos (é isso que decide o grupo); devolve só o grupo da pessoa achada, e o resto do central usa esse grupo" },
  "src/lib/central/avisos.ts": { categoria: "plataforma", motivo: "avisos espontâneos pelo central (4.7): lê o canal de UM corretor (o do aviso que o chamador já escolheu), a chave do grupo dele e grava só o histórico dele; a lista do resumo é a de pessoas ativas dos grupos com o recurso ligado, uma a uma, sem somar nada" },
  "src/lib/central/avisoDeQuedaPeloCentral.ts": { categoria: "plataforma", motivo: "aviso de queda de UM corretor (o da instância caída) pelo número central; lê o próprio corretor e a chave do grupo dele" },
  "src/lib/central/retencao.ts": { categoria: "plataforma", motivo: "retenção de 30 dias do registro do central em todos os grupos: apaga o texto dos comandos e as tentativas antigas, nada mais" },
  "src/lib/central/tratadores/resolverLead.ts": { categoria: "equipe", motivo: "central, onda 1: acha o lead pelo texto no grupo de quem foi identificado (corretor: só os dele); toda leitura filtra grupo_id" },
  "src/lib/central/tratadores/cliente.ts": { categoria: "equipe", motivo: "central, onda 3 (frente N: material, seleção, proposta, link pessoal, mensagem pronta): lead por resolverLead e só do corretor identificado; catálogo, mídias, ficha, dossiê, propostas, modelos e o próprio corretor lidos com o grupo dele; o envio passa por envioAoClientePeloCentral" },
  "src/lib/crm/envioAoClientePeloCentral.ts": { categoria: "equipe", motivo: "central, onda 3: o que vai ao cliente sai do número do corretor identificado, só para lead dele no grupo dele (leadDoDono, canalComOCliente); mensagens da conversa e o link desativado lidos e gravados com grupo_id" },
  "src/lib/central/tratadores/imoveis.ts": { categoria: "equipe", motivo: "central, onda 2 (frente F): catálogo, unidades, mídias, leads, dossiês e equipe lidos com o grupo de identificarRemetente (corretor: só os leads dele); a escrita no catálogo passa por imovelPeloCentral, que filtra grupo_id de novo" },
  "src/lib/imoveis/imovelPeloCentral.ts": { categoria: "equipe", motivo: "escritas do central no catálogo (preço, unidade, desfaz; só gestor): toda leitura e escrita filtra grupo_id de quem foi identificado" },
  "src/lib/central/tratadores/relatorios.ts": { categoria: "equipe", motivo: "central, onda 2 (relatórios): toda leitura direta filtra grupo_id; vendas, leads, metas e caixa passam pelos miolos com recorte (lerVendas, lerLeadsLeves, lerMeta, lerTaxasDaEquipe, lerLancamentosPagos), que filtram o grupo e, para o corretor, ele mesmo; contas ocultas fora; nenhuma conversa lida" },
  "src/lib/central/tratadores/financeiro.ts": { categoria: "equipe", motivo: "central, onda 2 (venda, caixa, gasto de anúncio, redistribuição): grupo, corretor e papel de identificarRemetente; não lê nada direto, tudo passa por resolverLead e pelos domínios *PeloCentral, que filtram grupo_id" },
  "src/lib/financeiro/vendaPeloCentral.ts": { categoria: "equipe", motivo: "venda registrada pelo central: toda leitura e escrita filtra grupo_id (lead, corretor, imóvel, vendas, divisão, parcelas) e, para corretor, o dono do lead" },
  "src/lib/financeiro/caixaPeloCentral.ts": { categoria: "equipe", motivo: "lançamento no caixa pedido pelo gestor ao central: grava e apaga com o grupo dele; o mês fechado é lido no grupo" },
  "src/lib/crm/gastoDeAnuncioPeloCentral.ts": { categoria: "equipe", motivo: "gasto de anúncio pelo central: campanhas e pontos do gasto lidos e gravados com grupo_id (corretor: só as dele)" },
  "src/lib/crm/redistribuicaoPeloCentral.ts": { categoria: "equipe", motivo: "redistribuição pedida pelo gestor ao central: equipe, leads e corretores lidos no grupo dele; o update troca o dono só de lead do grupo que ainda está com a origem" },
  "src/lib/central/tratadores/documentos.ts": { categoria: "equipe", motivo: "central, onda 2 (documentos, lembrete, planilha): o lead vem de resolverLead; a documentação é lida pelo id já resolvido; as escritas passam por documentoPeloCentral, anotacaoPessoal e importacaoPeloCentral, que filtram grupo_id e o dono" },
  "src/lib/crm/documentoPeloCentral.ts": { categoria: "equipe", motivo: "central, onda 2: anexo de documento e link ao cliente só no lead do corretor identificado, no grupo dele; toda leitura filtra grupo_id" },
  "src/lib/crm/importacaoPeloCentral.ts": { categoria: "equipe", motivo: "central, onda 2: a planilha cadastra na carteira do corretor identificado; a duplicidade é conferida no grupo dele e o desfaz arquiva só os dele" },
  "src/lib/crm/linkDeDocumentos.ts": { categoria: "helper", motivo: "monta o link de documentos de um lead que quem chama já conferiu (sessão do painel em linkDosDocumentos; dono e grupo da identificação em documentoPeloCentral)" },
  "src/lib/central/tratadores/controle.ts": { categoria: "equipe", motivo: "central, onda 1: IA do cliente e desfazer; a conversa é sempre a do número de quem pede (grupo e corretor da identificação) e o registro do desfaz é o dele; toda leitura filtra grupo_id" },
  "src/lib/central/tratadores/consultas.ts": { categoria: "equipe", motivo: "central, onda 1 (consultar_lead, quem_ligar_hoje): toda leitura filtra grupo_id; o lead vem de resolverLead e a conversa só do dono (0134); a documentação (lerDocumentacaoDoLead) é lida pelo id já resolvido e a fila (montarFilaDeTrabalho) recorta pelo corretor identificado, com o grupo nas sugestões" },
  "src/lib/central/tratadores/leads.ts": { categoria: "equipe", motivo: "central, onda 1: cadastrar e atualizar lead com o corretor, o grupo e o papel de identificarRemetente; não lê nada direto, tudo passa por resolverLead e leadPeloCentral, que filtram grupo_id" },
  "src/lib/crm/leadPeloCentral.ts": { categoria: "equipe", motivo: "escritas do central na ficha (cadastro, atualização, desfaz): toda leitura e escrita filtra grupo_id e, para corretor, o dono do lead" },
  "src/lib/agenda/agendaPorMensagem.ts": { categoria: "equipe", motivo: "central, onda 1: visita pedida por mensagem; o lead é lido no grupo de quem foi identificado (corretor: só os dele) antes de marcar, desmarcar ou desfazer; toda leitura filtra grupo_id" },
  "src/lib/anotacoes/anotacaoPessoal.ts": { categoria: "equipe", motivo: "central, onda 1: anotação pessoal do corretor identificado, gravada e apagada só com o grupo e o autor dele" },
  "src/lib/central/webhook.ts": { categoria: "plataforma", motivo: "o central atende todos os grupos; toda leitura e escrita usa o corretor e o grupo de identificarRemetente, nunca o que a IA escreve (spec 4.2). No grupo de WhatsApp (4.1, onda 2) lê os corretores ativos pelos números/lids dos participantes, de qualquer imobiliária, só para conferir que todos são de UMA (grupo.ts) e responder pelo grupo dela" },
  "src/lib/whatsapp/recusaPendente.ts": { categoria: "plataforma", motivo: "repete o logout do número recusado instância a instância; não lê conversa nem junta grupos" },
  "src/lib/whatsapp/listasVivas.ts": { categoria: "plataforma", motivo: "por lista: só leads do corretor dono dela" },
  "src/lib/whatsapp/quedaDoNumero.ts": { categoria: "plataforma", motivo: "protege instância a instância" },
  "src/lib/whatsapp/sonda.ts": { categoria: "plataforma", motivo: "diagnóstico do provedor por instância, em tabela global" },
  "src/lib/auth/pedidoDeLinkDeSenha.ts": { categoria: "plataforma", motivo: "a própria pessoa pede o link: acha UMA ficha (pelo e-mail ou pelo login da sessão) e registra o pedido e lê o nome no grupo dela" },
  "src/lib/auth/emailDoLogin.ts": { categoria: "plataforma", motivo: "o Auth é global: traduz UM nome de usuário no e-mail de login (email_do_usuario, 0235), sem ler tabela de grupo" },
  "src/lib/auth/validadeDaSenhaNoServidor.ts": { categoria: "plataforma", motivo: "o Auth é global: grava a data da troca de senha no app_metadata de UM usuário (o da sessão), sem ler tabela de grupo" },
  "src/lib/auth/links.ts": { categoria: "plataforma", motivo: "o Auth é global (um e-mail, um login na plataforma): gera o link de UM usuário pelo e-mail, sem ler tabela de grupo" },
  "src/lib/whatsapp/vencedoraAB.ts": { categoria: "plataforma", motivo: "decide o A/B lista a lista, nos itens da própria lista" },
  "src/lib/sites/resolver.ts": { categoria: "plataforma", motivo: "resolve UM host no grupo dele por site_do_endereco, que devolve uma linha só, do host pedido; a chave é para o domínio da plataforma não vir de quem chama" },

  // ── Área da plataforma: lê vários grupos, só depois da guarda dela ────────
  "src/lib/plataforma/grupos.ts": { categoria: "plataforma-admin", motivo: "lista de grupos com contagens; recebe a prova de exigirAdminDaPlataforma*" },
  "src/lib/plataforma/saude.ts": { categoria: "plataforma-admin", motivo: "saúde e custo da IA dos grupos da lista (telemetria só AGREGADA por rpc, 0211, nunca ia_interacoes linha a linha); recebe a prova de exigirAdminDaPlataforma*" },
  "src/app/plataforma/cobrancaAcoes.ts": { categoria: "plataforma-admin", motivo: "registra e remove pagamento, ajusta mensalidade e vencimento e suspende ou reativa o grupo; a chave só depois de exigirAdminDaPlataformaNaAcao (fase 2C)" },
  "src/app/plataforma/cobrancaAutomaticaAcoes.ts": { categoria: "plataforma-admin", motivo: "liga e desliga a cobrança automática (Asaas) de UM grupo (0241); a chave só depois de exigirAdminDaPlataformaNaAcao (29/10/2026)" },
  "src/app/plataforma/enderecosAcoes.ts": { categoria: "plataforma-admin", motivo: "liga e tira o endereço do site de UM grupo (0201); a chave só depois de exigirAdminDaPlataformaNaAcao" },
  "src/app/plataforma/acoes.ts": { categoria: "plataforma-admin", motivo: "cria o grupo com o primeiro acesso, edita o cadastro dele, muda o plano e redefine a senha de um acesso; a chave só depois de exigirAdminDaPlataformaNaAcao" },
  "src/app/plataforma/equipeAcoes.ts": { categoria: "plataforma-admin", motivo: "desativa, reativa e troca o papel de um acesso de UM grupo (sempre .eq(grupo_id) da página); leads só contados; a chave só depois de exigirAdminDaPlataformaNaAcao (29/10/2026)" },
  "src/app/plataforma/centralAcoes.ts": { categoria: "plataforma-admin", motivo: "registra o número central (tabela global, 0249) e pede o pareamento; a chave só depois de exigirAdminDaPlataformaNaAcao (30/10/2026)" },
  "src/app/plataforma/central/page.tsx": { categoria: "plataforma-admin", motivo: "estado do número central (tabela global) e contagens agregadas (grupos ligados, pedidos e tentativas em 7 dias); a chave só depois de exigirAdminDaPlataformaNaPagina" },
  "src/app/plataforma/administradoresAcoes.ts": { categoria: "plataforma-admin", motivo: "põe e tira logins de administradores_da_plataforma (tabela global, sem grupo); a chave só depois de exigirAdminDaPlataformaNaAcao (29/10/2026)" },
  "src/lib/plataforma/administradores.ts": { categoria: "plataforma-admin", motivo: "lista administradores_da_plataforma (tabela global) com o e-mail do Auth; recebe a prova de exigirAdminDaPlataforma*" },
  "src/lib/plataforma/pedidos.ts": { categoria: "plataforma-admin", motivo: "lista, conta e lê UM pedido de pedidos_de_contratacao (tabela global, 0238) e nomes de grupos para o vínculo; recebe a prova de exigirAdminDaPlataforma* (29/10/2026)" },
  "src/app/plataforma/pedidosAcoes.ts": { categoria: "plataforma-admin", motivo: "muda status, observação e conta criada de UM pedido (tabela global, 0238); a chave só depois de exigirAdminDaPlataformaNaAcao (29/10/2026)" },
  "src/lib/plataforma/chamados.ts": { categoria: "plataforma-admin", motivo: "lista e conta chamados_de_suporte (tabela global, 0240) e lê o nome das contas de origem para o link; recebe a prova de exigirAdminDaPlataforma* (29/10/2026)" },
  "src/lib/plataforma/avisosAosClientes.ts": { categoria: "plataforma-admin", motivo: "lista avisos_aos_clientes (tabela global, 0242) para /plataforma/avisos; recebe a prova de exigirAdminDaPlataforma* (29/10/2026)" },
  "src/app/plataforma/avisosAosClientesAcoes.ts": { categoria: "plataforma-admin", motivo: "publica e encerra UM aviso da Astro aos clientes (tabela global, 0242, sem dado de grupo); a chave só depois de exigirAdminDaPlataformaNaAcao (29/10/2026)" },
  "src/app/plataforma/suporteAcoes.ts": { categoria: "plataforma-admin", motivo: "muda status e anotação interna de UM chamado (tabela global, 0240); a chave só depois de exigirAdminDaPlataformaNaAcao (29/10/2026)" },

  // ── Porta pública da página de vendas, sem grupo ─────────────────────────
  "src/app/auth/google/route.ts": { categoria: "plataforma", motivo: "volta do Entrar com Google: o Auth é global; só APAGA o usuário que o próprio Google acabou de criar sem ficha (sem ler tabela de grupo pela chave)" },
  "src/app/api/plataforma/notificacoes/route.ts": { categoria: "plataforma-admin", motivo: "liga/desliga o aviso no aparelho do PRÓPRIO administrador da plataforma (0239); guarda antes da chave, tabela global" },
  "src/lib/plataforma/atividade.ts": { categoria: "plataforma-admin", motivo: "contas sem uso há 7 dias: leads só CONTADOS (head: true) por conta e o último login do Auth casado pela ficha; recebe a prova de exigirAdminDaPlataforma* (29/10/2026)" },
  "src/lib/plataforma/visaoDeSuporte.ts": { categoria: "plataforma-admin", motivo: "visão de suporte de UMA conta (0243): confere o acesso registrado do próprio administrador, conta leads e visitas (head: true) e lê a equipe e o status do WhatsApp; recebe a prova de exigirAdminDaPlataforma* (29/10/2026)" },
  "src/app/plataforma/visaoDeSuporteAcoes.ts": { categoria: "plataforma-admin", motivo: "registra o acesso à visão de suporte em acessos_de_suporte (tabela global, 0243) e em admin_eventos do grupo; a chave só depois de exigirAdminDaPlataformaNaAcao (29/10/2026)" },
  "src/app/plataforma/avisosAcoes.ts": { categoria: "plataforma-admin", motivo: "teste dos avisos da plataforma: guarda antes da chave; manda aos aparelhos dos administradores (0239)" },
  "src/lib/plataforma/sinaisDeRisco.ts": { categoria: "agrega-por-grupo", motivo: "risco de cancelamento (29/10/2026): laço de grupos; por conta, só CONTAGENS (leads com head: true, chamados abertos) e datas (logins do Auth, quedas do WhatsApp, cobrança), cada leitura filtrada pelo grupo da volta" },
  "src/lib/plataforma/indicacoes.ts": { categoria: "plataforma-admin", motivo: "indicações e créditos (tabelas globais, 0247) de todas as contas e o negócio de UMA conta (código, quem indicou, créditos, aceite do termo de adesão); recebe a prova de exigirAdminDaPlataforma* (29/10/2026)" },
  "src/app/plataforma/indicacoesAcoes.ts": { categoria: "plataforma-admin", motivo: "marca UM crédito de indicação como aplicado (tabela global, 0247) e grava o evento no grupo beneficiado; a chave só depois de exigirAdminDaPlataformaNaAcao (29/10/2026)" },
  "src/lib/notificacoes/avisosDaPlataforma.ts": { categoria: "agrega-por-grupo", motivo: "resumo diário das mensalidades para os administradores (cron): lê a lista de grupos e a cobrança de cada um pela conta do painel; conta nova e suspensão avisam com o nome de UM grupo" },
  "src/lib/plataforma/avisosVigentes.ts": { categoria: "plataforma", motivo: "faixa do painel (0242, 29/10/2026): lê os avisos da Astro no ar em avisos_aos_clientes, tabela GLOBAL sem dado de grupo nenhum; o público (papel) é filtrado por quem desenha a faixa, com a sessão" },
  "src/app/astro/contato/acoes.ts": { categoria: "plataforma", motivo: "Fale com a Astro /astro/contato (29/10/2026): só INSERE o contato em chamados_de_suporte (tabela global, 0240; quem escreve ainda não tem grupo) e conta contatos do mesmo WhatsApp para o limite; o aviso aos administradores sai por avisarAtendimento, sem ler tabela de grupo nenhum" },
  "src/lib/plataforma/testeGratis.ts": { categoria: "plataforma", motivo: "teste grátis do /astro/contratar (0241, 29/10/2026): conta pedidos/grupos/fichas do mesmo e-mail, WhatsApp ou documento (só contagens), insere UM pedido e cria a conta pelo núcleo criarConta, que relê esse pedido como prova; marca o pedido e grava o evento do grupo recém-criado" },
  "src/app/astro/contratar/acoes.ts": { categoria: "plataforma", motivo: "assistente /astro/contratar (29/10/2026): só INSERE o pedido em pedidos_de_contratacao (tabela global, 0238; nasce antes do grupo) e conta pedidos do mesmo WhatsApp para o limite; depois avisa no celular os administradores da plataforma (fichas lidas por user_id deles), sem ler tabela de grupo nenhum" },
};

/** A definição da chave: não é uso. */
const DEFINICAO = "src/lib/supabase/service.ts";

const RAIZ = process.cwd();

function arquivosDe(pasta: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, pasta), { withFileTypes: true })) {
    const caminho = `${pasta}/${entrada.name}`;
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules") continue;
      saida.push(...arquivosDe(caminho));
    } else if (/\.(ts|tsx|mjs)$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      saida.push(caminho);
    }
  }
  return saida;
}

const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8");

/** Quem usa a chave de serviço (ou a leitura da equipe). */
const usuarios = [...arquivosDe("src"), ...arquivosDe("scripts")]
  .filter((f) => f !== DEFINICAO)
  .filter((f) => /\b(createServiceClient|clienteParaNumerosDaEquipe)\b/.test(ler(f)))
  .sort();

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Troca cada `import ...;` por espaços: some do texto e as posições ficam. */
const semImports = (codigo: string) => codigo.replace(/^\s*import\b[^;]*;/gm, (m) => " ".repeat(m.length));

/**
 * A validação aparece antes da posição `ate`: chamada `nome(` quando
 * `validadoPor` é um nome; o próprio trecho quando é código (precisa ter
 * parêntese ou comparação, senão seria um caminho de parâmetro como
 * `lead.parceiro_id`). Com `primeiraLeitura`, o trecho também vale se for a
 * primeira leitura a partir de `ate` (a credencial que só a chave lê). A
 * janela é `[de, ate)`. Chamar uma função do próprio arquivo que (direta ou
 * indiretamente) chama `validadoPor` também vale: `itemDoLink(token)` que lê
 * o link por `lerLinkPublico`. Devolve o problema, ou `null`.
 */
function validacaoAntes(
  codigo: string,
  validadoPor: string,
  de: number,
  ate: number,
  primeiraLeitura: boolean,
): string | null {
  const limpo = semImports(codigo);
  const antes = limpo.slice(de, ate);
  if (/^[A-Za-z_$][\w$]*$/.test(validadoPor)) {
    const nomes = funcoesQueValidam(limpo, validadoPor);
    // A declaração da função não valida nada: só a chamada conta.
    const chamada = new RegExp(`(?<![\\w$.]|function\\s+)(${[...nomes].map(escapar).join("|")})\\s*\\(`);
    return chamada.test(antes) ? null : `${validadoPor}( não é chamada antes`;
  }
  if (!/\(|[!=]==/.test(validadoPor)) return `validadoPor "${validadoPor}" não é função nem trecho que valida`;
  if (antes.includes(validadoPor)) return null;
  if (primeiraLeitura && leiturasDe(codigo.slice(ate))[0]?.cadeia.includes(validadoPor)) return null;
  return `"${validadoPor}" não aparece antes`;
}

/** `validadoPor` e as funções do próprio arquivo que chegam a chamá-lo. */
function funcoesQueValidam(codigo: string, validadoPor: string): Set<string> {
  const nomes = new Set([validadoPor]);
  const decls = declaracoes(codigo);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const d of decls) {
      if (nomes.has(d.nome)) continue;
      const corpo = codigo.slice(d.inicio, d.fim);
      if ([...nomes].some((n) => new RegExp(`(?<![\\w$.]|function\\s+)${escapar(n)}\\s*\\(`).test(corpo))) {
        nomes.add(d.nome);
        mudou = true;
      }
    }
  }
  return nomes;
}

/**
 * Quem importa um `helper` e não usa a chave: a tela ou a action que valida o
 * id e o passa adiante (`validadoPor`, com a mesma regra de `por-id`, antes
 * do primeiro uso do que importou), ou outro arquivo que só repassa o id
 * recebido (`repassa`), cujos importadores passam pela mesma cobrança. Quem
 * roda offline e NUNCA passa o campo que leva o id ao banco declara
 * `naoPassa` com o nome do campo, e a guarda confere que ele não aparece.
 */
type Importador =
  | { validadoPor: string; motivo: string }
  | { repassa: true; motivo: string }
  | { naoPassa: string; motivo: string };

const IMPORTADORES: Record<string, Importador> = {
  "src/app/api/cron/limpar-artes-ia/route.ts": { validadoPor: "requisicaoAutenticada", motivo: "cron com segredo; apaga mensagens barradas antigas linha a linha e roda a rotina dos grupos cancelados (0202)" },
  "src/app/api/webhooks/email-lead/route.ts": { validadoPor: "token !== segredo", motivo: "segredo do webhook dos portais; o grupo é o fixo da Next Home" },
  "src/app/corretor/(painel)/campanhas/acoes.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; agenda e conversas dele" },
  "src/app/corretor/(painel)/admin/parceiros/page.tsx": { validadoPor: "exigirGestorNaPagina", motivo: "gestor da sessão; o endereço do link é o do grupo dele" },
  "src/app/corretor/(painel)/imoveis/[slug]/carrossel/page.tsx": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; o link do carrossel é o do grupo dele" },
  "src/app/corretor/(painel)/imoveis/[slug]/carrossel/slide/[indice]/route.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; o link do slide é o do grupo dele" },
  "src/app/corretor/(painel)/leads/[id]/linksAcoes.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; o link do cliente é o do grupo dele" },
  "src/app/corretor/(painel)/links/page.tsx": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; os links pessoais são os do grupo dele" },
  "src/app/corretor/(painel)/page.tsx": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; o link pessoal é o do grupo dele" },
  "src/app/api/painel/manifest/route.ts": { validadoPor: "marcaDoPainel", motivo: "o grupo é o do corretor da sessão (marcaDoPainel lê getCorretorLogado); lê a cor do site dele" },
  "src/app/corretor/(painel)/_componentes/FaixaLimitesDoPlano.tsx": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; os limites do plano são os do grupo dele (limites do plano)" },
  "src/app/corretor/(painel)/admin/_componentes/UsoDoPlano.tsx": { validadoPor: "getCorretorLogado", motivo: "gestor da sessão; o uso do plano é o do grupo dele (limites do plano)" },
  "src/app/corretor/(painel)/campanhas/page.tsx": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; as mensagens de lista que restam são as do grupo dele (limites do plano)" },
  "src/app/plataforma/grupos/[id]/suporte/page.tsx": { validadoPor: "exigirAdminDaPlataformaNaPagina", motivo: "operador da plataforma; lê os limites do plano de UM grupo, o do id da rota (visão de suporte, 0243)" },
  "src/app/plataforma/grupos/[id]/page.tsx": { validadoPor: "exigirAdminDaPlataformaNaPagina", motivo: "operador da plataforma; lê a logo de UM grupo, o do id da rota" },
  "src/lib/imovelPublico/ficha.ts": { validadoPor: "lerGrupoPorSlug", motivo: "o grupo sai do slug da URL pública; catálogo, marca e corretor são lidos com o id dele" },
  "src/lib/marcaDoCrm/doPainel.ts": { validadoPor: "getCorretorLogado", motivo: "a marca é a do grupo do corretor da sessão" },
  "src/app/corretor/(painel)/_componentes/FaixaCobranca.tsx": { validadoPor: "getCorretorLogado", motivo: "faixa da mensalidade do grupo do corretor da sessão" },
  "src/app/corretor/(painel)/_componentes/FaixaCotaDaIa.tsx": { validadoPor: "getCorretorLogado", motivo: "faixa da cota da IA do grupo do corretor da sessão" },
  "src/app/corretor/(painel)/_componentes/acoesResumoDaConversa.ts": { validadoPor: "getCorretorLogado", motivo: "resumo da conversa (0248, 30/10/2026): uso do dia, cota e cobrança do grupo do corretor da sessão; o lead e a conversa são lidos pela sessão (RLS)" },
  "src/app/corretor/(painel)/conversas/page.tsx": { validadoPor: "getCorretorLogado", motivo: "cota da IA do grupo do corretor da sessão (cabeçalho da conversa)" },
  "src/app/corretor/(painel)/pessoas/page.tsx": { validadoPor: "getCorretorLogado", motivo: "cota da IA do grupo do corretor da sessão (cabeçalho da conversa)" },
  "src/app/corretor/(painel)/consultor/acoes.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; conversa conferida por conversaDoCorretor" },
  "src/app/corretor/(painel)/conversas/acoesIA.ts": { validadoPor: "exigirSessao", motivo: "conversa lida pela sessão antes de a IA agir" },
  "src/app/corretor/(painel)/estudio/acoes.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; conversa conferida por conversaDoCorretor" },
  "src/app/corretor/(painel)/financeiro/assistente/acoes.ts": { validadoPor: "exigirGestorNaAcao", motivo: "gestor da sessão; grava a telemetria do assistente" },
  "src/app/corretor/(painel)/imoveis/criar-imagem/page.tsx": { validadoPor: "getCorretorLogado", motivo: "galeria do corretor da sessão" },
  "scripts/eval/rodarConversa.ts": { naoPassa: "fewShot", motivo: "eval offline: chama o turno sem fewShot, então nada vai ao banco" },
  "scripts/eval/rodarEval.ts": { naoPassa: "fewShot", motivo: "eval offline: chama o turno sem fewShot, então nada vai ao banco" },
  "src/lib/crm/retornoPeloGrupo/aplicarAoLead.ts": { repassa: true, motivo: "aplica no lead que o processamento do grupo já conferiu (grupo e corretor dono)" },
  "src/lib/agenda/comandos/canal.ts": { repassa: true, motivo: "recebe a instância que o webhook resolveu e autenticou (resolverInstancia)" },
  "src/lib/crm/retornoPeloGrupo/aplicar.ts": { repassa: true, motivo: "recebe o grupo e o corretor conferidos por tratarMensagemDoGrupoDeLeads" },
  "src/lib/whatsapp/midiasDaLista.ts": { repassa: true, motivo: "manda as mídias da lista na conversa que o disparador recebeu" },
  "src/lib/crm/gravarLinkDoCliente.ts": { repassa: true, motivo: "grava o link do cliente no lead que quem chama já conferiu (sessão em linksAcoes; dono e grupo da identificação no central, onda 3) e lê o endereço do grupo dele" },
  "src/lib/whatsapp/turnoDeAtendimento.ts": { repassa: true, motivo: "o turno recebe a identidade (corretor, conversa) de quem atende" },
  "src/app/corretor/(painel)/marketing/page.tsx": { validadoPor: "getCorretorLogado", motivo: "galeria e vídeos do corretor da sessão" },
  "src/app/corretor/(painel)/marketing/video/acoes.ts": { validadoPor: "getCorretorLogado", motivo: "vídeo do corretor da sessão" },
  "src/app/corretor/(painel)/marketing/video/page.tsx": { validadoPor: "getCorretorLogado", motivo: "vídeos do corretor da sessão" },
};

/** Os arquivos que recebem o id por parâmetro: `helper` no MAPA ou `repassa`. */
const repassadores = new Set([
  ...Object.entries(MAPA).filter(([, e]) => e.categoria === "helper").map(([f]) => f),
  ...Object.entries(IMPORTADORES).filter(([, e]) => "repassa" in e).map(([f]) => f),
]);

const todosOsArquivos = new Set([...arquivosDe("src"), ...arquivosDe("scripts")]);

/** `@/x` e `./x` → caminho do arquivo no repositório (ou `null`, se for pacote). */
function resolverImport(de: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(de), spec));
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (todosOsArquivos.has(base + ext)) return base + ext;
  }
  return null;
}

/** Os nomes que um arquivo importa de cada outro arquivo do repositório, e onde cada um é usado. */
type Importacao = { alvo: string; usos: Map<string, number[]>; dinamico: number[] };

const importacoesCache = new Map<string, Importacao[]>();

function importacoesDe(arquivo: string): Importacao[] {
  const pronto = importacoesCache.get(arquivo);
  if (pronto) return pronto;
  const codigo = semComentarios(ler(arquivo));
  const corpo = semImports(codigo);
  const porAlvo = new Map<string, Importacao>();
  const doAlvo = (alvo: string) => {
    let i = porAlvo.get(alvo);
    if (!i) porAlvo.set(alvo, (i = { alvo, usos: new Map(), dinamico: [] }));
    return i;
  };
  for (const m of codigo.matchAll(/^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)) {
    // Import de tipo não chama nada.
    if (m[1]) continue;
    const alvo = resolverImport(arquivo, m[3]);
    if (!alvo) continue;
    const nomes: string[] = [];
    const chaves = /\{([\s\S]*)\}/.exec(m[2]);
    for (const parte of chaves?.[1].split(",") ?? []) {
      const p = parte.trim();
      if (!p || p.startsWith("type ")) continue;
      nomes.push(p.split(/\s+as\s+/)[0].trim() + "=" + p.split(/\s+as\s+/).pop()!.trim());
    }
    for (const n of m[2].replace(/\{[\s\S]*\}/, "").split(",").map((x) => x.trim()).filter(Boolean)) {
      // `* as ns` e o default: qualquer export pode estar por trás.
      nomes.push("*=" + n.replace(/^\*\s+as\s+/, ""));
    }
    for (const par of nomes) {
      const [exportado, local] = par.split("=");
      const usos = [...corpo.matchAll(new RegExp(`(?<![\\w$.])${escapar(local)}(?![\\w$])`, "g"))].map((u) => u.index!);
      doAlvo(alvo).usos.set(exportado, [...(doAlvo(alvo).usos.get(exportado) ?? []), ...usos]);
    }
  }
  for (const m of codigo.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    const alvo = resolverImport(arquivo, m[1]);
    if (alvo) doAlvo(alvo).dinamico.push(m.index!);
  }
  const lista = [...porAlvo.values()];
  importacoesCache.set(arquivo, lista);
  return lista;
}

/**
 * Os exports de um helper que de fato chegam à chave: a função usa
 * `createServiceClient(`, ou chama (no mesmo arquivo) outra que usa, ou chama
 * algo importado de outro repassador. Função pura do mesmo arquivo
 * (`candidatosTelefone`, `validarDataVisita`) não exige validação de quem a
 * importa. Arquivo que só repassa (`IMPORTADORES` com `repassa`) não usa a
 * chave: nele contam as funções que chamam o que veio de outro repassador.
 */
const exportsComChaveCache = new Map<string, Set<string>>();

function exportsComChave(helper: string): Set<string> {
  const pronto = exportsComChaveCache.get(helper);
  if (pronto) return pronto;
  const codigo = semImports(semComentarios(ler(helper)));
  const corpos = new Map(
    declaracoes(codigo).map((d) => [d.nome, { exportado: d.exportado, corpo: codigo.slice(d.inicio, d.fim) }] as const),
  );
  const deOutrosRepassadores = importacoesDe(helper)
    .filter((i) => repassadores.has(i.alvo))
    .flatMap((i) => [...i.usos.keys()]);
  const chama = (corpo: string, nome: string) => new RegExp(`(?<![\\w$.])${escapar(nome)}\\s*\\(`).test(corpo);
  // Helper que só RECEBE o cliente da chave (`supabase: Supa`) não chama
  // `createServiceClient(`: nele, toda função que consulta conta.
  const recebeOCliente = Boolean(MAPA[helper]) && !codigo.includes("createServiceClient(");
  const usaAChave = (corpo: string) =>
    (Boolean(MAPA[helper]) && corpo.includes("createServiceClient(")) || (recebeOCliente && /\.from\(|\.rpc\(|\.storage\b/.test(corpo));
  const comChave = new Set(
    [...corpos].filter(([, f]) => usaAChave(f.corpo) || deOutrosRepassadores.some((n) => chama(f.corpo, n))).map(([n]) => n),
  );
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const [nome, f] of corpos) {
      if (comChave.has(nome)) continue;
      if ([...comChave].some((n) => chama(f.corpo, n))) {
        comChave.add(nome);
        mudou = true;
      }
    }
  }
  const saida = new Set([...comChave].filter((n) => corpos.get(n)!.exportado));
  exportsComChaveCache.set(helper, saida);
  return saida;
}

/**
 * Quem importa de `alvo` algo que chega à chave, e as posições de cada uso
 * disso. `ignorar` tira um nome da conta: a própria validação, quando ela
 * mora no helper (o webhook valida com `resolverInstancia`, do repositório).
 */
function importadoresDe(alvo: string, ignorar?: string): { arquivo: string; usos: number[] }[] {
  const relevantes = exportsComChave(alvo);
  const saida: { arquivo: string; usos: number[] }[] = [];
  for (const arquivo of todosOsArquivos) {
    if (arquivo === alvo) continue;
    const imp = importacoesDe(arquivo).find((i) => i.alvo === alvo);
    if (!imp) continue;
    const usos = [...imp.dinamico];
    let importa = imp.dinamico.length > 0;
    for (const [nome, posicoes] of imp.usos) {
      if (nome === ignorar) continue;
      if (nome !== "*" && !relevantes.has(nome)) continue;
      importa = true;
      usos.push(...posicoes);
    }
    if (importa) saida.push({ arquivo, usos });
  }
  return saida;
}

/** As declarações de topo do arquivo (função ou `const`), com onde cada uma começa e termina. */
type Declaracao = { nome: string; exportado: boolean; inicio: number; fim: number };

function declaracoes(codigo: string): Declaracao[] {
  const inicios = [
    ...codigo.matchAll(/^(export\s+(?:default\s+)?)?(?:async\s+)?(?:function\s*\*?\s*(\w+)|const\s+(\w+)\s*=)/gm),
  ];
  return inicios.map((m, i) => ({
    nome: m[2] ?? m[3],
    exportado: Boolean(m[1]),
    inicio: m.index!,
    fim: i + 1 < inicios.length ? inicios[i + 1].index! : codigo.length,
  }));
}

/**
 * O uso em `pos` é precedido pela validação no MESMO ponto de entrada: dentro
 * da função exportada que o contém (cada action, cada página é uma porta), ou
 * no topo do módulo. Se o uso mora numa função local que não valida antes
 * dele, a cobrança sobe para cada lugar que chama essa função. Devolve o problema, ou `null`.
 */
function usoValidado(codigo: string, pos: number, validadoPor: string, visitadas = new Set<string>()): string | null {
  const decl = declaracoes(codigo).find((d) => pos >= d.inicio && pos < d.fim);
  const inicio = decl?.inicio ?? 0;
  const problema = validacaoAntes(codigo, validadoPor, inicio, pos, false);
  if (!decl || decl.exportado || !problema) return problema && `${problema} em ${decl?.nome ?? "(topo do módulo)"}`;
  if (visitadas.has(decl.nome)) return null;
  visitadas.add(decl.nome);
  for (const chamada of codigo.matchAll(new RegExp(`(?<![\\w$.])${escapar(decl.nome)}(?![\\w$])`, "g"))) {
    if (chamada.index! >= decl.inicio && chamada.index! < decl.fim) continue;
    const problema = usoValidado(codigo, chamada.index!, validadoPor, visitadas);
    if (problema) return problema;
  }
  return null;
}

/** A leitura está dentro de `.ler((c) => c.from(...))`: o grupo vem por construção. */
function dentroDaLeituraRecortada(codigo: string, leitura: Leitura): boolean {
  const antes = codigo.slice(Math.max(0, leitura.inicio - 60), leitura.inicio);
  return /\.(ler|lerView)\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\s*$/.test(antes);
}

/**
 * A leitura FILTRA o grupo: `.eq("grupo_id", x)` ou `.in("grupo_id", xs)` no
 * encadeamento. Citar `grupo_id` só na lista do `.select(...)` não conta: a
 * consulta traz a coluna e continua lendo todos os grupos.
 */
const FILTRA_GRUPO = /\.(eq|in)\(\s*["']grupo_id["']/;

/**
 * Tabelas GLOBAIS (sem `grupo_id`, `tabelasDoGrupo.ts`) que guardam o grupo
 * da linha noutra coluna: filtrar por ela é filtrar o grupo (29/10/2026, o
 * risco de cancelamento conta os chamados abertos de cada conta).
 */
const COLUNA_DO_GRUPO_NAS_GLOBAIS: Record<string, RegExp> = {
  chamados_de_suporte: /\.(eq|in)\(\s*["']grupo_origem_id["']/,
  acessos_de_suporte: /\.(eq|in)\(\s*["']grupo_alvo_id["']/,
};

/** As leituras do arquivo que não filtram o grupo (nem passam pela leitura recortada). */
function leiturasSemGrupo(codigo: string, ignorar: string[] = []): string[] {
  return leiturasDe(codigo)
    .filter((l) => !ignorar.includes(l.tabela))
    .filter((l) => !(COLUNA_DO_GRUPO_NAS_GLOBAIS[l.tabela]?.test(l.cadeia) ?? false))
    // A linha da própria imobiliária em `grupos` é recortada pelo id dela.
    .filter((l) => !(l.tabela === "grupos" && /\.eq\(\s*["']id["']/.test(l.cadeia)))
    .filter((l) => !FILTRA_GRUPO.test(l.cadeia) && !dentroDaLeituraRecortada(codigo, l))
    .map((l) => l.cadeia.replace(/\s+/g, " ").slice(0, 120));
}

/** As duas guardas da área da plataforma (`src/lib/guardas.ts`). */
const GUARDAS_DA_PLATAFORMA = ["exigirAdminDaPlataformaNaPagina", "exigirAdminDaPlataformaNaAcao"];
const CHAMA_GUARDA_DA_PLATAFORMA = /(?<![\w$.])exigirAdminDaPlataforma(NaPagina|NaAcao)\s*\(/;
/** O parâmetro que carrega o resultado da guarda: o chamador não tem como esquecê-la. */
const PROVA_DE_ADMIN = /\(\s*_?prova\s*:\s*\{\s*userId\s*:\s*string\s*;?\s*\}/;
/** O que o administrador da plataforma nunca lê: conversa, mensagem, dossiê, nota. */
const FORA_DA_PLATAFORMA = [
  "whatsapp_mensagens",
  "whatsapp_conversas",
  "lead_observacoes_ia",
  "lead_interacoes",
  "anotacoes",
  "ia_interacoes",
];

/**
 * Um arquivo `plataforma-admin`, lido sem comentários. Cada declaração que
 * chama `createServiceClient(` precisa, ANTES da chamada e dentro dela, de
 * uma de duas coisas: a chamada a `exigirAdminDaPlataforma*` (é ela própria o
 * ponto de entrada), ou a prova no parâmetro (`_prova: { userId: string }`),
 * e então ser exportada: quem a importa é cobrado à parte. `exigemProva`
 * lista essas funções.
 */
function problemasDePlataformaAdmin(codigoSemComentarios: string): { erros: string[]; exigemProva: string[] } {
  const codigo = semImports(codigoSemComentarios);
  const erros: string[] = [];
  const exigemProva: string[] = [];
  const decls = declaracoes(codigo);
  const primeira = codigo.indexOf("createServiceClient(");
  if (primeira < 0) erros.push("não achei createServiceClient(");
  else if (primeira < (decls[0]?.inicio ?? codigo.length)) erros.push("createServiceClient( no topo do módulo");
  for (const d of decls) {
    const corpo = codigo.slice(d.inicio, d.fim);
    const chave = corpo.indexOf("createServiceClient(");
    if (chave < 0) continue;
    const antes = corpo.slice(0, chave);
    if (CHAMA_GUARDA_DA_PLATAFORMA.test(antes)) continue;
    if (PROVA_DE_ADMIN.test(antes)) {
      if (d.exportado) exigemProva.push(d.nome);
      else erros.push(`${d.nome}: a prova da guarda só vale em função exportada (quem importa é cobrado)`);
      continue;
    }
    erros.push(`${d.nome}: createServiceClient( sem exigirAdminDaPlataforma* antes nem a prova da guarda no parâmetro`);
  }
  // O regex só ancora no NOME da tabela; o resto do argumento pode vir
  // (`"x" as never`, quando a tabela falta no types.ts editado à mão). O `)`
  // que fecha o `.from(` é achado à parte, por `fimDoFrom`.
  for (const m of codigo.matchAll(/(?<!storage\s*)\.from\(\s*["'](\w+)["']/g)) {
    if (FORA_DA_PLATAFORMA.includes(m[1])) erros.push(`consulta ${m[1]}: a área da plataforma não lê conversa nem ficha`);
    const fim = fimDoFrom(codigo, m.index! + m[0].length);
    if (m[1] === "leads" && (fim < 0 || !soContaLeads(codigo.slice(fim)))) {
      erros.push("consulta leads: a área da plataforma só conta leads (select com head: true), nunca lê nem escreve");
    }
  }
  // Tabela em variável escaparia das duas regras acima, que só leem o nome
  // literal. A única exceção é o desfazer do grupo, que percorre
  // `ORDEM_DO_DESFAZER` (lista fechada, conferida no teste abaixo).
  for (const m of codigo.matchAll(/(?<!storage\s*)\.from\(\s*(?!["'])([^)]*)\)/g)) {
    const percorreAOrdem = m[1].trim() === "tabela" && /for\s*\(\s*const\s*\{\s*tabela\b[^}]*\}\s*of\s+ORDEM_DO_DESFAZER\s*\)/.test(codigo);
    if (!percorreAOrdem) erros.push(`consulta .from(${m[1].trim()}): a tabela precisa ser escrita, para a guarda ler o nome`);
  }
  return { erros, exigemProva };
}

/**
 * Posição logo depois do `)` que fecha o `.from(`, contando parênteses a
 * partir de `desde` (dentro do argumento). -1 quando não fecha.
 */
function fimDoFrom(codigo: string, desde: number): number {
  let nivel = 1;
  for (let i = desde; i < codigo.length; i++) {
    if (codigo[i] === "(") nivel++;
    else if (codigo[i] === ")" && --nivel === 0) return i + 1;
  }
  return -1;
}

/**
 * `leads` é ficha: a área da plataforma só pode CONTAR (Task 9). O próximo
 * passo da cadeia depois de `.from("leads")` tem de ser um `.select(...)`
 * cujos argumentos tragam `head: true` — aí nenhuma linha volta, só a
 * contagem. Qualquer outro passo (ler colunas, escrever, `rpc`) reprova.
 */
function soContaLeads(resto: string): boolean {
  const select = /^\s*\.select\(/.exec(resto);
  if (!select) return false;
  let nivel = 1;
  let i = select[0].length;
  for (; i < resto.length && nivel > 0; i++) {
    if (resto[i] === "(") nivel++;
    else if (resto[i] === ")") nivel--;
  }
  if (nivel !== 0) return false;
  const argumentos = resto.slice(select[0].length, i - 1);
  return /\bhead\s*:\s*true\b/.test(argumentos);
}

describe("guarda: a regra de plataforma-admin morde", () => {
  it("reprova tabela em variável", () => {
    const codigo = `export async function ler(t: string) {
      await exigirAdminDaPlataformaNaAcao();
      return createServiceClient().from(t).select("id");
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  it("aceita a tabela que vem de ORDEM_DO_DESFAZER, e só ela", () => {
    const percorre = `export async function desfazer() {
      await exigirAdminDaPlataformaNaAcao();
      const s = createServiceClient();
      for (const { tabela, coluna } of ORDEM_DO_DESFAZER) await s.from(tabela).delete().eq(coluna, "g");
    }`;
    expect(problemasDePlataformaAdmin(percorre).erros).toEqual([]);
    const outraLista = percorre.replace("ORDEM_DO_DESFAZER", "OUTRA_LISTA");
    expect(problemasDePlataformaAdmin(outraLista).erros).toHaveLength(1);
  });

  it("ORDEM_DO_DESFAZER não passa por conversa nem por ficha", async () => {
    const { ORDEM_DO_DESFAZER } = await import("@/lib/plataforma/desfazerGrupo");
    const proibidas = [...FORA_DA_PLATAFORMA, "leads"];
    expect(ORDEM_DO_DESFAZER.filter(({ tabela }) => proibidas.includes(tabela))).toEqual([]);
  });

  it("reprova a chave antes da guarda", () => {
    const codigo = `export async function ler() {
      const s = createServiceClient();
      await exigirAdminDaPlataformaNaAcao();
      return s.from("grupos").select("id");
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  it("reprova a chave sem guarda nem prova", () => {
    const codigo = `export async function ler(grupoId: string) {
      return createServiceClient().from("grupos").select("id").eq("id", grupoId);
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  it("reprova a prova em função que não é exportada", () => {
    const codigo = `async function ler(_prova: { userId: string }) {
      return createServiceClient().from("grupos").select("id");
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  it("reprova consulta de conversa, mesmo depois da guarda", () => {
    const codigo = `export async function ler() {
      await exigirAdminDaPlataformaNaPagina();
      return createServiceClient().from("whatsapp_mensagens").select("id", { count: "exact", head: true });
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  // Junção das frentes (Task 9): `leads` é ficha. A área da plataforma só
  // pode CONTAR leads (`head: true`, nenhuma linha volta), nunca ler nem
  // escrever.
  it("reprova ler leads, mesmo depois da guarda", () => {
    const codigo = `export async function ler() {
      await exigirAdminDaPlataformaNaPagina();
      return createServiceClient().from("leads").select("id, nome, telefone").eq("grupo_id", "g");
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  it("reprova contar leads sem head: true (as linhas voltariam junto)", () => {
    const codigo = `export async function ler() {
      await exigirAdminDaPlataformaNaPagina();
      return createServiceClient().from("leads").select("id, nome", { count: "exact" });
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  it("reprova escrever em leads", () => {
    const codigo = `export async function mexer() {
      await exigirAdminDaPlataformaNaAcao();
      return createServiceClient().from("leads").update({ etapa: "perdido" }).eq("id", "x");
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  // Rodada 1 da revisão da Task 9: o `.from(` com mais coisa depois do nome
  // (`as never`, a forma de quando a tabela falta no types.ts editado à mão)
  // tem de seguir reprovando nas duas regras.
  it("reprova conversa com `as never` depois do nome", () => {
    const codigo = `export async function ler() {
      await exigirAdminDaPlataformaNaPagina();
      return createServiceClient().from("whatsapp_mensagens" as never).select("id", { count: "exact", head: true });
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  it("reprova ler leads com `as never` depois do nome", () => {
    const codigo = `export async function ler() {
      await exigirAdminDaPlataformaNaPagina();
      return createServiceClient().from("leads" as never).select("id, nome").eq("grupo_id", "g");
    }`;
    expect(problemasDePlataformaAdmin(codigo).erros).toHaveLength(1);
  });

  it("aceita contar leads com `as never` e head: true", () => {
    const codigo = `export async function contar() {
      await exigirAdminDaPlataformaNaPagina();
      return createServiceClient().from("leads" as never).select("id", { count: "exact", head: true });
    }`;
    expect(problemasDePlataformaAdmin(codigo)).toEqual({ erros: [], exigemProva: [] });
  });

  it("aceita contar leads com head: true", () => {
    const codigo = `export async function contar(grupoId: string) {
      await exigirAdminDaPlataformaNaPagina();
      return createServiceClient()
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("grupo_id", grupoId);
    }`;
    expect(problemasDePlataformaAdmin(codigo)).toEqual({ erros: [], exigemProva: [] });
  });

  it("aceita a guarda antes da chave", () => {
    const codigo = `export async function ler() {
      const prova = await exigirAdminDaPlataformaNaAcao();
      return createServiceClient().from("grupos").select("id");
    }`;
    expect(problemasDePlataformaAdmin(codigo)).toEqual({ erros: [], exigemProva: [] });
  });

  it("aceita a prova no parâmetro e pede a guarda a quem importa", () => {
    const codigo = `export async function ler(_prova: { userId: string }) {
      return createServiceClient().from("grupos").select("id");
    }`;
    expect(problemasDePlataformaAdmin(codigo)).toEqual({ erros: [], exigemProva: ["ler"] });
  });
});

describe("guarda: a chave de serviço está classificada por grupo", () => {
  it("a varredura acha os usuários (senão a guarda aprova tudo calada)", () => {
    expect(usuarios.length).toBeGreaterThanOrEqual(80);
  });

  it("todo arquivo que usa a chave de serviço está no MAPA", () => {
    const fora = usuarios.filter((f) => !MAPA[f]);
    expect(
      fora,
      `Classifique em MAPA (servicoComGrupo.test.ts) com a categoria: por-id, helper, equipe, agrega-por-grupo, cruza-conjuntos, plataforma ou plataforma-admin.\n${fora.join("\n")}`,
    ).toEqual([]);
  });

  it("toda entrada do MAPA ainda usa a chave (entrada velha engana quem lê)", () => {
    const velhas = Object.keys(MAPA).filter((f) => !usuarios.includes(f));
    expect(velhas).toEqual([]);
  });

  it("toda entrada diz o motivo", () => {
    const semMotivo = Object.entries(MAPA)
      .filter(([, e]) => e.motivo.trim().length < 15)
      .map(([f]) => f);
    expect(semMotivo).toEqual([]);
  });

  /*
   * Duas formas de provar, sempre ANTES do primeiro `createServiceClient()`
   * (ou, em quem só recebe o cliente, antes do primeiro uso dele):
   * (1) `validadoPor` é uma FUNÇÃO chamada ali (`nome(`): a sessão, a guarda,
   *     a leitura do link. Nome de parâmetro (`corretorId`, `token`) não
   *     serve: ele já aparece na assinatura e aprovaria sempre. O arquivo que
   *     só recebe o id por parâmetro é `helper`, e a prova mora em quem o
   *     importa.
   * (2) `validadoPor` é o TRECHO de código que valida (uma leitura pela
   *     sessão, uma comparação de segredo): ele aparece antes da chave ou,
   *     quando a credencial É uma linha que só a chave lê (o token do
   *     parceiro, da agenda, do link), é a primeira leitura pela chave.
   */
  it("por-id: quem validou o id é chamado antes da chave", () => {
    const erros: string[] = [];
    for (const [arquivo, e] of Object.entries(MAPA)) {
      if (e.categoria !== "por-id") continue;
      const codigo = semComentarios(ler(arquivo));
      const chave = codigo.indexOf("createServiceClient(");
      const corte = chave >= 0 ? chave : codigo.search(/\.from\(|\.rpc\(|\.storage\b/);
      if (corte < 0) {
        erros.push(`${arquivo}: não achei onde a chave é usada`);
        continue;
      }
      const problema = validacaoAntes(codigo, e.validadoPor, 0, corte, true);
      if (problema) erros.push(`${arquivo}: ${problema}`);
    }
    expect(erros).toEqual([]);
  });

  it("helper: todo importador valida antes de usar (ou repassa a quem valida)", () => {
    const erros: string[] = [];
    for (const helper of repassadores) {
      const quem = importadoresDe(helper);
      if (quem.length === 0) erros.push(`${helper}: ninguém importa; não há quem valide`);
      for (const { arquivo } of quem) {
        const noMapa = MAPA[arquivo];
        const declarado = IMPORTADORES[arquivo];
        // equipe, agrega, cruza, plataforma: o id vem da própria linha lida; helper: repassa.
        if (noMapa && noMapa.categoria !== "por-id") continue;
        if (!noMapa && declarado && "repassa" in declarado) continue;
        if (!noMapa && declarado && "naoPassa" in declarado) {
          const campo = new RegExp(`(?<![\\w$])${escapar(declarado.naoPassa)}(?![\\w$])`);
          if (campo.test(semComentarios(ler(arquivo)))) erros.push(`${arquivo}: passa ${declarado.naoPassa}, então precisa de validadoPor`);
          continue;
        }
        const validadoPor = noMapa?.categoria === "por-id" ? noMapa.validadoPor : declarado && "validadoPor" in declarado ? declarado.validadoPor : null;
        if (!validadoPor) {
          erros.push(`${arquivo} importa ${helper}: declare em IMPORTADORES quem valida o id (validadoPor) ou que repassa`);
          continue;
        }
        // A validação pode morar no próprio helper: ela não conta como uso dele.
        const codigo = semImports(semComentarios(ler(arquivo)));
        const usos = importadoresDe(helper, validadoPor).find((i) => i.arquivo === arquivo)?.usos ?? [];
        for (const pos of usos) {
          const problema = usoValidado(codigo, pos, validadoPor);
          if (problema) {
            erros.push(`${arquivo} (usa ${helper}): ${problema}`);
            break;
          }
        }
      }
    }
    expect(erros).toEqual([]);
  });

  it("helper: subindo pelos importadores, sempre se chega a quem valida", () => {
    const semValidacao = [...repassadores].filter((helper) => {
      const vistos = new Set<string>([helper]);
      const fila = [helper];
      while (fila.length) {
        for (const { arquivo } of importadoresDe(fila.shift()!)) {
          if (vistos.has(arquivo)) continue;
          vistos.add(arquivo);
          if (!repassadores.has(arquivo)) return false;
          fila.push(arquivo);
        }
      }
      return true;
    });
    expect(semValidacao).toEqual([]);
  });

  it("IMPORTADORES: toda entrada importa um helper e não está no MAPA", () => {
    const velhas = Object.keys(IMPORTADORES).filter(
      (f) => MAPA[f] || ![...repassadores].some((h) => importadoresDe(h).some((i) => i.arquivo === f)),
    );
    expect(velhas).toEqual([]);
  });

  it("equipe: cada leitura filtra grupo_id no mesmo encadeamento", () => {
    const erros: string[] = [];
    let leituras = 0;
    for (const [arquivo, e] of Object.entries(MAPA)) {
      if (e.categoria !== "equipe") continue;
      const codigo = semComentarios(ler(arquivo));
      leituras += leiturasDe(codigo).length;
      for (const cadeia of leiturasSemGrupo(codigo)) erros.push(`${arquivo}: ${cadeia}`);
    }
    expect(leituras).toBeGreaterThanOrEqual(20);
    expect(erros).toEqual([]);
  });

  it("agrega-por-grupo: laço de grupos, e o resto lido dentro do grupo da volta", () => {
    const erros: string[] = [];
    for (const [arquivo, e] of Object.entries(MAPA)) {
      if (e.categoria !== "agrega-por-grupo") continue;
      const codigo = semComentarios(ler(arquivo));
      if (!leiturasDe(codigo).some((l) => l.tabela === "grupos")) erros.push(`${arquivo}: não lê a lista de grupos`);
      if (!/for\s*\(\s*const\s+\{\s*id\s*:\s*grupoId\s*\}\s+of\s+grupos\b/.test(codigo)) {
        erros.push(`${arquivo}: sem o laço \`for (const { id: grupoId } of grupos)\``);
      }
      for (const cadeia of leiturasSemGrupo(codigo, ["grupos"])) erros.push(`${arquivo}: ${cadeia}`);
    }
    expect(erros).toEqual([]);
  });

  it("cruza-conjuntos: os lados filtram o grupo e o casamento compara o grupo", () => {
    const erros: string[] = [];
    for (const [arquivo, e] of Object.entries(MAPA)) {
      if (e.categoria !== "cruza-conjuntos") continue;
      const codigo = semComentarios(ler(arquivo));
      const [primeiro, segundo] = e.lados;
      const leituras = leiturasDe(codigo).filter((l) => (e.lados as string[]).includes(l.tabela));
      for (const lado of e.lados) {
        if (!leituras.some((l) => l.tabela === lado)) erros.push(`${arquivo}: nenhuma leitura de ${lado}`);
      }
      /*
       * O casamento por grupo, de uma de duas formas:
       * (a) os dois lados filtram pelo MESMO grupo (`.eq("grupo_id", x)` com o
       *     mesmo x em toda leitura);
       * (b) o PRIMEIRO lado é a fonte, lida em todos os grupos com `grupo_id`
       *     na projeção, e o SEGUNDO lado filtra o grupo (`.eq`/`.in`) e,
       *     depois da leitura dele, cada linha é casada pelo grupo dela
       *     (`.get(linha.grupo_id)` ou `=== linha.grupo_id`). Só o primeiro
       *     lado, que é casado depois da leitura, pode ter o grupo apenas na
       *     projeção.
       */
      const filtros = new Set(
        leituras.map((l) => /\.eq\(\s*"grupo_id"\s*,\s*([\w.]+)\s*\)/.exec(l.cadeia)?.[1] ?? "?"),
      );
      const mesmoGrupo = filtros.size === 1 && !filtros.has("?");
      const doSegundo = leituras.filter((l) => l.tabela === segundo);
      const ultimaDoSegundo = Math.max(...doSegundo.map((l) => l.inicio));
      const casaDepois = /\.get\(\s*\w+\.grupo_id\s*\)|===\s*\w+\.grupo_id\b/.test(codigo.slice(ultimaDoSegundo));
      if (!mesmoGrupo && !casaDepois) erros.push(`${arquivo}: o casamento não compara o grupo das linhas`);
      for (const l of leituras) {
        if (FILTRA_GRUPO.test(l.cadeia)) continue;
        const soNaProjecao = l.tabela === primeiro && casaDepois && l.cadeia.includes("grupo_id");
        if (!soNaProjecao) erros.push(`${arquivo}: ${l.tabela} lido sem filtrar grupo_id`);
      }
    }
    expect(erros).toEqual([]);
  });

  it("plataforma-admin: a chave só depois da guarda da plataforma (e quem importa a chama antes)", () => {
    const erros: string[] = [];
    const arquivos = Object.entries(MAPA).filter(([, e]) => e.categoria === "plataforma-admin").map(([f]) => f);
    expect(arquivos.length).toBeGreaterThanOrEqual(1);
    for (const arquivo of arquivos) {
      const { erros: doArquivo, exigemProva } = problemasDePlataformaAdmin(semComentarios(ler(arquivo)));
      erros.push(...doArquivo.map((e) => `${arquivo}: ${e}`));
      if (exigemProva.length === 0) continue;
      let importadores = 0;
      for (const quem of todosOsArquivos) {
        if (quem === arquivo) continue;
        const imp = importacoesDe(quem).find((i) => i.alvo === arquivo);
        if (!imp) continue;
        const usos = [...imp.dinamico];
        for (const [nome, posicoes] of imp.usos) {
          if (nome === "*" || exigemProva.includes(nome)) usos.push(...posicoes);
        }
        if (usos.length === 0) continue;
        importadores++;
        const codigo = semImports(semComentarios(ler(quem)));
        for (const pos of usos) {
          const problemas = GUARDAS_DA_PLATAFORMA.map((g) => usoValidado(codigo, pos, g));
          if (problemas.every(Boolean)) {
            erros.push(`${quem} (usa ${arquivo}): ${problemas[0]}`);
            break;
          }
        }
      }
      if (importadores === 0) erros.push(`${arquivo}: ninguém importa; não há quem chame a guarda`);
    }
    expect(erros).toEqual([]);
  });
});

/**
 * Scripts que rodam com a chave secreta: todo script assim exige `--grupo` e,
 * na fase 1, só aceita o grupo da Next Home (L22). A validação é
 * `grupoDoScript` (ou `lerOpcoesDoGolden`, que aplica a mesma regra e ainda
 * proíbe gravar dentro do repositório).
 */
const SCRIPTS_SEM_GRUPO: Record<string, string> = {
  "scripts/video/worker.ts":
    "worker de render da fila de vídeo (GitHub Actions): processa job a job, cada um no próprio grupo, como um cron (plataforma)",
};

describe("guarda: scripts com chave secreta pedem o grupo", () => {
  const scripts = arquivosDe("scripts").filter((f) =>
    /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE|createServiceClient\(/.test(ler(f)),
  );

  it("a varredura acha os scripts", () => {
    expect(scripts.length).toBeGreaterThanOrEqual(10);
  });

  it("todo script com chave secreta exige --grupo", () => {
    const fora = scripts
      .filter((f) => !SCRIPTS_SEM_GRUPO[f])
      .filter((f) => !/\b(grupoDoScript|lerOpcoesDoGolden)\(/.test(semComentarios(ler(f))));
    expect(fora).toEqual([]);
  });

  it("a exceção declarada ainda existe", () => {
    expect(Object.keys(SCRIPTS_SEM_GRUPO).filter((f) => !scripts.includes(f))).toEqual([]);
  });
});

/**
 * SQL de diagnóstico (`scripts/*.sql`, colado no editor com um papel que
 * enxerga todos os grupos): começa fixando o grupo e recusando outro que não
 * o 1, e cada bloco filtra por ele (L22).
 */
const SQL_DE_DIAGNOSTICO = [
  "scripts/estadoDoCiclo.sql",
  "scripts/medirCargaPainel.sql",
  "scripts/relatorioDaSemana.sql",
  "scripts/revisarRecusas.sql",
];

describe("guarda: o SQL de diagnóstico fixa o grupo", () => {
  it.each(SQL_DE_DIAGNOSTICO)("%s", (arquivo) => {
    const sql = ler(arquivo);
    expect(sql).toContain("set_config('diagnostico.grupo'");
    expect(sql).toMatch(/raise exception/);
    // Pelo menos um filtro por bloco de consulta que lê tabela de grupo.
    const filtros = sql.match(/current_setting\('diagnostico\.grupo'\)::uuid/g) ?? [];
    expect(filtros.length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Log de runtime não é lugar de conversa (L22): no áudio e no e-mail dos
 * portais, nenhum `console.*` leva o conteúdo, a transcrição, o texto
 * transcrito ou o telefone do cliente. O tamanho (`.length`) pode.
 */
const ARQUIVOS_COM_LOG_SENSIVEL = ["src/lib/whatsapp/audioTranscriber.ts", "src/lib/inbound/processarEmail.ts"];

function chamadasDeConsole(codigo: string): string[] {
  const saida: string[] = [];
  for (const m of codigo.matchAll(/console\.\w+\s*\(/g)) {
    let i = m.index! + m[0].length;
    let profundidade = 1;
    while (i < codigo.length && profundidade > 0) {
      if (codigo[i] === "(") profundidade++;
      else if (codigo[i] === ")") profundidade--;
      i++;
    }
    saida.push(codigo.slice(m.index!, i));
  }
  return saida;
}

describe("guarda: logs sem conteúdo de conversa", () => {
  it.each(ARQUIVOS_COM_LOG_SENSIVEL)("%s", (arquivo) => {
    const chamadas = chamadasDeConsole(semComentarios(ler(arquivo)));
    expect(chamadas.length).toBeGreaterThan(0);
    const sensiveis = chamadas.filter(
      (c) => /\b(conteudo|transcricao|telefone)\b/i.test(c) || /\.texto\b(?!\.length)/.test(c),
    );
    expect(sensiveis).toEqual([]);
  });
});
