import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Webhook dos portais (29/10/2026, 0245): credencial, mapeamento do payload
 * do Grupo OLX, deduplicação pelo telefone DENTRO do grupo e a reentrega do
 * portal. Banco falso em memória que aplica os filtros: o grupo de outra
 * linha só some se a rota filtrar por ele.
 */

vi.mock("server-only", () => ({}));
const depois: (() => unknown)[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => unknown) => depois.push(fn),
}));
const avisarLeadsNovos = vi.fn(async () => 1);
vi.mock("@/lib/notificacoes/leadNovo", () => ({ avisarLeadsNovos }));
vi.mock("@/lib/corretores/contaOculta", () => ({
  filtrarContasOcultas: async <T,>(_s: unknown, lista: T[]) => lista,
}));

type Linha = Record<string, unknown>;
const banco: Record<string, Linha[]> = {};
let sequencia = 0;

function consulta(tabela: string) {
  const predicados: ((l: Linha) => boolean)[] = [];
  let operacao: "select" | "insert" | "update" | "upsert" = "select";
  let valores: Linha | Linha[] | null = null;
  let conflito: string[] = [];
  let modo: "lista" | "um" = "lista";
  const executar = () => {
    const linhas = (banco[tabela] ??= []);
    if (operacao === "insert" || operacao === "upsert") {
      const novas = ([] as Linha[]).concat(valores as Linha);
      const saida: Linha[] = [];
      for (const n of novas) {
        const existente =
          operacao === "upsert" && conflito.length
            ? linhas.find((l) => conflito.every((c) => l[c] === n[c] && n[c] != null))
            : undefined;
        if (existente) {
          Object.assign(existente, n);
          saida.push(existente);
        } else {
          const linha = { id: `${tabela}-${++sequencia}`, ...n };
          linhas.push(linha);
          saida.push(linha);
        }
      }
      return { data: modo === "um" ? saida[0] : saida, error: null };
    }
    const filtradas = linhas.filter((l) => predicados.every((p) => p(l)));
    if (operacao === "update") {
      for (const l of filtradas) Object.assign(l, valores);
      return { data: filtradas, error: null };
    }
    return { data: modo === "um" ? (filtradas[0] ?? null) : filtradas, error: null };
  };
  const q = {
    select: () => q,
    insert: (v: Linha | Linha[]) => ((operacao = "insert"), (valores = v), q),
    update: (v: Linha) => ((operacao = "update"), (valores = v), q),
    upsert: (v: Linha, o?: { onConflict?: string }) => (
      (operacao = "upsert"), (valores = v), (conflito = (o?.onConflict ?? "").split(",").filter(Boolean)), q
    ),
    eq: (c: string, v: unknown) => (predicados.push((l) => l[c] === v), q),
    is: (c: string, v: unknown) => (predicados.push((l) => (l[c] ?? null) === v), q),
    in: (c: string, vs: unknown[]) => (predicados.push((l) => vs.includes(l[c])), q),
    order: () => q,
    limit: () => q,
    maybeSingle: () => ((modo = "um"), Promise.resolve(executar())),
    single: () => ((modo = "um"), Promise.resolve(executar())),
    then: <T,>(r: (x: ReturnType<typeof executar>) => T) => Promise.resolve(executar()).then(r),
  };
  return q;
}
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (t: string) => consulta(t) }) }));

const { POST } = await import("./route");

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";
const TOKEN_A = "a".repeat(48);
const TOKEN_B = "b".repeat(48);

const LEAD_OLX = {
  leadOrigin: "Grupo OLX",
  originLeadId: "olx-1",
  originListingId: "87027856",
  clientListingId: "AP-12",
  name: "Ana Cliente",
  email: "ana@exemplo.com",
  ddd: "11",
  phone: "991234567",
  phoneNumber: "11991234567",
  message: "Quero visitar",
  temperature: "Alta",
  transactionType: "SELL",
  extraData: { leadType: "CONTACT_FORM" },
};

function chamar(portal: string, corpo: unknown, cabecalhos: Record<string, string> = {}, token: string | null = TOKEN_A) {
  const url = `https://astroimob.vercel.app/api/webhooks/portais/${portal}${token ? `?token=${token}` : ""}`;
  return POST(new Request(url, { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), headers: cabecalhos }), {
    params: Promise.resolve({ portal }),
  });
}

