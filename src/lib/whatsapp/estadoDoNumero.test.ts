import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * O estado do número só o servidor escreve (0175, 10/10/2026).
 *
 * Até a 0175 o corretor podia reescrever a própria linha de
 * `corretor_whatsapp_instancias` pela API: zerar o contador do dia, apagar o
 * aquecimento, o disjuntor e o espaçamento, voltar ao rodízio com a sessão
 * morta e gravar um segredo de webhook próprio. A regressão é calada nos dois
 * sentidos: um grant a mais devolve o buraco sem nenhuma tela mudar, e uma
 * gravação de estado pela sessão falha sem erro visível (o painel ignora o
 * retorno de algumas delas).
 */

/** O que a sessão do corretor pode alterar: a configuração da assistente. */
const CONFIGURACAO = [
  "nome_assistente",
  "tom_voz",
  "modo_bot",
  "palavra_chave_ativacao",
  "palavra_chave_teste",
  "palavras_entrada_cliente",
  "expediente_inicio",
  "expediente_fim",
  "regras_da_ia",
  "updated_at",
];

/**
 * Estado do número e chaves da linha. Nenhuma pode entrar no grant: são os
 * limites anti-ban, a conexão e o que liga o webhook a este corretor.
 */
const ESTADO = [
  "id",
  "corretor_id",
  "instance_name",
  "webhook_secret",
  "created_at",
  "status_conexao",
  "telefone_conectado",
  "qrcode_base64",
  "conectado_em",
  "desconectado_em",
  "envios_campanha_data",
  "envios_campanha_contador",
  "falhas_seguidas",
  "bloqueado_ate",
  "proximo_envio_permitido_em",
  "aviso_queda_enviado_em",
  "motivo_queda_codigo",
  "motivo_queda_em",
  "sessao_caida_em",
  "queda_tratada_em",
  "aquecimento_desde",
];

const TABELA = "corretor_whatsapp_instancias";
const DIR_MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const MIGRATION_DA_REGRA = 175;

function instrucoesDasMigrations(): { numero: number; st: string }[] {
  return readdirSync(DIR_MIGRATIONS)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .flatMap((n) =>
      readFileSync(join(DIR_MIGRATIONS, n), "utf8")
        .replace(/--[^\n]*/g, "")
        .split(";")
        .map((st) => ({ numero: Number(n.slice(0, 4)), st: st.replace(/\s+/g, " ").trim() })),
    );
}

