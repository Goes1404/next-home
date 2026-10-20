import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda: tela de TRABALHO mostra a carteira de quem abriu o painel
 * (hotfix de 19/10/2026).
 *
 * Relatado em produção: "está misturando os leads de todos os corretores na
 * conta do ADM, aí o ADM não consegue usar como corretor". As telas confiavam
 * na RLS para recortar, e a RLS abre a equipe inteira ao gestor. A regressão é
 * CALADA — build, tipos e testes verdes, a tela abrindo, só com os leads dos
 * outros misturados nos do gestor. Por isso este teste LÊ O CÓDIGO, como
 * `escalaDoPainel` e `leadArquivado`: a regra não é sobre o resultado de uma
 * função, é sobre a consulta de lista/contagem carregar o recorte.
 *
 * A regra: toda LEITURA de `leads`, `pessoas_do_corretor`, `lead_tarefas` ou
 * `anotacoes`
 * fora de /corretor/admin precisa de `.eq("corretor_id", …)` (ou `.in(…)`).
 * Ficam de fora, por construção:
 *   - escrita (`update`/`insert`/`delete`/`upsert`): mexe no que a tela já
 *     mostrou, e quem recorta o alcance é a policy;
 *   - leitura por chave (`id`, `lead_id`, `indicado_por`, `telefone_e164`):
 *     abrir UMA ficha pelo link é permitido — o gestor chega à ficha de um
 *     colega a partir da carteira dele —, e a checagem de duplicado da
 *     importação precisa ver a equipe, senão o mesmo telefone entra duas vezes.
 * O resto é exceção ESCRITA, com o motivo.
 */

const TABELAS = ["leads", "pessoas_do_corretor", "lead_tarefas", "anotacoes"];

/** Bibliotecas que alimentam telas de trabalho, além de src/app/corretor. */
const LIBS_DE_TELA = [
  "src/lib/corretorSessao.ts",
  "src/lib/crm/filaDeTrabalho.ts",
  "src/lib/crm/pessoas.ts",
  "src/lib/crm/dadosLead.ts",
  "src/lib/crm/listasSugeridasDados.ts",
];

const EXCECOES: { arquivo: string; trecho: string; motivo: string }[] = [
  {
    arquivo: "src/lib/corretorSessao.ts",
    trecho: 'select("corretor_id").is("arquivado_em", null)',
    motivo:
      "getCorretoresParaAdmin: conta a carga de CADA corretor para a tela de Contas da " +
      "Administração — é visão da equipe por definição, atrás da guarda de gestor.",
  },
  {
    arquivo: "src/app/corretor/(painel)/_componentes/graficos/PlacarDaEquipe.tsx",
    trecho: '.select("corretor_id, etapa, visita_agendada_em")',
    motivo:
      "O placar compara os corretores entre si e só é montado na Administração " +
      "(admin/page.tsx) — a guarda abaixo confere que continua só lá.",
  },
  {
    arquivo: "src/app/corretor/(painel)/financeiro/acoes.ts",
    trecho: '.select("id, nome, telefone, empreendimento_id, imovel_interesse_id")',
    motivo:
      "Busca de lead ao REGISTRAR uma venda: o gestor registra vendas da equipe " +
      "(inclusive co-corretagem), e a busca só devolve 8 nomes quando se digita — não " +
      "é a carteira listada.",
  },
  {
    arquivo: "src/app/corretor/(painel)/marketing/impulsionamentos/page.tsx",
    trecho: '.or("origem.eq.meta/ctwa,impulsionamento_id.not.is.null")',
    motivo:
      "Anúncios pagos é relatório de campanha: o ADM vê as campanhas da equipe inteira " +
      "por desenho (0134), e cada campanha conta os leads que trouxe, de quem for. " +
      "Não é lista de trabalho — não abre conversa nem move etapa.",
  },
];

function arquivos(dir: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho));
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

function relativo(caminho: string): string {
  return caminho.slice(process.cwd().length + 1).replace(/\\/g, "/");
}

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Cada consulta: do `.from("<tabela>")` até a próxima `.from(` ou o fim da
 * função (`}` na coluna zero). Inclui os `query = query.eq(...)` das
 * consultas montadas em passos, que a cadeia literal sozinha não veria.
 */