beforeEach(() => {
  for (const k of Object.keys(banco)) delete banco[k];
  depois.length = 0;
  avisarLeadsNovos.mockClear();
  delete process.env.GRUPO_OLX_SECRET_KEY;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  banco.integracoes_de_portais = [
    { id: "int-a", grupo_id: GRUPO_A, portal: "grupo_olx", token: TOKEN_A, ativo: true },
    { id: "int-b", grupo_id: GRUPO_B, portal: "grupo_olx", token: TOKEN_B, ativo: true },
    { id: "int-a-gen", grupo_id: GRUPO_A, portal: "generico", token: "c".repeat(48), ativo: true },
  ];
  banco.empreendimentos = [
    { id: "imovel-a", grupo_id: GRUPO_A, nome: "Parque A", slug: "parque-a", codigo_legado: "AP-12", nomes_alternativos: [] },
    { id: "imovel-b", grupo_id: GRUPO_B, nome: "Parque B", slug: "parque-b", codigo_legado: "AP-12", nomes_alternativos: [] },
  ];
  banco.corretores = [];
  banco.leads = [];
});

describe("credencial", () => {
  it("sem token, token fora do formato ou desconhecido: 401 e nada gravado", async () => {
    expect((await chamar("grupo-olx", LEAD_OLX, {}, null)).status).toBe(401);
    expect((await chamar("grupo-olx", LEAD_OLX, {}, "abc")).status).toBe(401);
    expect((await chamar("grupo-olx", LEAD_OLX, {}, "d".repeat(48))).status).toBe(401);
    expect(banco.leads).toEqual([]);
  });

  it("integração desligada ou token de OUTRO formato: 401", async () => {
    banco.integracoes_de_portais[0].ativo = false;
    expect((await chamar("grupo-olx", LEAD_OLX)).status).toBe(401);
    // O token do formato genérico não abre a URL do Grupo OLX.
    expect((await chamar("grupo-olx", LEAD_OLX, {}, "c".repeat(48))).status).toBe(401);
    expect(banco.leads).toEqual([]);
  });

  it("portal desconhecido: 404", async () => {
    expect((await chamar("imovelweb", LEAD_OLX)).status).toBe(404);
  });

  it("com GRUPO_OLX_SECRET_KEY, o Basic do Grupo OLX é exigido além do token", async () => {
    process.env.GRUPO_OLX_SECRET_KEY = "chave-da-homologacao";
    expect((await chamar("grupo-olx", LEAD_OLX)).status).toBe(401);
    const errado = `Basic ${Buffer.from("vivareal:outra").toString("base64")}`;
    expect((await chamar("grupo-olx", LEAD_OLX, { authorization: errado })).status).toBe(401);
    const certo = `Basic ${Buffer.from("vivareal:chave-da-homologacao").toString("base64")}`;
    expect((await chamar("grupo-olx", LEAD_OLX, { authorization: certo })).status).toBe(200);
  });

  it("corpo que não é JSON: 400", async () => {
    expect((await chamar("grupo-olx", "não é json")).status).toBe(400);
  });
});

describe("mapeamento e roteamento", () => {
  it("o lead nasce no grupo do TOKEN, sem dono (a roleta decide), com o imóvel do código do anunciante", async () => {
    const r = await chamar("grupo-olx", LEAD_OLX);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, status: "criado" });
    expect(banco.leads).toHaveLength(1);
    expect(banco.leads[0]).toMatchObject({
      grupo_id: GRUPO_A,
      nome: "Ana Cliente",
      telefone: "5511991234567",
      email: "ana@exemplo.com",
      origem: "portal/grupo_olx",
      portal_origem: "grupo_olx",
      // O código AP-12 existe nos dois grupos: vale o do grupo do token.
      empreendimento_id: "imovel-a",
      corretor_id: null,
    });
    // O recibo não carrega dado pessoal.
    expect(banco.portais_recebimentos).toEqual([
      expect.objectContaining({ grupo_id: GRUPO_A, integracao_id: "int-a", id_externo: "olx-1", status: "criado", detalhe: null }),
    ]);
    expect(JSON.stringify(banco.portais_recebimentos)).not.toContain("991234567");
    // O aviso de lead novo sai depois da resposta, só para este lead.
    await Promise.all(depois.map((f) => f()));
    expect(avisarLeadsNovos).toHaveBeenCalledWith(expect.anything(), expect.any(Date), banco.leads[0].id);
  });

  it("lead sem telefone: 200 ok:false (o portal não precisa repetir) e recibo 'ignorado'", async () => {
    const r = await chamar("grupo-olx", { ...LEAD_OLX, phoneNumber: "", phone: "", ddd: "" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: false });
    expect(banco.leads).toEqual([]);
    expect(banco.portais_recebimentos).toEqual([expect.objectContaining({ status: "ignorado", detalhe: "sem telefone válido" })]);
  });
});

