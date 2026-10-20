import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filtrarContasOcultas,
  filtroForaDasContasOcultas,
  idsDeContasOcultas,
  semContasOcultas,
} from "./contaOculta";

/*
 * Conta oculta (0189, 19/10/2026): a conta trabalha, mas NÃO aparece para
 * ninguém — site, roleta, sorteio do anúncio e telas da equipe. Só o gestor a
 * vê, na seção "Contas ocultas" da tela de Contas.
 *
 * A regressão que este arquivo existe para pegar é calada: alguém escreve uma
 * tela nova da equipe lendo `corretores` (ou as instâncias, ou as views de
 * métrica) pela sessão do gestor ou pela chave de serviço — e a RLS não
 * recorta nenhum dos dois. Build, tipos e tela passam; a conta reaparece.
 */

// ─── 1. O recorte, com cliente falso ───────────────────────────────────────

type Resposta = { data: unknown; error: { message: string } | null };

function clienteFalso(resposta: Resposta | (() => never)) {
  const pedidos: { tabela: string; colunas: string; filtros: [string, unknown][] }[] = [];
  const cliente = {
    from(tabela: string) {
      const pedido = { tabela, colunas: "", filtros: [] as [string, unknown][] };
      pedidos.push(pedido);
      const construtor = {
        select(colunas: string) {
          pedido.colunas = colunas;
          return construtor;
        },
        eq(coluna: string, valor: unknown) {
          pedido.filtros.push([coluna, valor]);
          if (typeof resposta === "function") resposta();
          return Promise.resolve(resposta);
        },
      };
      return construtor;
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, pedidos };
}

describe("idsDeContasOcultas", () => {
  it("pergunta a corretores pela marca e devolve os ids", async () => {
    const { cliente, pedidos } = clienteFalso({ data: [{ id: "a" }, { id: "b" }], error: null });
    const ocultas = await idsDeContasOcultas(cliente);
    expect([...ocultas].sort()).toEqual(["a", "b"]);
    expect(pedidos).toEqual([{ tabela: "corretores", colunas: "id", filtros: [["oculta", true]] }]);
  });

  it("sem a 0189 (coluna inexistente) ninguém é oculto — a tela não cai", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "column corretores.oculta does not exist" } });
    expect((await idsDeContasOcultas(cliente)).size).toBe(0);
  });

  it("exceção de rede também degrada para ninguém oculto", async () => {
    const { cliente } = clienteFalso(() => {
      throw new Error("fetch failed");
    });
    expect((await idsDeContasOcultas(cliente)).size).toBe(0);
  });
});

