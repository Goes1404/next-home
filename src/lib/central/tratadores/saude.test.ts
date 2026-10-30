import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "../bancoFalso";
import type { ContextoDoCentral } from "../executar";

vi.mock("server-only", () => ({}));
// `calcularLimiteDoDia` (o limite do disparador) lê pela chave de serviço por
// conta própria: aqui ela devolve o banco falso do teste em curso.
let clienteDoTeste: unknown = null;
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => clienteDoTeste }));

const { saudeDoNumero, CONSULTAS_SAUDE, ACOES_SAUDE } = await import("./saude");
const { calcularLimiteDoDia } = await import("@/lib/whatsapp/repositorio");
const { liberarPrimeiroContato } = await import("@/lib/whatsapp/primeiroContatoNoEnvio");
const { vagasDePrimeiroContato } = await import("@/lib/whatsapp/primeiroContato");
const { previsaoDeTermino } = await import("@/lib/whatsapp/listaDeTransmissao");
const { FERRAMENTAS } = await import("../ferramentas");

const G = "g1";
const corretor: ContextoDoCentral = { corretorId: "c1", grupoId: G, papel: "corretor", nome: "Carol", imobiliaria: "Next Home" };
const gestor: ContextoDoCentral = { ...corretor, corretorId: "g", papel: "gestor", nome: "Gil" };

// Sexta, 30/10/2026, meio-dia em São Paulo.
const AGORA = new Date("2026-10-30T15:00:00.000Z");

// `calcularLimiteDoDia` usa o relógio do processo: o mesmo instante do teste.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});
afterAll(() => vi.useRealTimers());

const instancia = (i: Linha): Linha => ({
  id: `inst-${String(i.corretor_id)}`,
  grupo_id: G,
  status_conexao: "conectado",
  conectado_em: "2026-09-01T10:00:00-03:00",
  aquecimento_desde: null,
  desconectado_em: null,
  bloqueado_ate: null,
  motivo_queda_codigo: null,
  sessao_caida_em: null,
  envios_campanha_data: "2026-10-30",
  envios_campanha_contador: 0,
  expediente_inicio: 9,
  expediente_fim: 21,
  ...i,
});

/**
 * O banco do teste, com o contador de primeiros contatos (0222) falso: o
 * `p_desde` de hoje devolve `hoje`; o de 7 dias atrás, `semana`. As tabelas
 * lidas ficam anotadas para provar que nenhuma conversa é lida.
 */
function banco(
  tabelas: Record<string, Linha[]>,
  primeiros: Record<string, { hoje: number; semana: number } | "erro"> = {},
) {
  const b = bancoFalso(tabelas);
  const lidas: string[] = [];
  const inicioDeHoje = new Date("2026-10-30T00:00:00-03:00").toISOString();
  const cliente = {
    from: (t: string) => {
      lidas.push(t);
      return (b.cliente as { from: (t: string) => unknown }).from(t);
    },
    rpc: async (nome: string, args: { p_corretor: string; p_desde: string }) => {
      const p = primeiros[args.p_corretor] ?? { hoje: 0, semana: 0 };
      if (nome !== "primeiros_contatos_do_corretor" || p === "erro") return { data: null, error: { message: "falhou" } };
      return { data: args.p_desde >= inicioDeHoje ? p.hoje : p.semana, error: null };
    },
  } as never;
  clienteDoTeste = cliente;
  return { ...b, cliente, lidas };
}

const consultar = async (ctx: ContextoDoCentral, b: ReturnType<typeof banco>) =>
  (await saudeDoNumero(ctx, b.cliente, AGORA)) as Record<string, unknown>;

