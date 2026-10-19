import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conferirBaseDoE2E, modoSoSitePublico } from "../e2e/baseDoE2E";
import { conectar } from "../src/lib/grupos/apoioDoBanco";
import { GRUPO_NEXT_HOME_ID } from "../src/lib/grupos/grupo";
import { lerOpcoesDoGolden } from "../scripts/eval/opcoesDoGolden";
import { argumentosDoPushRemoto, conferirBancoRemoto } from "../scripts/banco/bancoRemoto.mjs";

/**
 * Guardas do ambiente de testes (fase 1 da plataforma multi-grupo, spec §14 e
 * §18). Com dados de várias empresas no mesmo banco, três coisas deixam de ser
 * aceitáveis, e as três falham CALADAS — o E2E fica verde e o export do golden
 * roda, só o lugar onde eles batem ou gravam é que está errado:
 *
 * - o E2E diário rodar contra o site de produção, com credencial real;
 * - a esteira subir o rastro das falhas (telas do painel) como artefato
 *   baixável;
 * - o export do golden gravar conversa real dentro do repositório.
 *
 * O repositório vai ficar privado (decisão de 19/10/2026); as guardas
 * continuam valendo mesmo assim, porque privado não é "só a equipe": é quem
 * tiver acesso ao GitHub, hoje e depois.
 */

const PRODUCAO = ["next-home-drab.vercel.app", "nexthomeimoveis.com", "prhhrqyubjcafvucirri"];

