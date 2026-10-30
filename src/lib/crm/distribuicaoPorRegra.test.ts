import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { funcoesDasMigrations, semComentarios } from "@/lib/grupos/funcoesSeguras";
import {
  candidatosDaRegra,
  canalDoLead,
  decidirDistribuicao,
  descreverRegra,
  normalizarRotulo,
  ordenarRegras,
  regraCasaComOLead,
  validarRegra,
  type FatosDoLead,
  type RegraDeDistribuicao,
} from "./regrasDeDistribuicao";

/**
 * Distribuição de leads por regra (0246, 29/10/2026).
 *
 * Duas metades. A pura: a ordem das regras, o que casa com o quê e a volta à
 * roleta. A do SQL: o gatilho que decide de verdade tem de (1) olhar as
 * regras ANTES da escolha de sempre e (2) manter a escolha de sempre LETRA
 * POR LETRA a da 0216 — "sem regra, nada muda" é a promessa ao gestor que
 * nunca criou regra nenhuma, e a regressão seria calada (o lead continua
 * nascendo com dono, só que outro).
 */

const regra = (r: Partial<RegraDeDistribuicao> & Pick<RegraDeDistribuicao, "id" | "criterio">): RegraDeDistribuicao => ({
  ordem: 0,
  ativa: true,
  nome: r.id,
  regioes: [],
  valorMin: null,
  valorMax: null,
  origens: [],
  maxLeadsParados: null,
  corretores: [],
  ...r,
});

const lead = (f: Partial<FatosDoLead> = {}): FatosDoLead => ({
  bairro: null,
  cidade: null,
  regiao: null,
  valor: null,
  canal: "outro",
  ...f,
});

describe("o que casa com o quê", () => {
  it("região: bairro e cidade exatos, região livre por trecho, sem acento nem caixa", () => {
    const r = regra({ id: "r", criterio: "regiao", regioes: ["Alphaville", "São Paulo"] });
    expect(regraCasaComOLead(r, lead({ bairro: "ALPHAVILLE" }))).toBe(true);
    expect(regraCasaComOLead(r, lead({ cidade: "sao paulo" }))).toBe(true);
    expect(regraCasaComOLead(r, lead({ regiao: "perto de Alphaville, Barueri" }))).toBe(true);
    expect(regraCasaComOLead(r, lead({ bairro: "Alphaville Conde" }))).toBe(false);
    expect(regraCasaComOLead(r, lead({ cidade: "Barueri" }))).toBe(false);
    expect(regraCasaComOLead(r, lead())).toBe(false);
  });

  it("faixa de valor: aberta num lado, fechada nos dois; lead sem valor não casa", () => {
    const desde = regra({ id: "d", criterio: "faixa_valor", valorMin: 500_000 });
    const ate = regra({ id: "a", criterio: "faixa_valor", valorMax: 300_000 });
    const entre = regra({ id: "e", criterio: "faixa_valor", valorMin: 300_000, valorMax: 500_000 });
    expect(regraCasaComOLead(desde, lead({ valor: 500_000 }))).toBe(true);
    expect(regraCasaComOLead(desde, lead({ valor: 499_999 }))).toBe(false);
    expect(regraCasaComOLead(ate, lead({ valor: 300_000 }))).toBe(true);
    expect(regraCasaComOLead(entre, lead({ valor: 400_000 }))).toBe(true);
    expect(regraCasaComOLead(entre, lead({ valor: 600_000 }))).toBe(false);
    expect(regraCasaComOLead(desde, lead({ valor: null }))).toBe(false);
  });

  it("origem pelo canal do lead", () => {
    const r = regra({ id: "o", criterio: "origem", origens: ["portal", "anuncio"] });
    expect(regraCasaComOLead(r, lead({ canal: "portal" }))).toBe(true);
    expect(regraCasaComOLead(r, lead({ canal: "anuncio" }))).toBe(true);
    expect(regraCasaComOLead(r, lead({ canal: "site" }))).toBe(false);
  });

  it("desempenho casa com todo lead (é a roleta com um filtro)", () => {
    expect(regraCasaComOLead(regra({ id: "p", criterio: "desempenho", maxLeadsParados: 3 }), lead())).toBe(true);
  });

  it("o canal: portal vence anúncio, que vence site", () => {
    const vazio = { origem: null, portalOrigem: null, anuncioOrigem: null, metaLeadId: null };
    expect(canalDoLead({ ...vazio, origem: "inbound/zap", portalOrigem: "zap", anuncioOrigem: "Cod 12" })).toBe("portal");
    expect(canalDoLead({ ...vazio, origem: "meta/leadads", anuncioOrigem: "Anúncio", metaLeadId: "1" })).toBe("anuncio");
    expect(canalDoLead({ ...vazio, origem: "site/contato" })).toBe("site");
    expect(canalDoLead({ ...vazio, origem: "site/contato", anuncioOrigem: "Impulsionado" })).toBe("anuncio");
    expect(canalDoLead({ ...vazio, origem: "importacao" })).toBe("outro");
    expect(canalDoLead(vazio)).toBe("outro");
  });

  it("normaliza como o translate do banco", () => {
    expect(normalizarRotulo("  Jardim Esperança ")).toBe("jardim esperanca");
    expect(normalizarRotulo("   ")).toBeNull();
    expect(normalizarRotulo(null)).toBeNull();
  });
});

