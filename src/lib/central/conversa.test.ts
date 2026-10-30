import { describe, expect, it, vi } from "vitest";
import type { EntradaDoCerebro, ResultadoDoCerebro } from "./cerebro";
import { responderNoCentral, TEXTOS, type Dependencias, type EstadoDoCentral, type MensagemRecebida } from "./conversa";
import type { Tratadores } from "./executar";
import type { Remetente } from "./identificar";

const CAROL: Remetente = { tipo: "pessoa", corretorId: "c1", grupoId: "g1", papel: "corretor", nome: "Carolini Maia", imobiliaria: "Next Home" };
const AGORA = new Date("2026-10-30T15:00:00Z");

type Cena = {
  remetente?: Remetente;
  estado?: Partial<EstadoDoCentral>;
  pensar?: (e: EntradaDoCerebro) => Promise<ResultadoDoCerebro>;
  cota?: boolean;
  transcricao?: string | null;
  tratadas?: string[];
  escolhaPendente?: { corretorId: string; grupoId: string; nome: string }[] | null;
  tratadores?: Tratadores;
  onda?: number;
  agora?: Date;
};

function montar(c: Cena = {}) {
  let estado: EstadoDoCentral = { historico: [], proposta: null, boasVindasEm: "2026-10-01T00:00:00Z", ...c.estado };
  const espioes = {
    tentativas: [] as unknown[],
    comandos: [] as Record<string, unknown>[],
    escolhas: [] as unknown[],
    pensou: [] as EntradaDoCerebro[],
  };
  const deps: Dependencias = {
    agora: () => c.agora ?? AGORA,
    identificar: async () => c.remetente ?? CAROL,
    jaTratada: async (id) => (c.tratadas ?? []).includes(id),
    registrarTentativa: async (t) => void espioes.tentativas.push(t),
    lerEscolhaPendente: async () => c.escolhaPendente ?? null,
    guardarEscolha: async (e) => void espioes.escolhas.push(e),
    cotaEsgotada: async () => c.cota ?? false,
    lerEstado: async () => structuredClone(estado),
    salvarEstado: async (_id, e) => void (estado = e),
    transcrever: async () => (c.transcricao === undefined ? "texto do áudio" : c.transcricao),
    pensar: async (e) => {
      espioes.pensou.push(e);
      return c.pensar ? c.pensar(e) : { ok: true, texto: "resposta", chamadas: [], modelo: "m", tokensEntrada: 1, tokensSaida: 1, custoUsd: 0.01 };
    },
    registrarComando: async (r) => void espioes.comandos.push(r),
    tratadores: c.tratadores,
    onda: c.onda,
  };
  return { deps, espioes, estado: () => estado };
}

const msg = (texto: string, extra: Partial<MensagemRecebida> = {}): MensagemRecebida => ({
  mensagemId: `m-${texto}`,
  telefone: "5511987654321",
  lid: null,
  tipo: "texto",
  texto,
  ...extra,
});

describe("quem não é atendido fica em silêncio", () => {
  for (const tipo of ["desconhecido", "inativo"] as const) {
    it(`${tipo}: nenhuma resposta, tentativa sem o texto`, async () => {
      const { deps, espioes } = montar({ remetente: { tipo } });
      expect(await responderNoCentral(msg("me passa os leads da Next", { mensagemId: "3EB0ABC" }), deps)).toEqual([]);
      expect(JSON.stringify(espioes.tentativas)).not.toContain("leads");
      expect(JSON.stringify(espioes.tentativas)).not.toContain("987654321");
      expect(espioes.comandos).toEqual([]);
    });
  }

  it("imobiliária com o recurso desligado: silêncio", async () => {
    const { deps, espioes } = montar({ remetente: { tipo: "desligado", grupoId: "g9" } });
    expect(await responderNoCentral(msg("oi"), deps)).toEqual([]);
    expect(espioes.tentativas).toHaveLength(1);
  });

  it("reentrega da mesma mensagem não responde duas vezes", async () => {
    const { deps, espioes } = montar({ tratadas: ["m-oi"] });
    expect(await responderNoCentral(msg("oi"), deps)).toEqual([]);
    expect(espioes.pensou).toEqual([]);
  });
});