/** O YAML sem comentários: os comentários podem (e devem) citar produção. */
function semComentarios(yml: string): string {
  return yml
    // `\r?`: no Windows o checkout vem com CRLF, e `.` não casa o `\r` —
    // sem isso o `#.*$` nunca casava e nenhum comentário saía.
    .split(/\r?\n/)
    .map((linha) => linha.replace(/(^|\s)#.*$/, ""))
    .join("\n");
}

/**
 * Os jobs do workflow, cada um com o próprio trecho do YAML (sem comentários).
 * Recorta pela indentação: `  nome:` abre um job dentro de `jobs:`.
 */
function jobsDo(yml: string): Map<string, string> {
  const jobs = new Map<string, string>();
  const linhas = yml.split("\n");
  const inicio = linhas.findIndex((l) => /^jobs:\s*$/.test(l));
  let atual: string | null = null;
  for (const linha of linhas.slice(inicio + 1)) {
    const abre = /^  ([\w-]+):\s*$/.exec(linha);
    if (abre) {
      atual = abre[1];
      jobs.set(atual, "");
    } else if (/^\S/.test(linha)) {
      atual = null;
    } else if (atual) {
      jobs.set(atual, `${jobs.get(atual)}${linha}\n`);
    }
  }
  return jobs;
}

/**
 * O único job que fala com produção: os specs de `e2e/publico/`, sem login,
 * sem segredo e sem artefato — só leitura de páginas que qualquer visitante
 * abre. É a vigilância diária do que está no ar (achado M da revisão final
 * da fase 1: tirar o agendamento inteiro levou junto essa vigilância).
 */
const JOB_PUBLICO = "site-publico";

describe("o workflow do E2E", () => {
  const bruto = readFileSync(join(process.cwd(), ".github/workflows/e2e.yml"), "utf8");
  const yml = semComentarios(bruto);
  const jobs = jobsDo(yml);
  const outros = [...jobs.keys()].filter((j) => j !== JOB_PUBLICO);

  it("tem o job do site público e o do ambiente de testes", () => {
    expect(jobs.has(JOB_PUBLICO)).toBe(true);
    expect(outros.length).toBeGreaterThan(0);
  });

  it("produção só aparece no job do site público", () => {
    const cabecalho = yml.slice(0, yml.search(/^jobs:\s*$/m));
    for (const trecho of [cabecalho, ...outros.map((j) => jobs.get(j)!)]) {
      for (const p of PRODUCAO) expect(trecho).not.toContain(p);
    }
  });

  it("os outros jobs definem E2E_BASE_URL, e nunca com produção nem no modo só site público", () => {
    for (const job of outros) {
      const trecho = jobs.get(job)!;
      const linhas = trecho.split("\n").filter((l) => /E2E_BASE_URL\s*:/.test(l));
      expect(linhas.length, job).toBeGreaterThan(0);
      for (const linha of linhas) for (const p of PRODUCAO) expect(linha, job).not.toContain(p);
      expect(trecho, job).not.toMatch(/E2E_SO_SITE_PUBLICO/);
    }
  });

  it("o job do site público não tem segredo, credencial nem variável do repositório", () => {
    const trecho = jobs.get(JOB_PUBLICO)!;
    expect(trecho).not.toMatch(/secrets\./);
    expect(trecho).not.toMatch(/vars\./);
    expect(trecho).not.toMatch(/E2E_CORRETOR_|E2E_TESTE_/);
  });

  it("o job do site público roda só os specs de e2e/publico, no modo que recusa login", () => {
    const trecho = jobs.get(JOB_PUBLICO)!;
    expect(trecho).toMatch(/E2E_SO_SITE_PUBLICO:\s*"1"/);
    const comandos = trecho.split("\n").filter((l) => /\brun:/.test(l) && /playwright test|test:e2e/.test(l));
    expect(comandos.length).toBe(1);
    expect(comandos[0]).toMatch(/run:\s*npx playwright test e2e\/publico\/?\s*$/);
  });

  it("nenhum job sobe o rastro das falhas como artefato", () => {
    // O `trace: retain-on-failure` guarda telas e rede do painel logado em
    // test-results/. Subido como artefato, fica baixável por quem tem acesso
    // ao repositório durante a retenção.
    expect(yml).not.toMatch(/upload-artifact/);
    expect(yml).not.toMatch(/test-results/);
  });

  it("o agendamento diário só alcança o job do site público", () => {
    // MOTIVO: o projeto Supabase de testes e o ambiente `teste` da Vercel
    // dependem do Matheus (docs/AMBIENTE-DE-TESTES.md). Sem eles, o job
    // autenticado rodaria todo dia contra uma URL vazia: ele fica sob
    // demanda. Quando o E2E passar verde contra o ambiente de teste, ele
    // pode voltar ao agendamento — mude esta guarda junto.
    expect(yml).toMatch(/workflow_dispatch/);
    expect(yml).toMatch(/^\s*schedule\s*:/m);
    for (const job of outros) {
      expect(jobs.get(job), job).toMatch(/^\s+if:\s*github\.event_name\s*==\s*'workflow_dispatch'\s*$/m);
    }
  });
});

describe("a base do E2E no Playwright", () => {
  it.each([
    "https://next-home-drab.vercel.app",
    "https://next-home-drab.vercel.app/corretor",
    "https://nexthomeimoveis.com",
    "https://www.nexthomeimoveis.com/empreendimentos",
    "http://NEXTHOMEIMOVEIS.COM",
  ])("recusa produção: %s", (url) => {
    expect(() => conferirBaseDoE2E(url)).toThrow(/produção/);
  });

  it.each([
    "http://localhost:3000",
    "https://next-home-teste.vercel.app",
    // Parecido não é igual: só o domínio e os subdomínios dele são produção.
    "https://nexthomeimoveis.com.exemplo.dev",
    "https://outronexthomeimoveis.com",
  ])("aceita o que não é produção: %s", (url) => {
    expect(conferirBaseDoE2E(url)).toBe(url);
  });

  it("recusa endereço que não é URL", () => {
    expect(() => conferirBaseDoE2E("next-home-teste")).toThrow(/E2E_BASE_URL/);
  });

  it("a configuração confere a base antes de usá-la", () => {
    const config = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");
    expect(config).toMatch(/modoSoSitePublico\(process\.env\)/);
    expect(config).toMatch(/conferirBaseDoE2E\(process\.env\.E2E_BASE_URL,\s*soSitePublico\)/);
  });

  // O job diário do site público (e2e.yml, `site-publico`) é a única porta
  // para produção: só com o modo ligado, e o modo recusa qualquer credencial.
  it("no modo só site público, aceita produção", () => {
    expect(conferirBaseDoE2E("https://next-home-drab.vercel.app", true)).toBe(
      "https://next-home-drab.vercel.app",
    );
  });

  it("o modo só site público liga com E2E_SO_SITE_PUBLICO=1 e recusa credencial", () => {
    expect(modoSoSitePublico({})).toBe(false);
    expect(modoSoSitePublico({ E2E_SO_SITE_PUBLICO: "1" })).toBe(true);
    expect(() => modoSoSitePublico({ E2E_SO_SITE_PUBLICO: "1", E2E_CORRETOR_EMAIL: "a@b.c" })).toThrow(
      /credencial/,
    );
    expect(() => modoSoSitePublico({ E2E_SO_SITE_PUBLICO: "1", E2E_CORRETOR_SENHA: "x" })).toThrow(
      /credencial/,
    );
  });

  it("no modo só site público, a configuração não tem o setup de login nem o painel", () => {
    const config = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");
    expect(config).toMatch(/projects:\s*soSitePublico\s*\?\s*projetosDoSitePublico\s*:/);
    const publicos = config.slice(
      config.indexOf("const projetosDoSitePublico"),
      config.indexOf("];", config.indexOf("const projetosDoSitePublico")),
    );
    expect(publicos).not.toMatch(/setup|painel|storageState/);
  });
});

describe("a conexão dos testes de banco e da semeadura", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "postgresql://postgres:x@db.prhhrqyubjcafvucirri.supabase.co:5432/postgres",
    "postgresql://postgres.prhhrqyubjcafvucirri:x@aws-0-ca-central-1.pooler.supabase.com:5432/postgres",
  ])("recusa o banco de produção: %s", (url) => {
    vi.stubEnv("DB_TESTE_URL", url);
    expect(() => conectar()).toThrow(/produção/);
  });

  it("aceita outro banco (a conexão só abre na primeira consulta)", async () => {
    vi.stubEnv("DB_TESTE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    const sql = conectar();
    await sql.end();
  });
});

