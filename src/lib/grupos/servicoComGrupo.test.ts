import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
 *   do webhook, token, id validado pela sessão). `validadoPor` nomeia quem
 *   validou, e esse nome tem de aparecer no código ANTES do primeiro
 *   `createServiceClient()`.
 * - `equipe`: lê várias pessoas para mostrar ao usuário. Cada leitura
 *   (`.from("x")...select`) do arquivo leva `grupo_id` no mesmo
 *   encadeamento, ou passa pela leitura recortada (`.ler(`/`.lerView(` de
 *   `leituraDoGrupo`), que aplica o grupo por construção.
 * - `agrega-por-grupo`: cron que soma números. Lê a lista de grupos e roda
 *   um laço; toda outra leitura obedece à regra de `equipe` (os números E os
 *   destinatários são do grupo da volta).
 * - `cruza-conjuntos`: cron que junta duas listas. Cada leitura dos dois
 *   lados traz `grupo_id`, e o casamento compara o grupo das duas linhas.
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
  | { categoria: "plataforma" };

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
  "src/lib/crm/eventosDoLink.ts": { categoria: "por-id", validadoPor: "token", motivo: "grava o evento do link cujo token quem chama acabou de validar" },

  // ── Portas de entrada públicas e webhooks: grupo explícito ou credencial ──
  "src/app/api/clique-whatsapp/route.ts": { categoria: "por-id", validadoPor: "grupoDoSite", motivo: "grava no grupo do site; corretor do corpo só vale se for do grupo" },
  "src/app/api/leads/route.ts": { categoria: "por-id", validadoPor: "grupoDoSite", motivo: "grava no grupo do site; corretor e imóvel do corpo só valem se forem do grupo" },
  "src/app/wa/route.ts": { categoria: "por-id", validadoPor: "grupoDoSite", motivo: "porteiro: sorteia e grava o clique no grupo do site" },
  "src/app/wa/[campanha]/route.ts": { categoria: "por-id", validadoPor: "grupoDoSite", motivo: "porteiro: imóvel e sorteio dentro do grupo do site" },
  "src/app/api/webhooks/meta/route.ts": { categoria: "por-id", validadoPor: "assinaturaValida", motivo: "assinatura da Meta; integração presa ao grupo 1 até a fase 7" },
  "src/app/api/webhooks/whatsapp/route.ts": { categoria: "por-id", validadoPor: "resolverInstancia", motivo: "a instância (com o segredo dela) decide o corretor e o grupo da mensagem" },
  "src/lib/whatsapp/repositorio.ts": { categoria: "por-id", validadoPor: "instanceName", motivo: "parte da instância que o webhook validou pelo segredo; a palavra-chave filtra o grupo dela" },
  "src/lib/inbound/processarEmail.ts": { categoria: "por-id", validadoPor: "grupoId", motivo: "grupo explícito de quem chama (portal = grupo 1; Gmail = grupo da conta); leituras com grupo_id (portas.test.ts)" },

  // ── Painel: o id vem do navegador e é conferido pela sessão ───────────────
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
  "src/app/corretor/(painel)/leads/[id]/PedidoDoSite.tsx": { categoria: "por-id", validadoPor: "lead.parceiro_id", motivo: "o parceiro é o do lead que a sessão acabou de ler (RLS de leads)" },
  "src/app/corretor/(painel)/leads/[id]/documentacaoAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/perfil/gmailAcoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/perfil/page.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/visitas/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/visitas/page.tsx": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },
  "src/app/corretor/(painel)/whatsapp/acoes.ts": { categoria: "por-id", validadoPor: "getCorretorLogado", motivo: POR_SESSAO },

  // ── Helpers: o id chega de quem chama, já validado ────────────────────────
  // Aqui `validadoPor` é o parâmetro que traz o id; o motivo diz quem o
  // validou. É uma declaração, não uma prova: a prova mora no chamador.
  "src/lib/consultor/repositorio.ts": { categoria: "por-id", validadoPor: "corretorId", motivo: "corretor da sessão (consultor) e conversa conferida por conversaDoCorretor" },
  "src/lib/estudio/repositorio.ts": { categoria: "por-id", validadoPor: "corretorId", motivo: "corretor da sessão (estúdio) e conversa conferida por conversaDoCorretor" },
  "src/lib/imagens/galeria.ts": { categoria: "por-id", validadoPor: "corretorId", motivo: "corretor da sessão, passado pela rota de geração" },
  "src/lib/video/fila.ts": { categoria: "por-id", validadoPor: "corretorId", motivo: "corretor da sessão; o worker pega o job pela trava, um por vez" },
  "src/lib/crm/agendaDoCorretor.ts": { categoria: "por-id", validadoPor: "corretorId", motivo: "corretor da instância que o webhook validou" },
  "src/lib/crm/avisoAoCorretor.ts": { categoria: "por-id", validadoPor: "corretorId", motivo: "manda ao próprio corretor, a partir da linha que o cron leu" },
  "src/lib/crm/envioAutorizado.ts": { categoria: "por-id", validadoPor: "caminho", motivo: "caminho <lead>/... montado por quem chama depois de validar o lead" },
  "src/lib/whatsapp/aberturaPelaIA.ts": { categoria: "por-id", validadoPor: "instancia", motivo: "conversa e instância do corretor validadas por quem chama (sessão ou webhook)" },
  "src/lib/whatsapp/aprendizadoContinuo.ts": { categoria: "por-id", validadoPor: "corretorId", motivo: "exemplos só das conversas do corretor da instância" },
  "src/lib/whatsapp/importarHistorico.ts": { categoria: "por-id", validadoPor: "conversaId", motivo: "conversa da instância que o webhook validou" },
  "src/lib/whatsapp/impulsionamentos.ts": { categoria: "por-id", validadoPor: "leadId", motivo: "lead e corretor da mensagem que o webhook validou" },
  "src/lib/whatsapp/midiaRecebida.ts": { categoria: "por-id", validadoPor: "instanceName", motivo: "mídia da mensagem que o webhook validou, guardada na pasta do lead" },
  "src/lib/whatsapp/respostaAosFollowups.ts": { categoria: "por-id", validadoPor: "conversaId", motivo: "conversa em atendimento, validada por quem chama" },
  "src/lib/whatsapp/telemetria.ts": { categoria: "por-id", validadoPor: "dados", motivo: "grava a interação da conversa que quem chama atendeu" },

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