describe("saude_do_numero: a conexão pela régua da tela", () => {
  it("conectado", async () => {
    const b = banco({ corretor_whatsapp_instancias: [instancia({ corretor_id: "c1" })] });
    const r = await consultar(corretor, b);
    expect(r).toMatchObject({ conexao: "conectado", conectadoDesde: "01/09 às 10h00" });
    expect(r).not.toHaveProperty("passo");
    expect(r).not.toHaveProperty("enquantoIsso");
    expect(b.escritas).toEqual([]);
  });

  it("conectando: o pareamento não terminou", async () => {
    const b = banco({ corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", status_conexao: "conectando" })] });
    const r = await consultar(corretor, b);
    expect(r).toMatchObject({ conexao: "conectando", passo: expect.stringContaining("/corretor/whatsapp") });
    expect(r.enquantoIsso).toEqual(expect.any(String));
  });

  it("caiu: quando (em SP), o motivo do WhatsApp e o passo", async () => {
    const b = banco({
      corretor_whatsapp_instancias: [
        instancia({
          corretor_id: "c1",
          status_conexao: "desconectado",
          desconectado_em: "2026-10-29T18:00:00-03:00",
          motivo_queda_codigo: 401,
        }),
      ],
    });
    const r = await consultar(corretor, b);
    expect(r).toMatchObject({
      conexao: "caiu",
      resumo: "Seu WhatsApp saiu do ar",
      caiuEm: "29/10 às 18h00",
      motivo: expect.stringContaining("desconectou este aparelho"),
      passo: expect.stringContaining("/corretor/whatsapp"),
      enquantoIsso: expect.any(String),
    });
    // Queda pela conta: o texto da faixa manda olhar o celular antes.
    expect(r.detalhe).toMatch(/aviso de restrição/);
  });

  it("parou de enviar: conectado no banco, sessão caída", async () => {
    const b = banco({
      corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", sessao_caida_em: "2026-10-30T09:00:00-03:00" })],
    });
    const r = await consultar(corretor, b);
    expect(r).toMatchObject({ conexao: "parou_de_enviar", resumo: "Seu WhatsApp parou de enviar" });
    expect(r.passo).toMatch(/Desconectar e conectar de novo/);
  });

  it("envios pausados pelo disjuntor: até quando, sem passo (volta sozinho)", async () => {
    const b = banco({
      corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", bloqueado_ate: "2026-10-30T21:00:00-03:00" })],
    });
    const r = await consultar(corretor, b);
    expect(r).toMatchObject({ conexao: "envios_pausados", enviosPausadosAte: "30/10 às 21h00" });
    expect(r).not.toHaveProperty("passo");
  });

  it("nunca conectou e sem número", async () => {
    const nunca = banco({
      corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", status_conexao: "desconectado", conectado_em: null })],
    });
    const r1 = await consultar(corretor, nunca);
    expect(r1).toMatchObject({ conexao: "nunca_conectou", passo: expect.stringContaining("/corretor/whatsapp") });
    // Sem conexão não há cota de lista, e o primeiro contato não tem início.
    expect(r1).not.toHaveProperty("listasHoje");
    expect(r1.primeiroContato).toMatchObject({ cabemHoje: 0 });

    const r2 = await consultar(corretor, banco({}));
    expect(r2).toMatchObject({ conexao: "sem_numero", passo: expect.stringContaining("/corretor/whatsapp") });
  });
});

describe("saude_do_numero: o limite é o do disparador", () => {
  const historico = [
    { instancia_id: "inst-c1", dia: "2026-10-27", enviados: 12 },
    { instancia_id: "inst-c1", dia: "2026-10-28", enviados: 20 },
    { instancia_id: "inst-c1", dia: "2026-10-29", enviados: 8 },
    // De outro número: não conta.
    { instancia_id: "inst-c9", dia: "2026-10-29", enviados: 90 },
  ];

  it("cota das listas: mesma entrada → o mesmo número de calcularLimiteDoDia", async () => {
    const b = banco({
      corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", envios_campanha_contador: 7 })],
      whatsapp_envios_por_dia: historico,
    });
    const r = await consultar(corretor, b);
    const doDisparador = await calcularLimiteDoDia("inst-c1", new Date("2026-09-01T10:00:00-03:00"));
    // Maior dia recente 20 → 30 pelo uso (número com mais de 30 dias).
    expect(doDisparador.limite).toBe(30);
    expect(r.listasHoje).toMatchObject({ enviadas: 7, limite: doDisparador.limite, cabem: doDisparador.limite - 7 });
  });

  it("o contador do dia anterior não conta hoje", async () => {
    const b = banco({
      corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", envios_campanha_data: "2026-10-29", envios_campanha_contador: 14 })],
    });
    expect((await consultar(corretor, b)).listasHoje).toMatchObject({ enviadas: 0, limite: 15, cabem: 15 });
  });

  it("primeiro contato: as vagas do disparador, e cabe ⇔ liberarPrimeiroContato libera", async () => {
    for (const feitos of [
      { hoje: 0, semana: 0 },
      { hoje: 4, semana: 12 },
      { hoje: 2, semana: 29 },
      { hoje: 10, semana: 15 },
    ]) {
      const b = banco({ corretor_whatsapp_instancias: [instancia({ corretor_id: "c1" })] }, { c1: feitos });
      const r = await consultar(corretor, b);
      const esperado = vagasDePrimeiroContato({ diasDesdeInicio: 59, enviadosHoje: feitos.hoje, enviadosNaSemana: feitos.semana });
      expect(r.primeiroContato).toMatchObject({ hoje: feitos.hoje, semana: feitos.semana, cabemHoje: esperado });
      const liberado = await liberarPrimeiroContato(b.cliente, "c1", AGORA);
      expect(liberado.pode).toBe(esperado > 0);
    }
  });

  it("nos 7 dias depois da volta de uma queda, nenhum, e diz quando volta", async () => {
    const b = banco(
      { corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", aquecimento_desde: "2026-10-27T10:00:00-03:00" })] },
      { c1: { hoje: 0, semana: 0 } },
    );
    const r = await consultar(corretor, b);
    expect(r.primeiroContato).toMatchObject({ cabemHoje: 0, voltaEm: "03/11 às 10h00", porque: expect.stringContaining("7 dias") });
    expect((await liberarPrimeiroContato(b.cliente, "c1", AGORA)).pode).toBe(false);
  });

  it("contagem que falha vale zero, como no envio", async () => {
    const b = banco({ corretor_whatsapp_instancias: [instancia({ corretor_id: "c1" })] }, { c1: "erro" });
    const r = await consultar(corretor, b);
    expect(r.primeiroContato).toMatchObject({ cabemHoje: 0, porque: expect.stringContaining("nenhum sai") });
  });

  it("cota da lista menor que as vagas de primeiro contato: avisa", async () => {
    const b = banco(
      { corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", envios_campanha_contador: 12 })] },
      { c1: { hoje: 0, semana: 0 } },
    );
    const r = await consultar(corretor, b);
    // Limite 15 (piso), 12 já saíram: sobram 3, menos que as 10 vagas.
    expect(r.primeiroContato).toMatchObject({ cabemHoje: 10, pelaLista: expect.stringContaining("só 3") });
  });

  it("os níveis por resultado não existem: diz o limite atual, sem prometer subida", async () => {
    const b = banco({ corretor_whatsapp_instancias: [instancia({ corretor_id: "c1" })] });
    expect((await consultar(corretor, b)).niveis).toMatch(/Ainda não há níveis.*10 por dia e 30 por semana/);
  });
});

describe("saude_do_numero: a lista em andamento", () => {
  const fila = (n: number, campanha: string, extra: Linha = {}): Linha[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${campanha}-${i}`, grupo_id: G, campanha_id: campanha, status: "pendente", erro_motivo: null, ...extra }));

  it("quantos saem hoje e quantos ficam para amanhã, pela conta da tela de listas", async () => {
    const b = banco({
      corretor_whatsapp_instancias: [instancia({ corretor_id: "c1" })],
      whatsapp_campanhas: [
        { id: "l1", grupo_id: G, corretor_id: "c1", status: "em_andamento" },
        { id: "l2", grupo_id: G, corretor_id: "c1", status: "concluida" },
        { id: "l9", grupo_id: "outro", corretor_id: "c1", status: "em_andamento" },
      ],
      whatsapp_campanhas_fila: [...fila(40, "l1"), ...fila(5, "l2"), ...fila(30, "l9", { grupo_id: "outro" })],
    });
    const r = await consultar(corretor, b);
    const esperado = previsaoDeTermino({ pendentes: 40, saldoHoje: 15, agora: AGORA, expediente: { inicioHora: 9, fimHora: 21 } });
    expect(esperado.continuaAmanha).toBe(25);
    expect(r.listaEmAndamento).toMatchObject({ pendentes: 40, saemHoje: 15, ficamParaAmanha: 25 });
    expect(b.escritas).toEqual([]);
  });

  it("número fora do ar: a lista toda espera", async () => {
    const b = banco({
      corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", sessao_caida_em: "2026-10-30T09:00:00-03:00" })],
      whatsapp_campanhas: [{ id: "l1", grupo_id: G, corretor_id: "c1", status: "em_andamento" }],
      whatsapp_campanhas_fila: fila(6, "l1"),
    });
    expect((await consultar(corretor, b)).listaEmAndamento).toMatchObject({ pendentes: 6, saemHoje: 0, ficamParaDepois: 6 });
  });
});

describe("saude_do_numero: o escopo vem da identificação", () => {
  const tabelas = () => ({
    corretor_whatsapp_instancias: [
      instancia({ corretor_id: "c1", status_conexao: "desconectado", desconectado_em: "2026-10-29T18:00:00-03:00" }),
      instancia({ corretor_id: "g" }),
    ],
  });

  it("o gestor vê só o número dele", async () => {
    const b = banco(tabelas(), { g: { hoje: 3, semana: 3 }, c1: { hoje: 9, semana: 9 } });
    const r = await consultar(gestor, b);
    expect(r).toMatchObject({ conexao: "conectado", primeiroContato: { hoje: 3 } });
    expect(JSON.stringify(r)).not.toMatch(/Carol|29\/10/);
  });

  it("outro grupo nunca: a instância do mesmo corretor noutra imobiliária não aparece", async () => {
    const b = banco({ corretor_whatsapp_instancias: [instancia({ corretor_id: "c1", grupo_id: "outro" })] });
    expect(await consultar(corretor, b)).toMatchObject({ conexao: "sem_numero" });
  });

  it("os argumentos da IA não mudam de quem é o número; nada é gravado e nenhuma conversa é lida", async () => {
    const b = banco(tabelas());
    const r = (await CONSULTAS_SAUDE.saude_do_numero(gestor, { corretor: "c1", corretorId: "c1" })) as Record<string, unknown>;
    expect(r.conexao).toBe("conectado");
    expect(b.escritas).toEqual([]);
    expect(b.lidas.filter((t) => /conversa|mensage/.test(t))).toEqual([]);
  });
});

describe("ligação", () => {
  it("saude_do_numero é consulta da onda 3, sem ação", () => {
    expect(Object.keys(CONSULTAS_SAUDE)).toEqual(["saude_do_numero"]);
    expect(ACOES_SAUDE).toEqual({});
    expect(FERRAMENTAS.find((f) => f.nome === "saude_do_numero")).toMatchObject({ tipo: "consulta", onda: 3 });
  });
});