describe("deduplicação", () => {
  it("o mesmo telefone no MESMO grupo junta na ficha que existe", async () => {
    banco.leads = [
      {
        id: "lead-a",
        grupo_id: GRUPO_A,
        telefone_e164: "5511991234567",
        arquivado_em: null,
        mensagem: "Primeiro contato",
        empreendimento_id: null,
      },
    ];
    const r = await chamar("grupo-olx", LEAD_OLX);
    expect(await r.json()).toMatchObject({ status: "deduplicado" });
    expect(banco.leads).toHaveLength(1);
    expect(banco.leads[0].mensagem).toContain("Primeiro contato");
    expect(banco.leads[0].mensagem).toContain("Quero visitar");
    expect(banco.leads[0].empreendimento_id).toBe("imovel-a");
    await Promise.all(depois.map((f) => f()));
    expect(avisarLeadsNovos).not.toHaveBeenCalled();
  });

  it("o mesmo telefone em OUTRO grupo não é tocado: nasce ficha nova no grupo do token", async () => {
    banco.leads = [
      { id: "lead-b", grupo_id: GRUPO_B, telefone_e164: "5511991234567", arquivado_em: null, mensagem: "ficha de B", empreendimento_id: null },
    ];
    const r = await chamar("grupo-olx", LEAD_OLX);
    expect(await r.json()).toMatchObject({ status: "criado" });
    expect(banco.leads.find((l) => l.id === "lead-b")?.mensagem).toBe("ficha de B");
    expect(banco.leads.filter((l) => l.grupo_id === GRUPO_A)).toHaveLength(1);
  });

  it("a reentrega do portal (mesmo originLeadId) não grava de novo", async () => {
    await chamar("grupo-olx", LEAD_OLX);
    const r = await chamar("grupo-olx", LEAD_OLX);
    expect(await r.json()).toMatchObject({ ok: true, status: "repetido" });
    expect(banco.leads).toHaveLength(1);
    // A mensagem não ganhou o "novo contato" da segunda entrega.
    expect(String(banco.leads[0].mensagem)).not.toContain("Novo contato via");
    expect(banco.portais_recebimentos).toHaveLength(1);
  });

  it("o mesmo originLeadId em OUTRO grupo é outro lead", async () => {
    await chamar("grupo-olx", LEAD_OLX);
    const r = await chamar("grupo-olx", LEAD_OLX, {}, TOKEN_B);
    expect(await r.json()).toMatchObject({ status: "criado" });
    expect(banco.leads.map((l) => l.grupo_id).sort()).toEqual([GRUPO_A, GRUPO_B]);
    expect(banco.leads.find((l) => l.grupo_id === GRUPO_B)?.empreendimento_id).toBe("imovel-b");
  });
});

describe("formato genérico", () => {
  it("cria o lead com o portal declarado e o imóvel pelo código", async () => {
    const r = await chamar(
      "generico",
      { nome: "Bia", telefone: "21 98888-7777", codigo_imovel: "ap-12", portal: "imovelweb" },
      {},
      "c".repeat(48),
    );
    expect(await r.json()).toMatchObject({ status: "criado" });
    expect(banco.leads[0]).toMatchObject({
      grupo_id: GRUPO_A,
      portal_origem: "imovelweb",
      origem: "portal/imovelweb",
      empreendimento_id: "imovel-a",
    });
  });
});