describe("o grant da sessão em corretor_whatsapp_instancias", () => {
  const instrucoes = instrucoesDasMigrations();
  const daTabela = new RegExp(`\\bon\\s+(?:table\\s+)?(?:public\\.)?${TABELA}\\b`, "i");

  const grantsDeColuna = instrucoes.filter(
    ({ st }) => /^grant\s+update\s*\(/i.test(st) && daTabela.test(st) && /\bto\b.*\bauthenticated\b/i.test(st),
  );

  it("a 0175 está no repositório e revoga o grant de tabela antes", () => {
    const revoga = instrucoes.some(
      ({ numero, st }) =>
        numero >= MIGRATION_DA_REGRA &&
        /^revoke\s+all\b/i.test(st) &&
        daTabela.test(st) &&
        /\bfrom\b.*\bauthenticated\b/i.test(st),
    );
    expect(revoga).toBe(true);
    expect(grantsDeColuna.length).toBeGreaterThan(0);
  });

  it("o último grant de coluna libera exatamente a configuração", () => {
    const ultimo = grantsDeColuna.at(-1)!.st;
    const colunas = /update\s*\(([^)]*)\)/i
      .exec(ultimo)![1]
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .sort();
    expect(colunas).toEqual([...CONFIGURACAO].sort());
  });

  it("nenhuma coluna de estado está na lista do que a sessão altera", () => {
    // Se esta falhar, alguém pôs uma coluna de estado na CONFIGURACAO para
    // passar no teste de cima. Estado do número é do servidor: grave pela
    // chave de serviço, depois de conferir a sessão.
    expect(CONFIGURACAO.filter((c) => ESTADO.includes(c))).toEqual([]);
  });

  it("depois da 0175, nenhuma migration devolve insert, update, delete ou tudo de tabela", () => {
    const devolve = instrucoes.filter(
      ({ numero, st }) =>
        numero >= MIGRATION_DA_REGRA &&
        /\b(all|insert|update|delete|truncate)\b(?!\s*\()/i.test(/^grant\s+(.*?)\s+on\s+/i.exec(st)?.[1] ?? "") &&
        daTabela.test(st) &&
        /\b(authenticated|anon|public)\b/i.test(st.split(/\bto\b/i)[1] ?? ""),
    );
    expect(devolve.map(({ numero, st }) => `${numero}: ${st}`)).toEqual([]);
  });
});

/*
 * O lado do código: gravação nesta tabela pelo cliente de SESSÃO só pode ser
 * `update` das colunas de configuração. Insert, upsert, delete e qualquer
 * coluna de estado vão pela chave de serviço. Com a 0175 no banco, uma
 * gravação de estado pela sessão é recusada pelo Postgres e, onde o retorno é
 * ignorado, ninguém fica sabendo.
 */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function arquivosDoCodigo(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosDoCodigo(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

type Escrita = { arquivo: string; linha: number; metodo: string; cliente: string; chaves: string[] };

/** Quem é o objeto antes de `.from(`: `createServiceClient()` direto ou uma variável. */
function clienteDaCadeia(codigo: string, posicaoDoFrom: number): string {
  const antes = codigo.slice(0, posicaoDoFrom).replace(/\s+$/, "");
  if (/createServiceClient\(\)$/.test(antes)) return "servico";
  const variavel = /([A-Za-z_$][\w$]*)$/.exec(antes)?.[1];
  if (!variavel) return "desconhecido";
  const declaracoes = [
    ...antes.matchAll(new RegExp(`(?:const|let)\\s+${variavel.replace("$", "\\$")}\\s*=\\s*([^;]+);`, "g")),
  ];
  const inicializador = declaracoes.at(-1)?.[1] ?? "";
  if (/createServiceClient\(/.test(inicializador)) return "servico";
  if (/\bcreateClient\(/.test(inicializador)) return "sessao";
  return "desconhecido";
}

/** Chaves de primeiro nível do objeto que começa em `ini` (o `{`). */
function chavesDoObjeto(texto: string, ini: number): string[] {
  const partes: string[] = [];
  let profundidade = 0;
  let atual = "";
  let aspas: string | null = null;
  for (let i = ini; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      atual += ch;
      if (ch === aspas && texto[i - 1] !== "\\") aspas = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      aspas = ch;
      atual += ch;
      continue;
    }
    if ("{[(".includes(ch)) {
      profundidade++;
      if (profundidade === 1) continue;
    }
    if ("}])".includes(ch)) {
      profundidade--;
      if (profundidade === 0) {
        partes.push(atual);
        break;
      }
    }
    if (ch === "," && profundidade === 1) {
      partes.push(atual);
      atual = "";
      continue;
    }
    atual += ch;
  }
  // Spread não deixa ver as chaves: vira "..." e, pela sessão, é recusado.
  return partes
    .map((p) => (/^\s*\.\.\./.test(p) ? "..." : (/^\s*([A-Za-z_$][\w$]*)\s*:?/.exec(p)?.[1] ?? "")))
    .filter(Boolean);
}

function escritasNaTabela(): Escrita[] {
  const escritas: Escrita[] = [];
  for (const arquivo of arquivosDoCodigo(join(process.cwd(), "src"))) {
    const codigo = semComentarios(readFileSync(arquivo, "utf8"));
    for (const m of codigo.matchAll(/\.from\(\s*["'`]corretor_whatsapp_instancias["'`]\s*\)/g)) {
      const fimDaCadeia = codigo.indexOf(";", m.index!);
      const cadeia = codigo.slice(m.index!, fimDaCadeia);
      const metodo = /\.(update|insert|upsert|delete)\(/.exec(cadeia);
      if (!metodo) continue;
      const iniObjeto = cadeia.indexOf("{", metodo.index);
      escritas.push({
        arquivo: arquivo.slice(process.cwd().length + 1),
        linha: codigo.slice(0, m.index!).split("\n").length,
        metodo: metodo[1],
        cliente: clienteDaCadeia(codigo, m.index!),
        chaves: iniObjeto >= 0 ? chavesDoObjeto(cadeia, iniObjeto) : [],
      });
    }
  }
  return escritas;
}

describe("as gravações do código em corretor_whatsapp_instancias", () => {
  const escritas = escritasNaTabela();

  it("acha as gravações (a guarda não está cega)", () => {
    // Pelo menos: a configuração pela sessão, o conectar e o desconectar
    // pela chave de serviço, e o estado gravado pelo webhook e pelos crons.
    expect(escritas.length).toBeGreaterThanOrEqual(10);
    expect(escritas.some((e) => e.cliente === "sessao")).toBe(true);
    expect(escritas.some((e) => e.cliente === "servico" && e.chaves.includes("conectado_em"))).toBe(true);
  });

  it("toda gravação tem o cliente identificado", () => {
    // Cliente recebido por parâmetro não dá para classificar lendo o arquivo:
    // declare a variável com createClient() ou createServiceClient() ali.
    expect(
      escritas.filter((e) => e.cliente === "desconhecido").map((e) => `${e.arquivo}:${e.linha}`),
    ).toEqual([]);
  });

  it("pela sessão, só update das colunas de configuração", () => {
    const fora = escritas
      .filter((e) => e.cliente === "sessao")
      .flatMap((e) => {
        if (e.metodo !== "update") return [`${e.arquivo}:${e.linha} usa ${e.metodo} pela sessão`];
        return e.chaves
          .filter((c) => !CONFIGURACAO.includes(c))
          .map((c) => `${e.arquivo}:${e.linha} grava ${c} pela sessão`);
      });
    expect(fora).toEqual([]);
  });
});