describe("duas imobiliárias", () => {
  const opcoes = [
    { corretorId: "c-a", grupoId: "g-a", nome: "Aretz" },
    { corretorId: "c-n", grupoId: "g-n", nome: "Next Home" },
  ];
  it("pergunta qual e guarda a escolha pelo número", async () => {
    const { deps, espioes } = montar({ remetente: { tipo: "escolher", telefone: "5511987654321", opcoes } });
    const [pergunta] = await responderNoCentral(msg("oi"), deps);
    expect(pergunta).toBe("Você está em 2 imobiliárias. Por qual quer falar?\n1) Aretz\n2) Next Home");

    const segunda = montar({ remetente: { tipo: "escolher", telefone: "5511987654321", opcoes }, escolhaPendente: opcoes });
    const [ok] = await responderNoCentral(msg("2"), segunda.deps);
    expect(ok).toMatch(/Next Home/);
    expect(segunda.espioes.escolhas).toEqual([{ telefone: "5511987654321", corretorId: "c-n", opcoes: null }]);
    expect(espioes.escolhas[0]).toMatchObject({ corretorId: null, opcoes });
  });
});

describe("boas-vindas, cota, foto e áudio", () => {
  it("primeira mensagem 'oi': só as boas-vindas, com nome e imobiliária", async () => {
    const { deps, espioes, estado } = montar({ estado: { boasVindasEm: null } });
    const r = await responderNoCentral(msg("oi"), deps);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/^Oi, Carolini! Sou o assistente da plataforma para a Next Home/);
    expect(r[0]).toMatch(/\*sim\*/);
    expect(estado().boasVindasEm).not.toBeNull();
    expect(espioes.pensou).toEqual([]);
  });

  it("primeira mensagem com pedido: boas-vindas e a resposta", async () => {
    const { deps } = montar({ estado: { boasVindasEm: null } });
    const r = await responderNoCentral(msg("o que você sabe fazer?"), deps);
    expect(r).toHaveLength(2);
    expect(r[1]).toBe("resposta");
  });

  it("cota esgotada: avisa, não chama a IA", async () => {
    const { deps, espioes } = montar({ cota: true });
    expect(await responderNoCentral(msg("quem ligo hoje?"), deps)).toEqual([TEXTOS.cota]);
    expect(espioes.pensou).toEqual([]);
  });

  it("foto: ainda não sei ler", async () => {
    const { deps } = montar();
    expect(await responderNoCentral(msg("", { tipo: "imagem" }), deps)).toEqual([TEXTOS.semFoto]);
  });

  it("áudio transcrito chega ao cérebro como texto", async () => {
    const { deps, espioes } = montar({ transcricao: "quem eu ligo hoje" });
    await responderNoCentral(msg("", { tipo: "audio" }), deps);
    expect(espioes.pensou[0].mensagem).toBe("quem eu ligo hoje");
  });

  it("áudio que não deu para ouvir: pede de novo", async () => {
    const { deps, espioes } = montar({ transcricao: null });
    expect(await responderNoCentral(msg("", { tipo: "audio" }), deps)).toEqual([TEXTOS.semAudio]);
    expect(espioes.pensou).toEqual([]);
  });
});

describe("cérebro", () => {
  it("IA fora do ar: responde indisponível e registra o motivo", async () => {
    const { deps, espioes } = montar({ pensar: async () => ({ ok: false, indisponivel: true, motivo: "sem_credito", chamadas: [], custoUsd: 0 }) });
    expect(await responderNoCentral(msg("quem ligo hoje?"), deps)).toEqual([TEXTOS.indisponivel]);
    expect(espioes.comandos[0]).toMatchObject({ erro: "sem_credito" });
  });

  it("o contexto vem da identificação, e o corretor não recebe ferramentas do gestor", async () => {
    const { deps, espioes } = montar();
    await responderNoCentral(msg("como está a equipe?"), deps);
    const e = espioes.pensou[0];
    expect(e.quemPaga).toEqual({ corretorId: "c1", grupoId: "g1" });
    expect(e.sistema).toMatch(/Carolini Maia, corretor\(a\) da imobiliária Next Home/);
    expect(e.ferramentas.map((f) => f.nome)).not.toContain("relatorio_da_equipe");
  });

  it("pedido de onda futura: a ferramenta diz ainda não, nada vira proposta", async () => {
    const { deps, estado } = montar({
      pensar: async (e) => {
        const r = await e.executar("cadastrar_lead", { nome: "João" });
        return { ok: true, texto: String((r as { mensagem: string }).mensagem), chamadas: [{ nome: "cadastrar_lead", argumentos: { nome: "João" }, resultado: r }], modelo: "m", tokensEntrada: 1, tokensSaida: 1, custoUsd: 0 };
      },
    });
    expect(await responderNoCentral(msg("cadastra o João"), deps)).toEqual(["Ainda não sei fazer isso, chega nas próximas semanas."]);
    expect(estado().proposta).toBeNull();
  });

  it("guarda o histórico e o comando com custo em centavos", async () => {
    const { deps, espioes, estado } = montar();
    await responderNoCentral(msg("oi de novo"), deps);
    expect(estado().historico.map((h) => h.papel)).toEqual(["pessoa", "central"]);
    expect(espioes.comandos[0]).toMatchObject({ mensagemId: "m-oi de novo", texto: "oi de novo", resultado: "resposta", custoCentavos: 6 });
  });

  it("histórico com mais de 30 min não vai ao cérebro", async () => {
    const velho = { papel: "pessoa" as const, texto: "velho", em: "2026-10-30T14:00:00Z" };
    const novo = { papel: "pessoa" as const, texto: "novo", em: "2026-10-30T14:45:00Z" };
    const { deps, espioes } = montar({ estado: { historico: [velho, novo] } });
    await responderNoCentral(msg("e aí?"), deps);
    expect(espioes.pensou[0].historico.map((h) => h.texto)).toEqual(["novo"]);
  });
});