describe("as migrations do projeto de testes saem do dbTeste.mjs", () => {
  const PUSH_DE_TESTE = "postgresql://postgres.abcdefghijklmnopqrst:x@aws-0-ca-central-1.pooler.supabase.com:5432/postgres";

  it.each([
    "postgresql://postgres:x@db.prhhrqyubjcafvucirri.supabase.co:5432/postgres",
    "postgresql://postgres.prhhrqyubjcafvucirri:x@aws-0-ca-central-1.pooler.supabase.com:5432/postgres",
  ])("recusa o banco de produção: %s", (url) => {
    expect(() => conferirBancoRemoto(url)).toThrow(/produção/);
  });

  it.each([undefined, "", "   "])("recusa URL ausente: %s", (url) => {
    expect(() => conferirBancoRemoto(url)).toThrow(/DB_TESTE_URL/);
  });

  it("recusa o que não é connection string do Postgres", () => {
    expect(() => conferirBancoRemoto("https://abcdefghijklmnopqrst.supabase.co")).toThrow(/postgres/);
  });

  it.each([
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@localhost:54322/postgres",
  ])("manda o banco local para o npm run db:teste: %s", (url) => {
    expect(() => conferirBancoRemoto(url)).toThrow(/db:teste/);
  });

  it("aceita o projeto de testes", () => {
    expect(conferirBancoRemoto(` ${PUSH_DE_TESTE} `)).toBe(PUSH_DE_TESTE);
  });

  it("aplica pelo db push, sem semente", () => {
    const args = argumentosDoPushRemoto(PUSH_DE_TESTE);
    expect(args).toEqual(["db", "push", "--db-url", PUSH_DE_TESTE]);
    expect(args).not.toContain("--include-seed");
  });

  it("o dbTeste.mjs tem o comando remoto, com a conferência antes do push", () => {
    const script = readFileSync(join(process.cwd(), "scripts/banco/dbTeste.mjs"), "utf8");
    const remoto = script.slice(script.indexOf('comando === "remoto"'));
    expect(script).toContain('comando === "remoto"');
    expect(remoto.indexOf("conferirBancoRemoto(")).toBeGreaterThan(-1);
    expect(remoto.indexOf("conferirBancoRemoto(")).toBeLessThan(remoto.indexOf("argumentosDoPushRemoto("));
    const pacote = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pacote.scripts["db:teste:remoto"]).toBe("node scripts/banco/dbTeste.mjs remoto");
  });

  it("o passo a passo usa o dbTeste.mjs, não o CLI direto", () => {
    const doc = readFileSync(join(process.cwd(), "docs/AMBIENTE-DE-TESTES.md"), "utf8");
    expect(doc).toContain("npm run db:teste:remoto");
    expect(doc).not.toMatch(/npx[^\n]*db push/);
  });
});