describe("semContasOcultas e filtrarContasOcultas", () => {
  const ocultas = new Set(["x"]);

  it("tira a linha do corretor oculto e mantém a ordem do resto", () => {
    const equipe = [{ id: "a" }, { id: "x" }, { id: "b" }];
    expect(semContasOcultas(equipe, ocultas)).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("filtra pela chave pedida e mantém o item sem corretor", () => {
    const eventos = [
      { ator_id: "x", n: 1 },
      { ator_id: null, n: 2 },
      { ator_id: "a", n: 3 },
    ];
    expect(semContasOcultas(eventos, ocultas, (e) => e.ator_id).map((e) => e.n)).toEqual([2, 3]);
  });

  it("sem conta oculta devolve uma cópia intacta", () => {
    const equipe = [{ id: "a" }];
    const r = semContasOcultas(equipe, new Set());
    expect(r).toEqual(equipe);
    expect(r).not.toBe(equipe);
  });

  it("o atalho busca a marca e filtra", async () => {
    const { cliente } = clienteFalso({ data: [{ id: "x" }], error: null });
    expect(await filtrarContasOcultas(cliente, [{ id: "x" }, { id: "a" }])).toEqual([{ id: "a" }]);
  });
});

describe("filtroForaDasContasOcultas (visão da equipe em leads)", () => {
  it("sem conta oculta não há filtro", () => {
    expect(filtroForaDasContasOcultas(new Set())).toBeNull();
  });

  it("mantém o lead SEM dono — not in sozinho daria nulo e o sumiria", () => {
    expect(filtroForaDasContasOcultas(new Set(["x", "y"]))).toBe(
      "corretor_id.is.null,corretor_id.not.in.(x,y)",
    );
  });
});

// ─── 2. O banco: migration e última definição das funções ──────────────────

const DIR = join(process.cwd(), "supabase", "migrations");
const arquivos = readdirSync(DIR).filter((n) => n.endsWith(".sql")).sort();
const migration = readFileSync(join(DIR, "0189_conta_oculta.sql"), "utf8");
const semComentarioSql = (s: string) => s.replace(/--.*$/gm, "");

// A última migration que já estava no ar antes da conta oculta. Toda migration
// de número maior pode rodar DEPOIS da 0189 em produção, ordene antes ou não.
const ULTIMA_ANTES_DA_CONTA_OCULTA = "0180";

function ultimaDefinicaoDe(nome: string): string {
  let ultima = "";
  for (const arquivo of arquivos) {
    const sql = readFileSync(join(DIR, arquivo), "utf8");
    // Ancorado em `create or replace`: o `grant execute on function public.x(`
    // que vem depois também contém o nome.
    const i = sql.toLowerCase().lastIndexOf(`create or replace function public.${nome}(`);
    if (i === -1) continue;
    const resto = sql.slice(i);
    const fim = resto.search(/\$(function)?\$\s*;/);
    ultima = fim === -1 ? resto : resto.slice(0, fim);
  }
  return semComentarioSql(ultima).toLowerCase();
}

describe("0189 no banco", () => {
  it("a marca nasce falsa e não nula: nada muda até alguém marcar", () => {
    expect(migration).toMatch(/add column if not exists oculta boolean not null default false/);
  });

  it("a sessão não marca sozinha: sem grant de update da coluna", () => {
    expect(semComentarioSql(migration)).not.toMatch(/grant\s+update[^;]*oculta/i);
  });

  it("anon e corretor comum não leem a linha oculta; a própria pessoa e o gestor leem", () => {
    const sql = semComentarioSql(migration);
    expect(sql).toMatch(/drop policy if exists "corretores sao publicos" on public\.corretores/);
    expect(sql).toMatch(/for select to anon\s+using \(not oculta\)/);
    const logado = sql.slice(sql.indexOf('"corretores visiveis ao logado"'));
    expect(logado).toMatch(/not oculta/);
    expect(logado).toMatch(/user_id = \(select auth\.uid\(\)\)/);
    expect(logado).toMatch(/\(select public\.eh_gestor\(\)\)/);
  });

  it("nenhuma migration posterior à 0180 devolve o `using (true)` à leitura de corretores", () => {
    // Posterior à 0180, não à 0189: migration de outra branch nascida com
    // número entre 0181 e 0188 ordena antes da 0189 e roda DEPOIS dela em
    // produção (ver o bloco da ordem de aplicação, abaixo).
    for (const arquivo of arquivos.filter((a) => a.slice(0, 4) > ULTIMA_ANTES_DA_CONTA_OCULTA)) {
      const sql = semComentarioSql(readFileSync(join(DIR, arquivo), "utf8")).toLowerCase();
      expect(sql, arquivo).not.toMatch(/create policy "corretores sao publicos"/);
      for (const policy of sql.match(/create policy "[^"]*"\s+on public\.corretores[^;]*;/g) ?? []) {
        if (/for (select|all)/.test(policy)) expect(policy, `${arquivo}: ${policy}`).toMatch(/not oculta/);
      }
    }
  });

  it("a roleta deixa a conta oculta de FORA (exceção declarada à régua da 0093)", () => {
    const corpo = ultimaDefinicaoDe("distribuir_lead");
    const daRoleta = corpo.indexOf("from corretores c");
    const where = corpo.slice(corpo.indexOf(" where ", daRoleta), corpo.indexOf("order by", daRoleta));
    expect(where, "a roleta voltou a entregar lead para conta oculta").toMatch(/and not c\.oculta/);
  });

  it("o sorteio do anúncio não manda clique para conta oculta", () => {
    expect(ultimaDefinicaoDe("sortear_corretor_whatsapp")).toMatch(/and not c\.oculta/);
  });

  it("o ranking de VGV não lista conta oculta (só para ela mesma)", () => {
    expect(ultimaDefinicaoDe("ranking_vgv")).toMatch(/\(not c\.oculta or c\.id = v_eu\)/);
  });
});

/*
 * A ÚLTIMA definição pela ordem dos ARQUIVOS não é a última APLICADA em
 * produção. A fase multi-grupo nasceu como 0181–0185, ordenando antes da 0189
 * mas rodando DEPOIS dela (a 0189 subiu primeiro, como correção). A então 0183
 * redefinia as três funções; vindo sem o recorte, `ultimaDefinicaoDe` leria a
 * 0189 e passaria, enquanto o banco ficaria com a versão da 0183 — conta
 * oculta de volta na roleta, no ranking e no sorteio, sem nada vermelho. Em
 * 20/10/2026 a fase 1 foi renumerada para 0190–0194 (a 0192 é a que redefine
 * as três, com o recorte), e o caso continua possível: a 0186/0187 da branch
 * `fase-2-plataforma` nasceu sobre a numeração antiga.
 *
 * Por isso a régua vale para TODA definição em migration posterior à 0180,
 * qualquer que seja a ordem em que ela rode: definição que lê `corretores`
 * traz `not oculta`. O invólucro que só repassa para outra sobrecarga (o de
 * dois argumentos da 0192) não lê `corretores` e não é cobrado.
 */
const FUNCOES_QUE_LISTAM_CORRETORES = ["distribuir_lead", "ranking_vgv", "sortear_corretor_whatsapp"];

function todasAsDefinicoes(sql: string, nome: string): string[] {
  const minusculo = semComentarioSql(sql).toLowerCase();
  const ancora = `create or replace function public.${nome}(`;
  const saida: string[] = [];
  let i = minusculo.indexOf(ancora);
  while (i !== -1) {
    const resto = minusculo.slice(i);
    const fim = resto.search(/\$(function)?\$\s*;/);
    saida.push(fim === -1 ? resto : resto.slice(0, fim));
    i = minusculo.indexOf(ancora, i + ancora.length);
  }
  return saida;
}

function definicoesSemRecorte(migrations: { arquivo: string; sql: string }[]): string[] {
  const falhas: string[] = [];
  for (const { arquivo, sql } of migrations) {
    if (arquivo.slice(0, 4) <= ULTIMA_ANTES_DA_CONTA_OCULTA) continue;
    for (const nome of FUNCOES_QUE_LISTAM_CORRETORES) {
      todasAsDefinicoes(sql, nome).forEach((corpo, n) => {
        if (/\b(public\.)?corretores\b/.test(corpo) && !/not\s+(\w+\.)?oculta\b/.test(corpo)) {
          falhas.push(`${arquivo}: ${nome} (definição ${n + 1})`);
        }
      });
    }
  }
  return falhas;
}

const SORTEIO_SEM_RECORTE =
  "create or replace function public.sortear_corretor_whatsapp(p_grupo uuid) returns table(x uuid) " +
  "language sql as $function$ select c.id from public.corretores c where c.ativo $function$;";

describe("toda redefinição posterior à 0180 carrega o recorte (ordem de aplicação ≠ ordem dos arquivos)", () => {
  it("nas migrations do repositório, nenhuma definição lê corretores sem `not oculta`", () => {
    const todas = arquivos.map((arquivo) => ({ arquivo, sql: readFileSync(join(DIR, arquivo), "utf8") }));
    expect(definicoesSemRecorte(todas)).toEqual([]);
  });

  it("reprova a definição que ordena ANTES da 0189 (o caso da antiga 0183 da fase multi-grupo)", () => {
    expect(definicoesSemRecorte([{ arquivo: "0186_de_outra_branch.sql", sql: SORTEIO_SEM_RECORTE }])).toEqual([
      "0186_de_outra_branch.sql: sortear_corretor_whatsapp (definição 1)",
    ]);
  });

  it("cobra cada sobrecarga do mesmo arquivo, não só a última", () => {
    const comRecorte = SORTEIO_SEM_RECORTE.replace("where c.ativo", "where c.ativo and not c.oculta");
    expect(
      definicoesSemRecorte([{ arquivo: "0190_x.sql", sql: SORTEIO_SEM_RECORTE + "\n" + comRecorte }]),
    ).toEqual(["0190_x.sql: sortear_corretor_whatsapp (definição 1)"]);
  });

  it("não cobra o histórico até a 0180 nem o invólucro que só repassa", () => {
    expect(definicoesSemRecorte([{ arquivo: "0130_antiga.sql", sql: SORTEIO_SEM_RECORTE }])).toEqual([]);
    const involucro =
      "create or replace function public.sortear_corretor_whatsapp(p_empreendimento uuid) returns table(x uuid) " +
      "language plpgsql as $function$ begin return query select s.x " +
      "from public.sortear_corretor_whatsapp('1'::uuid, p_empreendimento) s; end; $function$;";
    expect(definicoesSemRecorte([{ arquivo: "0192_x.sql", sql: involucro }])).toEqual([]);
  });

  it("a coluna nasce antes da primeira migration que a cita (instalação nova, em ordem de arquivo)", () => {
    // Função `language sql` tem o corpo conferido na criação: numa instalação
    // nova (replay na ordem dos arquivos), uma migration de número menor que a
    // 0189 citando `c.oculta` antes de a 0189 criar a coluna quebra. Quem citar antes da 0189 cria a coluna
    // antes (`add column if not exists oculta ...`, idempotente com a 0189).
    for (const arquivo of arquivos) {
      const sql = semComentarioSql(readFileSync(join(DIR, arquivo), "utf8")).toLowerCase();
      const citacao = sql.search(/\boculta\b/);
      if (citacao === -1) continue;
      const add = sql.search(/add column if not exists oculta\b/);
      expect(add, `${arquivo} é a primeira a citar oculta e não cria a coluna`).not.toBe(-1);
      expect(add, `${arquivo} cita oculta antes do add column`).toBeLessThanOrEqual(citacao);
      break;
    }
  });
});

// ─── 3. O código: toda tela da equipe passa pelo recorte ───────────────────

const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function arquivosDe(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosDe(caminho));
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome)) saida.push(caminho);
  }
  return saida;
}