describe("a ordem e a volta à roleta", () => {
  const regiao = regra({ id: "regiao", ordem: 1, criterio: "regiao", regioes: ["Alphaville"], corretores: ["ana"] });
  const valor = regra({ id: "valor", ordem: 2, criterio: "faixa_valor", valorMin: 1_000_000, corretores: ["bruno"] });
  const origem = regra({ id: "origem", ordem: 3, criterio: "origem", origens: ["portal"], corretores: ["caio"] });
  const todos = (r: RegraDeDistribuicao) => r.corretores[0] ?? null;

  it("sem regra nenhuma, a roleta de sempre", () => {
    expect(decidirDistribuicao([], lead({ bairro: "Alphaville" }), todos)).toEqual({ pela: "roleta" });
  });

  it("a primeira que casa decide, na ordem do gestor (não na da lista)", () => {
    const l = lead({ bairro: "Alphaville", valor: 2_000_000, canal: "portal" });
    expect(decidirDistribuicao([origem, valor, regiao], l, todos)).toEqual({ pela: "regra", regraId: "regiao", corretorId: "ana" });
    expect(decidirDistribuicao([origem, valor], l, todos)).toEqual({ pela: "regra", regraId: "valor", corretorId: "bruno" });
  });

  it("regra desligada não conta", () => {
    const l = lead({ bairro: "Alphaville", canal: "portal" });
    expect(decidirDistribuicao([{ ...regiao, ativa: false }, origem], l, todos)).toEqual({
      pela: "regra",
      regraId: "origem",
      corretorId: "caio",
    });
  });

  it("regra que casa sem ninguém disponível passa a vez à seguinte", () => {
    const l = lead({ bairro: "Alphaville", canal: "portal" });
    const semAna = (r: RegraDeDistribuicao) => (r.id === "regiao" ? null : todos(r));
    expect(decidirDistribuicao([regiao, origem], l, semAna)).toEqual({ pela: "regra", regraId: "origem", corretorId: "caio" });
  });

  it("nada casa, ou ninguém disponível em nenhuma: roleta", () => {
    expect(decidirDistribuicao([regiao, valor, origem], lead({ canal: "site" }), todos)).toEqual({ pela: "roleta" });
    expect(decidirDistribuicao([regiao], lead({ bairro: "Alphaville" }), () => null)).toEqual({ pela: "roleta" });
  });

  it("empate de ordem: a mais antiga primeiro", () => {
    const a = regra({ id: "b-nova", criterio: "desempenho", maxLeadsParados: 1, criadaEm: "2026-10-29T12:00:00Z" });
    const b = regra({ id: "a-velha", criterio: "desempenho", maxLeadsParados: 1, criadaEm: "2026-10-01T12:00:00Z" });
    expect(ordenarRegras([a, b]).map((r) => r.id)).toEqual(["a-velha", "b-nova"]);
  });

  it("desempenho: a equipe menos quem tem leads parados demais", () => {
    const r = regra({ id: "p", criterio: "desempenho", maxLeadsParados: 3 });
    const equipe = [
      { id: "ana", leadsParados: 0 },
      { id: "bruno", leadsParados: 3 },
      { id: "caio", leadsParados: 2 },
    ];
    expect(candidatosDaRegra(r, equipe)).toEqual(["ana", "caio"]);
    expect(candidatosDaRegra(regiao, equipe)).toEqual(["ana"]);
  });
});