/** A leitura está dentro de `.ler((c) => c.from(...))`: o grupo vem por construção. */
function dentroDaLeituraRecortada(codigo: string, leitura: Leitura): boolean {
  const antes = codigo.slice(Math.max(0, leitura.inicio - 60), leitura.inicio);
  return /\.(ler|lerView)\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\s*$/.test(antes);
}

/** As leituras do arquivo que não citam o grupo (nem passam pela leitura recortada). */
function leiturasSemGrupo(codigo: string, ignorar: string[] = []): string[] {
  return leiturasDe(codigo)
    .filter((l) => !ignorar.includes(l.tabela))
    .filter((l) => !l.cadeia.includes("grupo_id") && !dentroDaLeituraRecortada(codigo, l))
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
      `Classifique em MAPA (servicoComGrupo.test.ts) com a categoria: por-id, equipe, agrega-por-grupo, cruza-conjuntos ou plataforma.\n${fora.join("\n")}`,
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
   * Duas formas de provar. (1) O nome aparece no código antes do primeiro
   * `createServiceClient()` (ou, em quem só recebe o cliente, antes do
   * primeiro uso dele): a sessão, a guarda, a leitura do link. (2) Quando a
   * credencial É uma linha que só a chave lê (o token do parceiro, da
   * agenda, do link), a validação é a PRIMEIRA leitura pela chave, e o
   * encadeamento dela tem de conter o que `validadoPor` diz.
   */
  it("por-id: quem validou o id aparece antes do primeiro createServiceClient()", () => {
    const erros: string[] = [];
    const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [arquivo, e] of Object.entries(MAPA)) {
      if (e.categoria !== "por-id") continue;
      const codigo = semComentarios(ler(arquivo));
      const chave = codigo.indexOf("createServiceClient(");
      const corte = chave >= 0 ? chave : codigo.search(/\.from\(|\.rpc\(|\.storage\b/);
      if (corte < 0) {
        erros.push(`${arquivo}: não achei onde a chave é usada`);
        continue;
      }
      const nome = new RegExp(`(^|[^\\w$])${escapar(e.validadoPor)}($|[^\\w$])`);
      // O `import` não valida nada: só conta o nome usado no código.
      const antes = nome.test(codigo.slice(0, corte).replace(/^\s*import\b[^;]*;/gm, ""));
      const primeiraLeitura = leiturasDe(codigo.slice(corte))[0];
      const naPrimeiraLeitura = primeiraLeitura?.cadeia.includes(e.validadoPor) ?? false;
      if (!antes && !naPrimeiraLeitura) erros.push(`${arquivo}: ${e.validadoPor}`);
    }
    expect(erros).toEqual([]);
  });

  it("equipe: cada leitura leva grupo_id no mesmo encadeamento", () => {
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

  it("cruza-conjuntos: os dois lados trazem grupo_id e o casamento compara o grupo", () => {
    const erros: string[] = [];
    for (const [arquivo, e] of Object.entries(MAPA)) {
      if (e.categoria !== "cruza-conjuntos") continue;
      const codigo = semComentarios(ler(arquivo));
      for (const lado of e.lados) {
        const doLado = leiturasDe(codigo).filter((l) => l.tabela === lado);
        if (doLado.length === 0) erros.push(`${arquivo}: nenhuma leitura de ${lado}`);
        for (const l of doLado) {
          if (!l.cadeia.includes("grupo_id")) erros.push(`${arquivo}: ${lado} lido sem grupo_id`);
        }
      }
      /*
       * O casamento por grupo, de uma de duas formas: (a) os dois lados
       * filtram pelo MESMO grupo (`.eq("grupo_id", x)` com o mesmo x em toda
       * leitura), ou (b) depois de ler o segundo lado, a linha dele é casada
       * pelo grupo dela (`.get(linha.grupo_id)` ou `=== linha.grupo_id`).
       */
      const leituras = leiturasDe(codigo).filter((l) => (e.lados as string[]).includes(l.tabela));
      const filtros = new Set(
        leituras.map((l) => /\.eq\(\s*"grupo_id"\s*,\s*([\w.]+)\s*\)/.exec(l.cadeia)?.[1] ?? "?"),
      );
      const mesmoGrupo = filtros.size === 1 && !filtros.has("?");
      const ultimaDoSegundo = Math.max(...leituras.filter((l) => l.tabela === e.lados[1]).map((l) => l.inicio));
      const casaDepois = /\.get\(\s*\w+\.grupo_id\s*\)|===\s*\w+\.grupo_id\b/.test(codigo.slice(ultimaDoSegundo));
      if (!mesmoGrupo && !casaDepois) erros.push(`${arquivo}: o casamento não compara o grupo das linhas`);
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