const PAINEL = join(process.cwd(), "src", "app", "corretor", "(painel)");
const ESCOPO = [
  // Telas da equipe.
  ...arquivosDe(join(PAINEL, "admin")),
  ...arquivosDe(join(PAINEL, "financeiro")),
  ...arquivosDe(join(PAINEL, "_componentes")),
  ...arquivosDe(join(PAINEL, "marketing")),
  ...arquivosDe(join(PAINEL, "anotacoes")),
  ...arquivosDe(join(PAINEL, "leads")),
  ...arquivosDe(join(process.cwd(), "src", "lib", "admin")),
  ...arquivosDe(join(process.cwd(), "src", "lib", "financeiro")),
  // Lista pública e distribuição de lead.
  join(process.cwd(), "src", "lib", "catalogo", "cache.ts"),
  join(process.cwd(), "src", "lib", "inbound", "processarEmail.ts"),
];

/** O que é LER A EQUIPE: corretores, os números deles, as métricas por corretor. */
const LEITURA_DA_EQUIPE =
  /from\("corretores"\)|corretor_whatsapp_instancias|whatsapp_funil_metricas|whatsapp_resposta_metricas|rpc\("ranking_vgv"/;

/**
 * Exceções DECLARADAS, cada uma com o motivo. Chave = caminho relativo com
 * barra normal. Ler `corretores` por ID de uma conta já escolhida, ou agir
 * sobre o próprio número, não lista equipe nenhuma.
 */
const EXCECOES: Record<string, string> = {
  "src/app/corretor/(painel)/marketing/impulsionamentos/roletaAcoes.ts":
    "confere se os ids escolhidos na tela são corretores ativos do grupo; a lista mostrada já veio sem conta oculta",
  "src/app/corretor/(painel)/admin/acoes.ts":
    "ações sobre UMA conta pelo id (criar acesso, papel, ativar, ocultar, passar carteira); o lote de acessos precisa incluir a conta oculta",
  "src/app/corretor/(painel)/admin/whatsapp/acoes.ts": "desconectar o número de um corretor já escolhido",
  "src/app/corretor/(painel)/_componentes/acoesMensagemPelaIA.ts": "a instância do PRÓPRIO corretor logado",
  "src/app/corretor/(painel)/anotacoes/page.tsx":
    "nomes de autor/destinatário das notas que a pessoa já tem; a lista para direcionar vem de getEquipeAtiva",
  "src/app/corretor/(painel)/leads/page.tsx":
    "nome da carteira pedida pelo id na URL; a lista de equipe vem de getEquipeAtiva",
  "src/lib/financeiro/dados.ts":
    "nomes dos participantes de vendas por id; o ranking_vgv é recortado no SQL (0189)",
  "src/lib/admin/numerosDaEquipe.ts":
    "fonte da leitura recortada por grupo: lê os ids do grupo só para recortar as views; quem lista a equipe tira a conta oculta depois (idsDeContasOcultas aceita a leitura)",
};

const relativo = (caminho: string) => caminho.slice(process.cwd().length + 1).replace(/\\/g, "/");

describe("toda leitura da equipe passa pelo recorte da conta oculta", () => {
  it("o escopo existe e acha leituras (guarda que não acha nada aprova tudo)", () => {
    const comLeitura = ESCOPO.filter((f) => LEITURA_DA_EQUIPE.test(semComentario(readFileSync(f, "utf8"))));
    expect(comLeitura.length).toBeGreaterThanOrEqual(8);
  });

  it.each(ESCOPO.map((f) => [relativo(f), f]))("%s", (rel, caminho) => {
    const fonte = semComentario(readFileSync(caminho, "utf8"));
    if (!LEITURA_DA_EQUIPE.test(fonte)) return;
    if (EXCECOES[rel]) return;
    expect(
      fonte.includes("@/lib/corretores/contaOculta"),
      `${rel} lê a equipe sem o recorte da conta oculta. Use idsDeContasOcultas/semContasOcultas ` +
        `(src/lib/corretores/contaOculta.ts) ou declare a exceção, com motivo, em contaOculta.test.ts.`,
    ).toBe(true);
  });

  it("as exceções declaradas existem (lista morta não vale)", () => {
    for (const rel of Object.keys(EXCECOES)) {
      expect(() => statSync(join(process.cwd(), rel)), rel).not.toThrow();
    }
  });

  it("getEquipeAtiva — a lista dos seletores e da reatribuição — já sai recortada", () => {
    const fonte = semComentario(readFileSync(join(process.cwd(), "src", "lib", "corretorSessao.ts"), "utf8"));
    const corpo = fonte.slice(
      fonte.indexOf("export async function getEquipeAtiva"),
      fonte.indexOf("export async function getMeusTemplates"),
    );
    expect(corpo).toMatch(/filtrarContasOcultas\(/);
  });

  it("a visão da equipe em leads tira os leads da conta oculta", () => {
    const fonte = semComentario(readFileSync(join(process.cwd(), "src", "lib", "corretorSessao.ts"), "utf8"));
    const recortes = fonte.match(/if \(dono\) query = query\.eq\("corretor_id", dono\);/g) ?? [];
    const ramos = fonte.match(/else if \(foraDasOcultas\) query = query\.or\(foraDasOcultas\);/g) ?? [];
    expect(recortes.length).toBeGreaterThan(0);
    expect(ramos.length).toBe(recortes.length);
  });
});

// ─── 4. A tela de Contas ───────────────────────────────────────────────────

describe("Contas: só o gestor vê a conta oculta, recolhida", () => {
  const contas = readFileSync(join(PAINEL, "admin", "contas", "ContasManager.tsx"), "utf8");
  const pagina = readFileSync(join(PAINEL, "admin", "contas", "page.tsx"), "utf8");
  const acoes = semComentario(readFileSync(join(PAINEL, "admin", "acoes.ts"), "utf8"));

  it("a página é de gestor", () => {
    expect(pagina).toMatch(/await exigirGestorNaPagina\(\)/);
  });

  it("a lista principal tira as ocultas e elas moram num <details> próprio", () => {
    expect(contas).toMatch(/const visiveis = corretores\.filter\(\(c\) => !c\.oculta\)/);
    expect(contas).toMatch(/<details[\s\S]*Contas ocultas/);
  });

  it("marcar e desmarcar passa pela guarda de gestor e pela chave de serviço", () => {
    const corpo = acoes.slice(acoes.indexOf("export async function alternarContaOculta"));
    const ate = corpo.indexOf("export async function", 10);
    const funcao = ate === -1 ? corpo : corpo.slice(0, ate);
    expect(funcao).toMatch(/await exigirGestorNaAcao\(\)/);
    expect(funcao).toMatch(/createServiceClient\(\)/);
    expect(funcao.indexOf("exigirGestorNaAcao")).toBeLessThan(funcao.indexOf("createServiceClient"));
    expect(funcao).toMatch(/revalidarCorretores\(\)/);
  });
});