describe("o que o gestor escreve", () => {
  const equipe = new Set(["ana", "bruno"]);

  it("região: separa por vírgula e tira repetidas; id de fora da equipe some", () => {
    const r = validarRegra({ nome: " Alpha ", criterio: "regiao", regioes: "Alphaville, Tamboré;Alphaville", corretores: ["ana", "intruso"] }, equipe);
    expect(r).toEqual({
      regra: expect.objectContaining({ nome: "Alpha", regioes: ["Alphaville", "Tamboré"], corretores: ["ana"] }),
    });
  });

  it("sem ninguém para receber, recusa (menos desempenho)", () => {
    expect(validarRegra({ nome: "x", criterio: "regiao", regioes: "a", corretores: ["intruso"] }, equipe)).toEqual({
      erro: expect.stringContaining("quem recebe"),
    });
    expect(validarRegra({ nome: "x", criterio: "desempenho", maxLeadsParados: "5" }, equipe)).toEqual({
      regra: expect.objectContaining({ maxLeadsParados: 5, corretores: [] }),
    });
  });

  it("faixa: número brasileiro, mínimo menor que máximo, ao menos um lado", () => {
    expect(validarRegra({ nome: "x", criterio: "faixa_valor", valorMin: "1.000.000", corretores: ["ana"] }, equipe)).toEqual({
      regra: expect.objectContaining({ valorMin: 1_000_000, valorMax: null }),
    });
    expect(validarRegra({ nome: "x", criterio: "faixa_valor", valorMin: "9", valorMax: "1", corretores: ["ana"] }, equipe)).toHaveProperty("erro");
    expect(validarRegra({ nome: "x", criterio: "faixa_valor", corretores: ["ana"] }, equipe)).toHaveProperty("erro");
    expect(validarRegra({ nome: "x", criterio: "faixa_valor", valorMin: "abc", corretores: ["ana"] }, equipe)).toHaveProperty("erro");
  });

  it("origem: só os canais conhecidos", () => {
    expect(validarRegra({ nome: "x", criterio: "origem", origens: ["portal", "tv"], corretores: ["bruno"] }, equipe)).toEqual({
      regra: expect.objectContaining({ origens: ["portal"] }),
    });
    expect(validarRegra({ nome: "x", criterio: "origem", origens: ["tv"], corretores: ["bruno"] }, equipe)).toHaveProperty("erro");
  });

  it("desempenho: teto inteiro de 1 a 500", () => {
    for (const ruim of ["0", "501", "2.5", "", null]) {
      expect(validarRegra({ nome: "x", criterio: "desempenho", maxLeadsParados: ruim }, equipe)).toHaveProperty("erro");
    }
  });

  it("nome e critério obrigatórios", () => {
    expect(validarRegra({ nome: "  ", criterio: "regiao" }, equipe)).toHaveProperty("erro");
    expect(validarRegra({ nome: "x", criterio: "sorteio" }, equipe)).toHaveProperty("erro");
  });

  it("a frase da regra cita quem recebe", () => {
    const nomes = new Map([["ana", "Ana"]]);
    expect(descreverRegra(regra({ id: "r", criterio: "regiao", regioes: ["Alphaville"], corretores: ["ana"] }), nomes)).toBe(
      "Lead de Alphaville vai para Ana.",
    );
    expect(descreverRegra(regra({ id: "o", criterio: "origem", origens: ["portal"], corretores: ["ana"] }), nomes)).toContain("portal");
  });
});