describe("o export do golden", () => {
  const raiz = process.cwd();

  it("exige --grupo", () => {
    expect(() => lerOpcoesDoGolden([], raiz)).toThrow(/--grupo/);
  });

  it("aceita só o grupo 1", () => {
    expect(() =>
      lerOpcoesDoGolden(["--grupo=00000000-0000-0000-0000-000000000002"], raiz),
    ).toThrow(/grupo 1/);
  });

  it("grava fora do repositório por padrão", () => {
    const { grupo, saida } = lerOpcoesDoGolden([`--grupo=${GRUPO_NEXT_HOME_ID}`], raiz);
    expect(grupo).toBe(GRUPO_NEXT_HOME_ID);
    expect(saida.startsWith(resolve(tmpdir()))).toBe(true);
    expect(saida.startsWith(raiz)).toBe(false);
  });

  it.each(["eval/golden/casos.json", "./qualquer.json", join(raiz, "eval", "x.json")])(
    "recusa --saida dentro do repositório: %s",
    (saida) => {
      expect(() =>
        lerOpcoesDoGolden([`--grupo=${GRUPO_NEXT_HOME_ID}`, `--saida=${saida}`], raiz),
      ).toThrow(/fora do repositório/);
    },
  );

  it("aceita --saida fora do repositório", () => {
    const fora = join(tmpdir(), "golden-revisao.json");
    const { saida } = lerOpcoesDoGolden([`--grupo=${GRUPO_NEXT_HOME_ID}`, `--saida=${fora}`], raiz);
    expect(saida).toBe(resolve(fora));
  });

  it("o script lê as opções e não escreve mais em eval/golden", () => {
    const fonte = readFileSync(join(raiz, "scripts/eval/exportarGolden.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(fonte).toMatch(/lerOpcoesDoGolden\(process\.argv/);
    expect(fonte).toMatch(/writeFileSync\(saida/);
    expect(fonte).not.toMatch(/writeFileSync\(\s*["'`]?eval\/golden/);
    expect(fonte).not.toMatch(/writeFileSync\(ARQUIVO/);
  });

  it.each(["whatsapp_mensagens", "ia_interacoes", "whatsapp_conversas"])(
    "a consulta de %s lê só o grupo pedido",
    (tabela) => {
      // Contar ocorrências no arquivo não basta: tirar o filtro de UMA
      // consulta deixaria a conta acima do mínimo. Cada consulta, da sua
      // `.from(...)` até o fim da instrução, tem de trazer o filtro.
      const fonte = readFileSync(join(raiz, "scripts/eval/exportarGolden.ts"), "utf8");
      const inicio = fonte.indexOf(`.from("${tabela}")`);
      expect(inicio).toBeGreaterThan(-1);
      const consulta = fonte.slice(inicio, fonte.indexOf(";", inicio));
      expect(consulta).toContain('.eq("grupo_id", grupo)');
    },
  );
});
