import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de escala do painel (roadmap F6).
 *
 * As regressões que este arquivo existe para impedir já aconteceram duas
 * vezes nesta reforma:
 *
 * 1. Toda tela de lead baixava a carteira inteira (`getMeusLeads` sem
 *    limite) e filtrava no navegador — invisível com 57 leads de teste,
 *    doloroso com 100 por corretor.
 * 2. Depois que o quadro do funil ganhou teto de 300 cartões, as telas do
 *    gestor — que agregavam a partir da MESMA consulta — passaram a contar
 *    errado em silêncio: 1.000 leads virariam "300", um número plausível
 *    que ninguém questiona.
 *
 * As duas falharam calado, que é o pior desfecho. Um teste que lê o código
 * é feio, mas é o único que pega isso sem subir banco: a regra não é sobre
 * o resultado de uma função, é sobre QUAL função a tela chama.
 */

const RAIZ_PAINEL = join(process.cwd(), "src", "app", "corretor");

/** Funções que trazem linhas sem teto — proibidas em tela. */
const SEM_LIMITE = ["getMeusLeads"];

/**
 * Quem pode chamá-las, com a razão. A lista existe para que uma exceção seja
 * uma DECISÃO escrita, e não um `git grep` que ninguém fez.
 */
const EXCECOES: Record<string, string> = {
  "src/app/corretor/(painel)/campanhas/acoes.ts":
    "Montar a fila de campanha precisa de TODOS os leads elegíveis de uma vez — " +
    "uma página de 30 criaria uma campanha para 30 pessoas em vez da base inteira. " +
    "Não é tela: roda uma vez, no servidor, ao criar a campanha.",
};

function arquivosDoPainel(dir: string): string[] {
  const encontrados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      encontrados.push(...arquivosDoPainel(caminho));
    } else if (nome.endsWith(".tsx") || nome.endsWith(".ts")) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

function relativo(caminho: string): string {
  return caminho.slice(process.cwd().length + 1).replace(/\\/g, "/");
}

/**
 * Comentário que MENCIONA a função proibida não é chamada — e esta base
 * documenta bastante o "antes". Sem tirar os comentários, o teste acusaria
 * justamente o arquivo que explica por que não usa mais a função.
 */
function codigoSemComentarios(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("escala do painel", () => {
  const arquivos = arquivosDoPainel(RAIZ_PAINEL);

  it("encontra os arquivos do painel (o teste não pode passar por estar vazio)", () => {
    expect(arquivos.length).toBeGreaterThan(20);
  });

  it("nenhuma tela do painel puxa a carteira inteira", () => {
    const infratores = arquivos
      .filter((caminho) => {
        const rel = relativo(caminho);
        if (EXCECOES[rel]) return false;
        const conteudo = codigoSemComentarios(caminho);
        return SEM_LIMITE.some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(conteudo));
      })
      .map(relativo);

    expect(
      infratores,
      `Estas telas chamam uma consulta sem teto (${SEM_LIMITE.join(", ")}). ` +
        `Use getPaginaDeLeads (paginada) para listar, getContagemPorEtapa para contar ` +
        `ou getAgregadoDaEquipe para os números do gestor. Se houver um motivo real, ` +
        `registre-o em EXCECOES com a justificativa.`,
    ).toEqual([]);
  });

  /*
   * A leitura do painel NÃO é a leitura da vitrine.
   *
   * `getEmpreendimentoBySlug` (lib/queries) filtra `publicado = true`: é o
   * site. O editor do imóvel a usava, e com isso o cadastro recém-criado —
   * que nasce despublicado de propósito — caía em `notFound()`. O corretor
   * preenchia o formulário, o imóvel ENTRAVA no banco, e a tela seguinte
   * dizia que não existia; foi assim que o cadastro "teste" ficou preso lá.
   * Relatado em 04/09/2026 como "erro na criação do imóvel".
   *
   * A regressão falha calada: build passa, tipos passam, a tela até abre
   * para os imóveis publicados — que são a maioria. Só o rascunho quebra, e
   * rascunho é justamente o que se acabou de criar.
   */
  it("o painel lê imóvel pelo catálogo do painel, nunca pela consulta da vitrine", () => {
    const infratores = arquivos
      .filter((caminho) => codigoSemComentarios(caminho).includes("getEmpreendimentoBySlug"))
      .map(relativo);

    expect(
      infratores,
      `Estas telas do painel leem o imóvel pela consulta da VITRINE, que só ` +
        `devolve publicado — o rascunho recém-criado cai em notFound(). Use ` +
        `getEmpreendimentoDoPainel (lib/imoveis/catalogoDoPainel).`,
    ).toEqual([]);
  });

  it("as telas do gestor contam pelo agregado, não pela consulta do quadro", () => {
    // `getLeadsDoFunil` tem teto (TETO_DO_QUADRO) e serve para DESENHAR o
    // quadro. Usá-la para somar números faz a conta parar no teto.
    const telasDoGestor = arquivos.filter((c) => relativo(c).includes("/admin/"));
    expect(telasDoGestor.length).toBeGreaterThan(0);

    const infratores = telasDoGestor
      .filter((caminho) => /\bgetLeadsDoFunil\s*\(/.test(codigoSemComentarios(caminho)))
      .map(relativo);

    expect(
      infratores,
      "Telas do gestor devem usar getAgregadoDaEquipe: getLeadsDoFunil tem teto de " +
        "cartões e faria os totais pararem no teto, sem erro nenhum.",
    ).toEqual([]);
  });
});