// ── O SQL ────────────────────────────────────────────────────────────────

const DIR = join(process.cwd(), "supabase", "migrations");
const normalizar = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** O `select c.id into alvo ... limit 1` (a escolha da roleta) de um corpo. */
function escolhaDaRoleta(corpo: string): string {
  const texto = normalizar(semComentarios(corpo));
  const inicio = texto.indexOf("select c.id into alvo from corretores c");
  const fim = texto.indexOf(" limit 1", inicio);
  expect(inicio >= 0 && fim > inicio, "a escolha da roleta não foi achada").toBe(true);
  return texto.slice(inicio, fim);
}

describe("o gatilho da roleta com as regras", () => {
  const funcoes = funcoesDasMigrations();
  const roleta = funcoes.get("distribuir_lead()");
  const simulacao = funcoes.get("simular_distribuicao(uuid, text, text, text, numeric, text)");

  const da0216 = (() => {
    const arquivo = readdirSync(DIR).find((n) => n.startsWith("0216_"))!;
    const sql = readFileSync(join(DIR, arquivo), "utf8");
    const i = sql.indexOf("create or replace function public.distribuir_lead()");
    return sql.slice(i, sql.indexOf("$function$;", i));
  })();

  it("a função viva é a da 0246 (ou posterior) e consulta as regras", () => {
    expect(roleta).toBeTruthy();
    expect(Number(roleta!.arquivo.slice(0, 4))).toBeGreaterThanOrEqual(246);
    expect(roleta!.corpo).toContain("escolher_corretor_pela_regra(");
  });

  it("as regras vêm ANTES da escolha de sempre", () => {
    const corpo = normalizar(roleta!.corpo);
    expect(corpo.indexOf("escolher_corretor_pela_regra(")).toBeLessThan(corpo.indexOf("from corretores c"));
  });

  it("sem regra, a escolha é LETRA POR LETRA a da 0216", () => {
    expect(escolhaDaRoleta(roleta!.corpo)).toBe(escolhaDaRoleta(da0216));
  });

  it("a simulação usa a mesma escolha (só o grupo vem da sessão)", () => {
    expect(simulacao?.securityDefiner).toBe(true);
    expect(escolhaDaRoleta(simulacao!.corpo).replace(/\bv_grupo\b/g, "new.grupo_id")).toBe(escolhaDaRoleta(roleta!.corpo));
  });

  it("a simulação é só do gestor, no grupo dele", () => {
    const corpo = normalizar(simulacao!.corpo);
    expect(corpo).toContain("public.eh_gestor()");
    expect(corpo).toContain("public.grupo_atual()");
  });

  it("dentro da regra, os mesmos filtros e a mesma ordem da roleta", () => {
    const escolher = normalizar(semComentarios(funcoes.get("escolher_corretor_pela_regra(uuid, text, text, text, numeric, text)")!.corpo));
    const roletaTexto = escolhaDaRoleta(roleta!.corpo);
    const ordemDaRoleta = roletaTexto.slice(roletaTexto.indexOf(" order by "));
    expect(escolher).toContain(ordemDaRoleta.trim());
    for (const filtro of ["c.ativo", "c.grupo_id = p_grupo", "not c.em_pausa", "not c.oculta"]) {
      expect(escolher).toContain(filtro);
    }
  });

  it("o translate do banco e o do código tiram os mesmos acentos", () => {
    const sql = funcoes.get("normalizar_rotulo(text)")!.corpo;
    const codigo = readFileSync(join(process.cwd(), "src", "lib", "crm", "regrasDeDistribuicao.ts"), "utf8");
    const acentos = "áàâãäéèêëíìîïóòôõöúùûüç";
    expect(sql).toContain(`'${acentos}', 'aaaaaeeeeiiiiooooouuuuc'`);
    expect(codigo).toContain(`[${acentos}]`);
    // E o mapa do código leva cada um ao mesmo destino do translate.
    for (const [i, c] of [...acentos].entries()) {
      expect(normalizarRotulo(c)).toBe("aaaaaeeeeiiiiooooouuuuc"[i]);
    }
  });

  it("os canais do banco são os do código", () => {
    const sql = funcoes.get("canal_do_lead(text, text, text, text)")!.corpo;
    for (const canal of ["'portal'", "'anuncio'", "'site'", "'outro'", "'inbound/%'", "'meta/%'", "'site%'"]) {
      expect(sql).toContain(canal);
    }
  });
});

