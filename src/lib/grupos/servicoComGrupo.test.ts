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
  "src/app/(institucional)/contador/[token]/baixar/route.ts": { categoria: "por-id", validadoPor: "lerAcessoContador", motivo: "token do contador; o arquivo é lido no grupo do link" },
  "src/app/(institucional)/contador/[token]/page.tsx": { categoria: "por-id", validadoPor: "lerAcessoContador", motivo: "token do contador; os meses são lidos no grupo do link" },
  "src/app/(institucional)/documentos/[token]/acoes.ts": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; age no lead do link" },
  "src/app/(institucional)/documentos/[token]/page.tsx": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; lê a documentação do lead do link" },
  "src/app/(institucional)/parceiro/[token]/acoes.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "a primeira leitura é a do parceiro pelo token; o resto filtra o grupo dele" },
  "src/app/(institucional)/parceiro/[token]/page.tsx": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "a primeira leitura é a do parceiro pelo token; o espelho filtra o grupo dele" },
  "src/app/(institucional)/portal/[token]/page.tsx": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; lê só o lead do link" },
  "src/app/(institucional)/proposta/[token]/acoes.ts": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; grava o evento do link" },
  "src/app/(institucional)/proposta/[token]/page.tsx": { categoria: "por-id", validadoPor: "lerLinkPublico", motivo: "token do link do cliente; lê os eventos do link" },
  "src/app/(institucional)/selecao/[token]/ir/[slug]/route.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "a leitura do link pelo token decide; o imóvel só conta se estiver na seleção dele" },
  "src/app/api/agenda/[token]/route.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "token da agenda .ics; lê as visitas do corretor dono do token" },
  "src/lib/crm/linkPublico.ts": { categoria: "por-id", validadoPor: '.eq("token", token)', motivo: "é a leitura do link pelo token: devolve o grupo do link a quem chama" },
  "src/lib/financeiro/acessoContador.ts": { categoria: "por-id", validadoPor: "tokenComFormatoValido", motivo: "token do contador; devolve o grupo do link a quem chama" },
  "src/lib/crm/eventosDoLink.ts": { categoria: "helper", motivo: "grava o evento do link cujo token quem chama acabou de validar" },

  // ── Portas de entrada públicas e webhooks: grupo explícito ou credencial ──
  "src/app/api/clique-whatsapp/route.ts": { categoria: "por-id", validadoPor: "grupoDoSite", motivo: "grava no grupo do site; corretor do corpo só vale se for do grupo" },
  "src/app/api/leads/route.ts": { categoria: "por-id", validadoPor: "grupoDoSite", motivo: "grava no grupo do site; corretor e imóvel do corpo só valem se forem do grupo" },
  "src/app/wa/route.ts": { categoria: "por-id", validadoPor: "grupoDoSite", motivo: "porteiro: sorteia e grava o clique no grupo do site" },
  "src/app/wa/[campanha]/route.ts": { categoria: "por-id", validadoPor: "grupoDoSite", motivo: "porteiro: imóvel e sorteio dentro do grupo do site" },
  "src/app/api/webhooks/meta/route.ts": { categoria: "por-id", validadoPor: "assinaturaValida", motivo: "assinatura da Meta; integração presa ao grupo 1 até a fase 7" },
  "src/app/api/webhooks/whatsapp/route.ts": { categoria: "por-id", validadoPor: "resolverInstancia", motivo: "a instância (com o segredo dela) decide o corretor e o grupo da mensagem" },
  "src/lib/whatsapp/repositorio.ts": { categoria: "helper", motivo: "parte da instância que o webhook validou pelo segredo; a palavra-chave filtra o grupo dela" },
  "src/lib/inbound/processarEmail.ts": { categoria: "helper", motivo: "grupo explícito de quem chama (portal = grupo 1; Gmail = grupo da conta); leituras com grupo_id (portas.test.ts)" },

  // ── Painel: o id vem do navegador e é conferido pela sessão ───────────────
  "src/app/api/notificacoes/route.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "inscreve o aparelho só para o corretor da sessão, no grupo dele" },
  "src/app/api/gmail/retorno/route.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/api/imagens/gerar/route.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: "a mídia do catálogo só é lida no grupo do corretor da sessão (L16)" },
  "src/app/api/painel/contador-excel/route.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "o mês é lido no grupo do gestor da sessão" },
  "src/app/corretor/(painel)/_componentes/acoesMensagemPelaIA.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/_componentes/acoesSugestao.ts": { categoria: "por-id", validadoPor: "sugestaoDoCorretor", motivo: "a sugestão é lida pela sessão (RLS) antes de a chave mudar o status" },
  "src/app/corretor/(painel)/_componentes/acoesVisitaCombinada.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/admin/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "toda escrita pela chave filtra o grupo do gestor" },
  "src/app/corretor/(painel)/admin/anuncios/ContaDaMeta.tsx": { categoria: "por-id", validadoPor: "exigirGestorNaPagina", motivo: "a única leitura pela chave (cliques) filtra o grupo do gestor; Meta só no grupo 1" },
  "src/app/corretor/(painel)/admin/parceiros/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "trocar o link confere o grupo do gestor (L16)" },
  "src/app/corretor/(painel)/admin/whatsapp/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "derrubar o número confere o grupo do gestor (L16)" },
  "src/app/corretor/(painel)/conversas/acoes.ts": { categoria: "por-id", validadoPor: "exigirSessao", motivo: "a conversa é lida pela sessão; a chave só assina URL de documento dela" },
  "src/app/corretor/(painel)/conversas/documentoAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/financeiro/contador/acoes.ts": { categoria: "por-id", validadoPor: "exigirGestorNaAcao", motivo: "o arquivo do mês mora em <grupo>/<mês> do gestor" },
  "src/app/corretor/(painel)/leads/[id]/Documentacao.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/leads/[id]/PedidoDoSite.tsx": { categoria: "por-id", validadoPor: 'supabase.from("leads").select("detalhes, parceiro_id").eq("id", leadId)', motivo: "o parceiro é o do lead que a sessão acabou de ler (RLS de leads)" },
  "src/app/corretor/(painel)/leads/[id]/documentacaoAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/perfil/gmailAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/perfil/page.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/visitas/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/visitas/page.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/whatsapp/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },

  // ── Helpers: o id chega por parâmetro de quem chama ──────────────────────
  // Nada aqui valida: a prova mora em quem importa. A guarda `helper` cobra
  // que todo importador esteja no MAPA ou em IMPORTADORES e chame a validação
  // antes do primeiro uso do que importou (ou repasse a quem chama).
  "src/lib/consultor/repositorio.ts": { categoria: "helper", motivo: "corretor da sessão (consultor) e conversa conferida por conversaDoCorretor" },
  "src/lib/estudio/repositorio.ts": { categoria: "helper", motivo: "corretor da sessão (estúdio) e conversa conferida por conversaDoCorretor" },
  "src/lib/imagens/galeria.ts": { categoria: "helper", motivo: "corretor da sessão, passado pela rota de geração" },
  "src/lib/video/fila.ts": { categoria: "helper", motivo: "corretor da sessão; o worker pega o job pela trava, um por vez" },
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
  "src/lib/whatsapp/telemetria.ts": { categoria: "helper", motivo: "grava a interação da conversa que quem chama atendeu" },

  // ── Telas da equipe: toda leitura filtra o grupo do gestor ────────────────
  "src/lib/admin/numerosDaEquipe.ts": { categoria: "equipe", motivo: "fonte da leitura recortada: só expõe consultas com o grupo aplicado" },
  "src/lib/financeiro/primeirasRespostas.ts": { categoria: "equipe", motivo: "horários da primeira resposta da equipe, só do grupo do gestor" },
  "src/app/corretor/(painel)/admin/page.tsx": { categoria: "equipe", motivo: "Visão geral do gestor (L17)" },
  "src/app/corretor/(painel)/admin/whatsapp/page.tsx": { categoria: "equipe", motivo: "WhatsApp da equipe (L17)" },
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
  "src/lib/notificacoes/leadNovo.ts": { categoria: "plataforma", motivo: "aviso por lead, ao corretor dono dele" },
  "src/lib/crm/alertaSemContato.ts": { categoria: "plataforma", motivo: "alerta por lead, ao corretor dono dele" },
  "src/lib/crm/alertaSemResposta.ts": { categoria: "plataforma", motivo: "alerta por conversa, ao corretor dono dela" },
  "src/lib/crm/enviarRelatorioDasAvaliacoes.ts": { categoria: "plataforma", motivo: "por instância: cada corretor recebe só as avaliações dele" },
  "src/lib/crm/lembretesDeTarefa.ts": { categoria: "plataforma", motivo: "lembrete por tarefa, ao corretor dono dela" },
  "src/lib/imagens/limpeza.ts": { categoria: "plataforma", motivo: "apaga arte vencida linha a linha (arquivo e linha da própria arte)" },
  "src/lib/imoveis/reservasVencidas.ts": { categoria: "plataforma", motivo: "libera reserva vencida unidade a unidade" },
  "src/lib/inbound/gmailCaixa.ts": { categoria: "plataforma", motivo: "conta a conta; o lead nasce no grupo da conta (grupo_id dela)" },
  "src/lib/metaAds.ts": { categoria: "plataforma", motivo: "sincroniza a conta da Meta da Next Home, carimbada no grupo 1 (fase 7)" },
  "src/lib/whatsapp/avisoDeQueda.ts": { categoria: "plataforma", motivo: "varre instância a instância; a faixa lê só o corretor da sessão" },
  "src/lib/whatsapp/campaignDispatcher.ts": { categoria: "plataforma", motivo: "disparo item a item, pela instância do corretor dono da lista" },
  "src/lib/whatsapp/listasVivas.ts": { categoria: "plataforma", motivo: "por lista: só leads do corretor dono dela" },
  "src/lib/whatsapp/quedaDoNumero.ts": { categoria: "plataforma", motivo: "protege instância a instância" },
  "src/lib/whatsapp/sonda.ts": { categoria: "plataforma", motivo: "diagnóstico do provedor por instância, em tabela global" },
  "src/lib/whatsapp/vencedoraAB.ts": { categoria: "plataforma", motivo: "decide o A/B lista a lista, nos itens da própria lista" },
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
  "src/app/api/cron/limpar-artes-ia/route.ts": { validadoPor: "requisicaoAutenticada", motivo: "cron com segredo; apaga mensagens barradas antigas linha a linha" },
  "src/app/api/webhooks/email-lead/route.ts": { validadoPor: "token !== segredo", motivo: "segredo do webhook dos portais; o grupo é o fixo da Next Home" },
  "src/app/corretor/(painel)/campanhas/acoes.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; agenda e conversas dele" },
  "src/app/corretor/(painel)/consultor/acoes.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; conversa conferida por conversaDoCorretor" },
  "src/app/corretor/(painel)/conversas/acoesIA.ts": { validadoPor: "exigirSessao", motivo: "conversa lida pela sessão antes de a IA agir" },
  "src/app/corretor/(painel)/estudio/acoes.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; conversa conferida por conversaDoCorretor" },
  "src/app/corretor/(painel)/financeiro/assistente/acoes.ts": { validadoPor: "exigirGestorNaAcao", motivo: "gestor da sessão; grava a telemetria do assistente" },
  "src/app/corretor/(painel)/imoveis/criar-imagem/page.tsx": { validadoPor: "getCorretorLogado", motivo: "galeria do corretor da sessão" },
  "scripts/eval/rodarConversa.ts": { naoPassa: "fewShot", motivo: "eval offline: chama o turno sem fewShot, então nada vai ao banco" },
  "scripts/eval/rodarEval.ts": { naoPassa: "fewShot", motivo: "eval offline: chama o turno sem fewShot, então nada vai ao banco" },
  "src/lib/whatsapp/midiasDaLista.ts": { repassa: true, motivo: "manda as mídias da lista na conversa que o disparador recebeu" },
  "src/lib/whatsapp/turnoDeAtendimento.ts": { repassa: true, motivo: "o turno recebe a identidade (corretor, conversa) de quem atende" },
  "src/app/corretor/(painel)/leads/[id]/acoes.ts": { validadoPor: "getCorretorLogado", motivo: "corretor da sessão; o lead é lido pela RLS" },
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

/** As leituras do arquivo que não filtram o grupo (nem passam pela leitura recortada). */
function leiturasSemGrupo(codigo: string, ignorar: string[] = []): string[] {
  return leiturasDe(codigo)
    .filter((l) => !ignorar.includes(l.tabela))
    .filter((l) => !FILTRA_GRUPO.test(l.cadeia) && !dentroDaLeituraRecortada(codigo, l))
    .map((l) => l.cadeia.replace(/\s+/g, " ").slice(0, 120));
}

describe("guarda: a chave de serviço está classificada por grupo", () => {
  it("a varredura acha os usuários (senão a guarda aprova tudo calada)", () => {
    expect(usuarios.length).toBeGreaterThanOrEqual(80);
  });

  it("todo arquivo que usa a chave de serviço está no MAPA", () => {
    const fora = usuarios.filter((f) => !MAPA[f]);
    expect(
      fora,
      `Classifique em MAPA (servicoComGrupo.test.ts) com a categoria: por-id, helper, equipe, agrega-por-grupo, cruza-conjuntos ou plataforma.\n${fora.join("\n")}`,
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
