import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conferirBaseDoE2E } from "../e2e/baseDoE2E";
import { conectar } from "../src/lib/grupos/apoioDoBanco";
import { GRUPO_NEXT_HOME_ID } from "../src/lib/grupos/grupo";
import { lerOpcoesDoGolden } from "../scripts/eval/opcoesDoGolden";

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

describe("o workflow do E2E", () => {
  const bruto = readFileSync(join(process.cwd(), ".github/workflows/e2e.yml"), "utf8");
  const yml = semComentarios(bruto);

  it("define E2E_BASE_URL, e nunca com o endereço de produção", () => {
    const linhas = yml.split("\n").filter((l) => /E2E_BASE_URL\s*:/.test(l));
    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) {
      for (const p of PRODUCAO) expect(linha).not.toContain(p);
    }
  });

  it("não cita produção em lugar nenhum fora dos comentários", () => {
    for (const p of PRODUCAO) expect(yml).not.toContain(p);
  });

  it("não sobe o rastro das falhas como artefato", () => {
    // O `trace: retain-on-failure` guarda telas e rede do painel logado em
    // test-results/. Subido como artefato, fica baixável por quem tem acesso
    // ao repositório durante a retenção.
    expect(yml).not.toMatch(/upload-artifact/);
    expect(yml).not.toMatch(/test-results/);
  });

  it("roda só sob demanda enquanto o ambiente de teste não existe", () => {
    // MOTIVO: o projeto Supabase de testes e o ambiente `teste` da Vercel
    // dependem do Matheus (docs/AMBIENTE-DE-TESTES.md). Sem eles, um
    // `schedule` rodaria todo dia contra uma URL vazia. Quando o E2E passar
    // verde contra o ambiente de teste, apague este teste e devolva o
    // `schedule` ao e2e.yml — as outras guardas continuam valendo.
    expect(yml).toMatch(/workflow_dispatch/);
    expect(yml).not.toMatch(/^\s*schedule\s*:/m);
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
    expect(config).toMatch(/conferirBaseDoE2E\(process\.env\.E2E_BASE_URL\)/);
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