export function consultasDe(codigo: string): { tabela: string; texto: string }[] {
  const achadas: { tabela: string; texto: string }[] = [];
  const re = /\.from\("([a-z_]+)"\)/g;
  for (const m of codigo.matchAll(re)) {
    if (!TABELAS.includes(m[1])) continue;
    const inicio = m.index ?? 0;
    const resto = codigo.slice(inicio + m[0].length);
    const proximaFrom = resto.search(/\.from\(/);
    const fimFuncao = resto.search(/\n\}/);
    const cortes = [proximaFrom, fimFuncao, 2500].filter((n) => n >= 0);
    achadas.push({ tabela: m[1], texto: m[0] + resto.slice(0, Math.min(...cortes)) });
  }
  return achadas;
}

export function precisaDeRecorte(texto: string): boolean {
  const depois = texto.replace(/^\.from\("[a-z_]+"\)\s*/, "");
  if (/^\.(update|insert|delete|upsert)\(/.test(depois)) return false;
  if (/\.(eq|in)\("(id|lead_id|indicado_por|telefone_e164)"/.test(texto)) return false;
  // `destinatario_id` é o recorte das anotações (quem RECEBE a nota age
  // sobre ela); `corretor_id.eq.` cobre o `.or(autor, destinatário)`.
  return !/\.(eq|in)\("(corretor_id|destinatario_id)"|corretor_id\.eq\./.test(texto);
}

describe("tela de trabalho mostra a carteira de quem abriu o painel", () => {
  const telas = arquivos(join(process.cwd(), "src", "app", "corretor"))
    .map(relativo)
    .filter((r) => !r.includes("/(painel)/admin/"));
  const alvos = [...telas, ...LIBS_DE_TELA];

  it("encontra as consultas (o teste não pode passar por estar vazio)", () => {
    const total = alvos.reduce((t, a) => t + consultasDe(semComentarios(readFileSync(a, "utf8"))).length, 0);
    expect(telas.length).toBeGreaterThan(50);
    expect(total).toBeGreaterThan(30);
  });

  it("toda leitura de lista/contagem de leads, pessoas ou tarefas recorta por corretor", () => {
    const infratores: string[] = [];
    for (const arquivo of alvos) {
      for (const { tabela, texto } of consultasDe(semComentarios(readFileSync(arquivo, "utf8")))) {
        if (!precisaDeRecorte(texto)) continue;
        if (EXCECOES.some((e) => e.arquivo === arquivo && texto.replace(/\s+/g, "").includes(e.trecho.replace(/\s+/g, "")))) continue;
        infratores.push(`${arquivo} (${tabela}): ${texto.slice(0, 160).replace(/\s+/g, " ")}`);
      }
    }
    expect(
      infratores,
      "Estas consultas de tela de trabalho leem a carteira sem recortar por corretor — " +
        "para o gestor a RLS abre a equipe inteira e a tela mistura os leads de todos. " +
        "Use recorteDaVisao() (corretorSessao) e .eq(\"corretor_id\", …). Se for visão da " +
        "equipe de propósito, registre em EXCECOES com o motivo.",
    ).toEqual([]);
  });

  it("toda exceção ainda existe (exceção obsoleta vira comentário morto)", () => {
    for (const e of EXCECOES) {
      const codigo = semComentarios(readFileSync(e.arquivo, "utf8")).replace(/\s+/g, "");
      expect(codigo, `${e.arquivo}: o trecho da exceção sumiu — apague a exceção`).toContain(
        e.trecho.replace(/\s+/g, ""),
      );
    }
  });

  it("a decisão da carteira mora num ponto só e a lista a usa", () => {
    const sessao = semComentarios(readFileSync("src/lib/corretorSessao.ts", "utf8"));
    expect(sessao).toMatch(/export const getCarteiraDaVisao = cache\(/);
    expect(sessao).toContain("decidirCarteira(await getCorretorLogado()");
    const lista = semComentarios(readFileSync("src/app/corretor/(painel)/leads/page.tsx", "utf8"));
    expect(lista).toContain("getCarteiraDaVisao(");
    // O gestor que abriu a carteira de outro precisa LER isso na tela.
    expect(lista).toContain("Você está vendo a carteira de");
  });

  it("o placar da equipe só é montado na Administração", () => {
    const usos = arquivos(join(process.cwd(), "src", "app"))
      .map(relativo)
      .filter((r) => !r.endsWith("PlacarDaEquipe.tsx"))
      .filter((r) => /<PlacarDaEquipe\b/.test(readFileSync(r, "utf8")));
    expect(usos.length).toBeGreaterThan(0);
    for (const r of usos) expect(r).toContain("/(painel)/admin/");
  });

  it("os números da Administração pedem a equipe ao cair na lista", () => {
    // Sem `corretor=equipe`, o link de um KPI da equipe abriria só os leads
    // do gestor e o número mentiria sobre o próprio destino.
    for (const arquivo of [
      "src/app/corretor/(painel)/admin/page.tsx",
      "src/app/corretor/(painel)/admin/leads/page.tsx",
      "src/app/corretor/(painel)/admin/construtoras/page.tsx",
      "src/app/corretor/(painel)/admin/anuncios/ContaDaMeta.tsx",
    ]) {
      const codigo = readFileSync(arquivo, "utf8");
      const links = [...codigo.matchAll(/\/corretor\/leads\?([^"`]*)/g)].map((m) => m[1]);
      expect(links.length, arquivo).toBeGreaterThan(0);
      for (const qs of links) {
        expect(/^corretor=/.test(qs), `${arquivo}: /corretor/leads?${qs} sem corretor=`).toBe(true);
      }
    }
  });

  // As duas guardas abaixo varrem TODO arquivo de /corretor/admin — não uma
  // lista — porque a regressão da rodada 1 morou exatamente fora do que a
  // guarda acima enxerga: link sem query string e chamada sem argumento.
  const doAdmin = arquivos(join(process.cwd(), "src", "app", "corretor"))
    .map(relativo)
    .filter((r) => r.includes("/(painel)/admin/"));

  it("nenhum link da Administração cai na lista sem dizer de quem é a carteira", () => {
    expect(doAdmin.length).toBeGreaterThan(10);
    const infratores: string[] = [];
    let links = 0;
    for (const arquivo of doAdmin) {
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));
      // `/corretor/leads` fechando a string (sem `?`), ou com `?` sem
      // `corretor=` como primeiro parâmetro. `revalidatePath` não é link.
      for (const m of codigo.matchAll(/(revalidatePath\(\s*)?["'`]\/corretor\/leads(\?[^"'`]*)?["'`]/g)) {
        if (m[1]) continue;
        links++;
        const qs = m[2] ?? "";
        if (/^\?corretor=/.test(qs)) continue;
        infratores.push(`${arquivo}: /corretor/leads${qs}`);
      }
    }
    expect(links).toBeGreaterThan(0);
    expect(
      infratores,
      "Link da Administração para /corretor/leads sem corretor=: desde o hotfix a lista " +
        "abre só os leads do gestor, e o número da equipe não bate com o destino. " +
        "Use /corretor/leads?corretor=equipe (ou ?corretor=<id>).",
    ).toEqual([]);
  });

  it("a Administração pede a equipe ao chamar as leituras que recortam pela sessão", () => {
    // Sem argumento, estas funções devolvem a carteira de quem abriu o painel.
    // Na Administração isso é sempre engano: foi o que fez "Contatos recentes"
    // de Leads da equipe mostrar só os leads do ADM.
    const FUNCOES = [
      "getPaginaDeLeads",
      "getContagemPorEtapa",
      "contarLeadsArquivados",
      "recorteDaVisao",
      "getCarteiraDaVisao",
      "getLeadsDoFunil",
      "getLeadsDeVisita",
      "getVisitasDeHoje",
    ];
    const infratores: string[] = [];
    let chamadas = 0;
    for (const arquivo of doAdmin) {
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));
      for (const fn of FUNCOES) {
        for (const m of codigo.matchAll(new RegExp(`\\b${fn}\\(([^)]*)\\)`, "g"))) {
          chamadas++;
          // Só vale pedido explícito: a equipe, ou um corretor por id.
          if (!/CARTEIRA_EQUIPE|["'`]equipe["'`]|corretorId\s*:/.test(m[1])) {
            infratores.push(`${arquivo}: ${m[0]}`);
          }
        }
      }
    }
    // Leads da equipe chama getPaginaDeLeads: se a varredura não achar nem
    // essa, o regex quebrou e o teste passaria vazio.
    expect(chamadas).toBeGreaterThan(0);
    expect(
      infratores,
      "Chamada na Administração sem pedir a equipe: devolve só a carteira do gestor. " +
        "Passe { corretorId: CARTEIRA_EQUIPE } (ou CARTEIRA_EQUIPE como pedido).",
    ).toEqual([]);
  });
});