/*
 * A trava da roleta por grupo (0251, revisão de 30/10/2026): a roleta e a
 * redistribuição tomam `roleta_leads:<grupo>` em vez da trava global — e,
 * fora a linha da trava, são cópias exatas das definições anteriores.
 */
describe("a trava da roleta é por grupo (0251)", () => {
  const funcoes = funcoesDasMigrations();
  const ler = (prefixo: string) => {
    const arquivo = readdirSync(DIR).find((n) => n.startsWith(prefixo))!;
    return readFileSync(join(DIR, arquivo), "utf8");
  };
  const bloco = (sql: string, inicio: string, fim: string) => {
    const i = sql.indexOf(inicio);
    expect(i, inicio).toBeGreaterThanOrEqual(0);
    return sql.slice(i, sql.indexOf(fim, i) + fim.length);
  };
  const TRAVA_GLOBAL = "perform pg_advisory_xact_lock(hashtext('roleta_leads'));";

  it("as duas funções vivas são as da 0251, com a chave do grupo", () => {
    const roleta = funcoes.get("distribuir_lead()")!;
    const devolver = funcoes.get("devolver_leads_da_imobiliaria(uuid, uuid)")!;
    expect(roleta.arquivo.startsWith("0251_")).toBe(true);
    expect(devolver.arquivo.startsWith("0251_")).toBe(true);
    expect(roleta.corpo).toContain("pg_advisory_xact_lock(hashtext('roleta_leads:' || new.grupo_id::text))");
    expect(devolver.corpo).toContain("pg_advisory_xact_lock(hashtext('roleta_leads:' || v_grupo::text))");
    expect(roleta.corpo).not.toContain(TRAVA_GLOBAL);
    expect(devolver.corpo).not.toContain(TRAVA_GLOBAL);
  });

  it("fora a trava, distribuir_lead é byte a byte a da 0246", () => {
    const fim = "$function$;";
    const nova = bloco(ler("0251_"), "create or replace function public.distribuir_lead()", fim);
    const da0246 = bloco(ler("0246_"), "create or replace function public.distribuir_lead()", fim);
    expect(nova).toBe(
      da0246.replace(TRAVA_GLOBAL, "perform pg_advisory_xact_lock(hashtext('roleta_leads:' || new.grupo_id::text));"),
    );
  });

  it("fora a trava, devolver_leads_da_imobiliaria é byte a byte a da 0216", () => {
    const inicio = "create or replace function public.devolver_leads_da_imobiliaria(";
    const nova = bloco(ler("0251_"), inicio, "\n$$;");
    const da0216 = bloco(ler("0216_"), inicio, "\n$$;");
    // 30/10/2026: a 0251 também conserta o texto que a 0216 gravou com
    // acentuação quebrada ("saÃ\u00ADda"); fora isso e a trava, é a mesma função.
    const consertada = da0216
      .replace(TRAVA_GLOBAL, "perform pg_advisory_xact_lock(hashtext('roleta_leads:' || v_grupo::text));")
      .replace("Repasse na saÃ\u00ADda do corretor", "Repasse na saída do corretor")
      .replace("pela gestÃ£o, na saÃ\u00ADda dele", "pela gestão, na saída dele");
    expect(nova).toBe(consertada);
  });

  it("nenhuma outra função viva ainda toma a trava global (todas serializam pela mesma chave)", () => {
    const comGlobal = [...funcoes.values()].filter((f) => f.corpo.includes("hashtext('roleta_leads')")).map((f) => f.assinatura);
    expect(comGlobal).toEqual([]);
  });
});