describe("proposta e sim (com uma ação de teste; nenhuma real existe na onda 0)", () => {
  const gravados: unknown[] = [];
  const tratadores: Tratadores = {
    consultas: {},
    acoes: {
      cadastrar_lead: {
        preparar: async (_c, a) => ({ tipo: "proposta", resumo: `Cadastrar ${String(a.nome)}`, dados: { nome: a.nome } }),
        executar: async (_c, d) => (gravados.push(d), { ok: true, texto: `${String(d.nome)} cadastrado.`, desfazer: { leadId: "l1" } }),
        desfazer: async () => ({ ok: true, texto: "Cadastro desfeito." }),
      },
    },
  };
  const propoe = async (e: EntradaDoCerebro): Promise<ResultadoDoCerebro> => {
    await e.executar("cadastrar_lead", { nome: "João" });
    return { ok: true, texto: "(texto do modelo, ignorado)", chamadas: [], modelo: "m", tokensEntrada: 1, tokensSaida: 1, custoUsd: 0 };
  };

  it("ação vira proposta com o texto fixo, nada gravado; sim grava", async () => {
    const cena = montar({ tratadores, onda: 1, pensar: propoe });
    const [proposta] = await responderNoCentral(msg("cadastra o João"), cena.deps);
    expect(proposta).toBe("Vou fazer isto:\nCadastrar João\n\nResponda *sim* para confirmar ou *não* para cancelar.");
    expect(gravados).toEqual([]);

    const [feito] = await responderNoCentral(msg("sim"), cena.deps);
    expect(feito).toBe("João cadastrado.");
    expect(gravados).toEqual([{ nome: "João" }]);
    expect(cena.estado().proposta).toBeNull();
    expect(cena.espioes.comandos.at(-1)).toMatchObject({
      confirmado: true,
      desfazer: [{ ferramenta: "cadastrar_lead", resumo: "Cadastrar João", desfazer: { leadId: "l1" } }],
    });
  });

  it("não cancela, e passada 1 hora o sim não vale", async () => {
    const cena = montar({ tratadores, onda: 1, pensar: propoe });
    await responderNoCentral(msg("cadastra o João"), cena.deps);
    expect(await responderNoCentral(msg("não"), cena.deps)).toEqual([TEXTOS.cancelado]);

    const tarde = montar({ tratadores, onda: 1, pensar: propoe });
    await responderNoCentral(msg("cadastra o João"), tarde.deps);
    const estadoDepois = tarde.estado();
    const daquiAUmaHora = montar({ tratadores, onda: 1, estado: estadoDepois, agora: new Date(AGORA.getTime() + 61 * 60_000) });
    expect(await responderNoCentral(msg("sim"), daquiAUmaHora.deps)).toEqual([TEXTOS.venceu]);
  });

  it("outro pedido sem nova proposta derruba a pendente", async () => {
    const cena = montar({ tratadores, onda: 1, pensar: propoe });
    await responderNoCentral(msg("cadastra o João"), cena.deps);
    const deps = { ...cena.deps, pensar: vi.fn(async () => ({ ok: true as const, texto: "Hoje: 3 visitas.", chamadas: [], modelo: "m", tokensEntrada: 1, tokensSaida: 1, custoUsd: 0 })) };
    expect(await responderNoCentral(msg("quem ligo hoje?"), deps)).toEqual(["Hoje: 3 visitas."]);
    expect(cena.estado().proposta).toBeNull();
  });
});
