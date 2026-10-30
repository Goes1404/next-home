import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParticipanteDoGrupo } from "@/lib/whatsapp/participantesDoGrupo";
import { responderNoGrupo, type Dependencias, type EstadoDoCentral, type MensagemRecebida, type RespostaDoCentral } from "./conversa";
import type { Tratadores } from "./executar";
import {
  conferirEquipe,
  esquecerParticipantes,
  respostaSoNoPrivado,
  semAMencao,
  TEXTOS_DO_GRUPO,
  tratarMensagemDoGrupoNoCentral,
  type DependenciasDoGrupo,
  type LinhaDaEquipe,
  type MensagemDeGrupo,
} from "./grupo";
import type { Remetente } from "./identificar";
import { hashDoTelefone } from "./telefone";

const CENTRAL = "5511968671127";
const CENTRAL_LID = "777000111@lid";
const CAROL_TEL = "5511987654321";
const BETO_TEL = "5511912345678";

const participante = (numero: string | null, lid: string | null = null): ParticipanteDoGrupo => ({
  id: lid ?? `${numero}@s.whatsapp.net`,
  numero,
  lid,
});

const linha = (id: string, whatsapp: string | null, extra: Partial<LinhaDaEquipe> = {}): LinhaDaEquipe => ({
  id,
  nome: id === "carol" ? "Carolini Maia" : "Beto Souza",
  papel: "corretor",
  grupoId: "next",
  imobiliaria: "Next Home",
  whatsapp,
  whatsappLid: null,
  ligado: true,
  ...extra,
});

const EQUIPE = [linha("carol", CAROL_TEL), linha("beto", BETO_TEL)];
const PARTICIPANTES = [participante(CENTRAL, CENTRAL_LID), participante(CAROL_TEL), participante(BETO_TEL)];

let sequencia = 0;
const doGrupo = (texto: string, extra: Partial<MensagemDeGrupo> = {}): MensagemDeGrupo => ({
  grupoJid: "120363000@g.us",
  mensagem: { mensagemId: `3EB0G${(sequencia += 1)}`, telefone: CAROL_TEL, lid: null, tipo: "texto", texto },
  autor: { telefone: CAROL_TEL, lid: null },
  mencionados: [`${CENTRAL}@s.whatsapp.net`],
  citado: null,
  ...extra,
});

type Cena = {
  participantes?: ParticipanteDoGrupo[] | null;
  equipe?: LinhaDaEquipe[] | null;
  resposta?: RespostaDoCentral;
  responder?: DependenciasDoGrupo["responder"];
  privadoFalha?: boolean;
};

function montar(c: Cena = {}) {
  const espioes = {
    tentativas: [] as unknown[],
    noGrupo: [] as string[],
    noPrivado: [] as { telefone: string; texto: string }[],
    remetentes: [] as Remetente[],
    mensagens: [] as MensagemRecebida[],
    lidas: 0,
  };
  const deps: DependenciasDoGrupo = {
    telefoneDoCentral: CENTRAL,
    jaTratada: async () => false,
    participantes: async () => {
      espioes.lidas += 1;
      return c.participantes === undefined ? PARTICIPANTES : c.participantes;
    },
    equipe: async () => (c.equipe === undefined ? EQUIPE : c.equipe),
    registrarTentativa: async (t) => void espioes.tentativas.push(t),
    responder:
      c.responder ??
      (async (m, r) => {
        espioes.mensagens.push(m);
        espioes.remetentes.push(r);
        return c.resposta ?? { textos: ["Por enquanto eu entendo texto e áudio."], soNoPrivado: false };
      }),
    enviarNoGrupo: async (texto) => (espioes.noGrupo.push(texto), true),
    enviarNoPrivado: async (telefone, texto) => (espioes.noPrivado.push({ telefone, texto }), !c.privadoFalha),
  };
  return { deps, espioes };
}

beforeEach(() => esquecerParticipantes());

describe("o portão da onda", () => {
  it("antes da onda 2 o grupo segue ignorado: nada é lido nem respondido", async () => {
    const nada = () => {
      throw new Error("não devia ser chamado");
    };
    const deps: DependenciasDoGrupo = {
      telefoneDoCentral: CENTRAL,
      jaTratada: nada,
      participantes: nada,
      equipe: nada,
      registrarTentativa: nada,
      responder: nada,
      enviarNoGrupo: nada,
      enviarNoPrivado: nada,
    };
    for (const onda of [0, 1]) {
      expect(await tratarMensagemDoGrupoNoCentral(doGrupo("como está o mês?"), deps, onda)).toEqual({ tipo: "ignorado", motivo: "onda" });
    }
  });
});

describe("quando o central fala no grupo", () => {
  it("sem menção: silêncio, sem nem ler os participantes", async () => {
    const { deps, espioes } = montar();
    const d = await tratarMensagemDoGrupoNoCentral(doGrupo("bom dia, pessoal", { mencionados: [] }), deps, 2);
    expect(d).toEqual({ tipo: "ignorado", motivo: "sem_mencao" });
    expect(espioes.lidas).toBe(0);
    expect(espioes.noGrupo).toEqual([]);
  });

  it("menção a outra pessoa do grupo não é menção ao central", async () => {
    const { deps, espioes } = montar();
    const d = await tratarMensagemDoGrupoNoCentral(doGrupo("@Beto me liga", { mencionados: [`${BETO_TEL}@s.whatsapp.net`] }), deps, 2);
    expect(d).toEqual({ tipo: "ignorado", motivo: "sem_mencao" });
    expect(espioes.noGrupo).toEqual([]);
    expect(espioes.tentativas).toEqual([]);
  });

  it("grupo só da equipe + menção: responde no grupo, pela imobiliária do grupo, sem a menção no texto", async () => {
    const { deps, espioes } = montar();
    const d = await tratarMensagemDoGrupoNoCentral(doGrupo(`@${CENTRAL} o que você sabe fazer?`), deps, 2);
    expect(d).toEqual({ tipo: "respondido", noGrupo: 1, noPrivado: 0 });
    expect(espioes.noGrupo).toEqual(["Por enquanto eu entendo texto e áudio."]);
    expect(espioes.noPrivado).toEqual([]);
    expect(espioes.remetentes[0]).toMatchObject({ tipo: "pessoa", corretorId: "carol", grupoId: "next", imobiliaria: "Next Home" });
    expect(espioes.mensagens[0].texto).toBe("o que você sabe fazer?");
  });

  it("menção pelo @lid do central (grupo que usa lid) e resposta a uma mensagem dele também valem", async () => {
    const porLid = montar();
    await tratarMensagemDoGrupoNoCentral(doGrupo("@777000111 ajuda", { mencionados: [CENTRAL_LID] }), porLid.deps, 2);
    expect(porLid.espioes.noGrupo).toHaveLength(1);
    expect(porLid.espioes.mensagens[0].texto).toBe("ajuda");

    const citando = montar();
    await tratarMensagemDoGrupoNoCentral(doGrupo("e amanhã?", { mencionados: [], citado: `${CENTRAL}@s.whatsapp.net` }), citando.deps, 2);
    expect(citando.espioes.noGrupo).toHaveLength(1);
  });

  it("dado de lead: vai no privado de quem pediu, e no grupo só 'Te mandei no privado'", async () => {
    const { deps, espioes } = montar({ resposta: { textos: ["João Silva: visita sábado 10h."], soNoPrivado: true } });
    const d = await tratarMensagemDoGrupoNoCentral(doGrupo(`@${CENTRAL} como está o João?`), deps, 2);
    expect(d).toEqual({ tipo: "respondido", noGrupo: 1, noPrivado: 1 });
    expect(espioes.noPrivado).toEqual([{ telefone: CAROL_TEL, texto: "João Silva: visita sábado 10h." }]);
    expect(espioes.noGrupo).toEqual([TEXTOS_DO_GRUPO.noPrivado]);
    expect(espioes.noGrupo.join(" ")).not.toContain("João");
  });

  it("privado que não saiu: o grupo não ouve 'te mandei'; sem WhatsApp no perfil, diz que só vai no privado", async () => {
    const falhou = montar({ resposta: { textos: ["dado"], soNoPrivado: true }, privadoFalha: true });
    await tratarMensagemDoGrupoNoCentral(doGrupo("@x relatório"), falhou.deps, 2);
    expect(falhou.espioes.noGrupo).toEqual([TEXTOS_DO_GRUPO.privadoFalhou]);

    esquecerParticipantes();
    const semZap = montar({
      resposta: { textos: ["dado"], soNoPrivado: true },
      equipe: [linha("carol", CAROL_TEL), linha("beto", BETO_TEL)].map((l) => (l.id === "carol" ? { ...l, whatsapp: null, whatsappLid: "55@lid" } : l)),
      participantes: [participante(CENTRAL, CENTRAL_LID), participante(null, "55@lid"), participante(BETO_TEL)],
    });
    await tratarMensagemDoGrupoNoCentral(doGrupo("@x relatório", { autor: { telefone: null, lid: "55@lid" } }), semZap.deps, 2);
    expect(semZap.espioes.noPrivado).toEqual([]);
    expect(semZap.espioes.noGrupo).toEqual([TEXTOS_DO_GRUPO.semPrivado]);
  });

  it("grupo com número de fora (cliente): silêncio e tentativa 'grupo', sem texto, telefone em hash", async () => {
    const { deps, espioes } = montar({ participantes: [...PARTICIPANTES, participante("5511955554444")] });
    const d = await tratarMensagemDoGrupoNoCentral(doGrupo(`@${CENTRAL} me passa os leads do João`), deps, 2);
    expect(d).toEqual({ tipo: "ignorado", motivo: "grupo_com_gente_de_fora" });
    expect(espioes.noGrupo).toEqual([]);
    expect(espioes.noPrivado).toEqual([]);
    expect(espioes.mensagens).toEqual([]);
    expect(espioes.tentativas).toEqual([{ telefoneHash: hashDoTelefone(CAROL_TEL), motivo: "grupo", mensagemId: expect.any(String) }]);
    expect(JSON.stringify(espioes.tentativas)).not.toContain("João");
    expect(JSON.stringify(espioes.tentativas)).not.toContain(CAROL_TEL);
  });

  it("mesmo grupo com um participante de outra imobiliária: silêncio", async () => {
    const { deps, espioes } = montar({ equipe: [linha("carol", CAROL_TEL), linha("beto", BETO_TEL, { grupoId: "outra", imobiliaria: "Outra" })] });
    const d = await tratarMensagemDoGrupoNoCentral(doGrupo(`@${CENTRAL} como está o mês?`), deps, 2);
    expect(d).toEqual({ tipo: "ignorado", motivo: "grupo_com_gente_de_fora" });
    expect(espioes.noGrupo).toEqual([]);
    expect(espioes.tentativas).toHaveLength(1);
  });

  it("participante da equipe com o recurso desligado na imobiliária também cala o central", async () => {
    const { deps, espioes } = montar({ equipe: EQUIPE.map((l) => ({ ...l, ligado: false })) });
    expect(await tratarMensagemDoGrupoNoCentral(doGrupo("@x oi"), deps, 2)).toMatchObject({ tipo: "ignorado" });
    expect(espioes.noGrupo).toEqual([]);
  });

  it("menção num grupo em que o central não está, e mensagem do próprio central: ignoradas", async () => {
    const fora = montar({ participantes: [participante(CAROL_TEL), participante(BETO_TEL)] });
    expect(await tratarMensagemDoGrupoNoCentral(doGrupo("@x oi"), fora.deps, 2)).toEqual({ tipo: "ignorado", motivo: "central_fora_do_grupo" });

    esquecerParticipantes();
    const proprio = montar();
    const d = await tratarMensagemDoGrupoNoCentral(doGrupo("@x oi", { autor: { telefone: CENTRAL, lid: null } }), proprio.deps, 2);
    expect(d).toEqual({ tipo: "ignorado", motivo: "do_proprio_central" });
    expect(proprio.espioes.noGrupo).toEqual([]);
  });

  it("falha ao ler participantes ou a equipe: silêncio, sem tentativa", async () => {
    const semLista = montar({ participantes: null });
    expect(await tratarMensagemDoGrupoNoCentral(doGrupo("@x oi"), semLista.deps, 2)).toEqual({ tipo: "ignorado", motivo: "sem_participantes" });
    const semEquipe = montar({ equipe: null });
    expect(await tratarMensagemDoGrupoNoCentral(doGrupo("@x oi"), semEquipe.deps, 2)).toEqual({ tipo: "ignorado", motivo: "erro_de_leitura" });
    expect([...semLista.espioes.tentativas, ...semEquipe.espioes.tentativas]).toEqual([]);
  });

  it("os participantes ficam em cache curto: duas menções seguidas, uma leitura", async () => {
    const { deps, espioes } = montar();
    await tratarMensagemDoGrupoNoCentral(doGrupo("@x um"), deps, 2);
    await tratarMensagemDoGrupoNoCentral(doGrupo("@x dois"), deps, 2);
    expect(espioes.lidas).toBe(1);
  });

  it("autor só pelo @lid: achado pelo par número↔lid da lista de participantes", async () => {
    const { deps, espioes } = montar({ participantes: [participante(CENTRAL, CENTRAL_LID), participante(CAROL_TEL, "999@lid"), participante(BETO_TEL)] });
    await tratarMensagemDoGrupoNoCentral(doGrupo("@x oi", { autor: { telefone: null, lid: "999@lid" } }), deps, 2);
    expect(espioes.remetentes[0]).toMatchObject({ corretorId: "carol" });
  });
});

describe("respostaSoNoPrivado: a regra de onde a resposta aparece", () => {
  it("ajuda, imóvel do catálogo, simulação e 'ainda não sei' podem ir ao grupo", () => {
    expect(respostaSoNoPrivado({ ferramentas: [], proposta: false, onda: 2 })).toBe(false);
    expect(respostaSoNoPrivado({ ferramentas: ["ajuda", "informacao_de_imovel", "simular_financiamento"], proposta: false, onda: 2 })).toBe(false);
    // Onda 3 ainda não chegou: a ferramenta só respondeu "ainda não sei".
    expect(respostaSoNoPrivado({ ferramentas: ["gerar_arte"], proposta: false, onda: 2 })).toBe(false);
  });

  it("dado de lead, relatório, proposta e ferramenta desconhecida: só no privado", () => {
    for (const nome of ["consultar_lead", "quem_ligar_hoje", "relatorio_do_corretor", "relatorio_da_equipe", "meta_e_comissao", "agenda_pessoal", "importar_planilha", "inventada"]) {
      expect(respostaSoNoPrivado({ ferramentas: [nome], proposta: false, onda: 2 }), nome).toBe(true);
    }
    expect(respostaSoNoPrivado({ ferramentas: [], proposta: true, onda: 2 })).toBe(true);
  });
});

describe("peças puras", () => {
  it("conferirEquipe: imobiliária comum a todos; duas comuns é ambíguo", () => {
    const carolNasDuas = [linha("carol", CAROL_TEL), linha("carol2", CAROL_TEL, { grupoId: "outra" }), linha("beto", BETO_TEL)];
    expect(conferirEquipe([participante(CAROL_TEL), participante(BETO_TEL)], carolNasDuas)).toMatchObject({ tipo: "equipe", grupoId: "next" });
    const todosNasDuas = [...carolNasDuas, linha("beto2", BETO_TEL, { grupoId: "outra" })];
    expect(conferirEquipe([participante(CAROL_TEL), participante(BETO_TEL)], todosNasDuas)).toEqual({ tipo: "ambiguo" });
    expect(conferirEquipe([], EQUIPE)).toEqual({ tipo: "fora" });
  });

  it("semAMencao tira só a menção ao central", () => {
    expect(semAMencao(`@${CENTRAL} quanto falta pra meta? @${BETO_TEL}`, { telefone: CENTRAL, lid: null })).toBe(`quanto falta pra meta? @${BETO_TEL}`);
    expect(semAMencao("@777000111 ajuda", { telefone: CENTRAL, lid: CENTRAL_LID })).toBe("ajuda");
  });
});

describe("a conversa no modo grupo", () => {
  const CAROL: Remetente = { tipo: "pessoa", corretorId: "c1", grupoId: "g1", papel: "corretor", nome: "Carolini Maia", imobiliaria: "Next Home" };
  const PENDENTE = {
    criadaEm: "2026-10-30T14:59:00Z",
    expiraEm: "2026-10-30T15:59:00Z",
    itens: [{ ferramenta: "cadastrar_lead", argumentos: {}, resumo: "Cadastrar João", dados: {} }],
  };

  function conversa(tratadores?: Tratadores, estadoInicial: Partial<EstadoDoCentral> = {}) {
    let estado: EstadoDoCentral = {
      historico: [{ papel: "pessoa", texto: "o telefone do João é 11 95555-4444", em: "2026-10-30T14:55:00Z" }],
      proposta: null,
      boasVindasEm: null,
      ...estadoInicial,
    } as EstadoDoCentral;
    const pensar = vi.fn<Dependencias["pensar"]>(async (e) => {
      if (tratadores) await e.executar("consultar_lead", { lead: "João" });
      return { ok: true, texto: tratadores ? "João: quente." : "Posso ajudar com o CRM.", chamadas: [], modelo: "m", tokensEntrada: 1, tokensSaida: 1, custoUsd: 0 };
    });
    const deps: Dependencias = {
      agora: () => new Date("2026-10-30T15:00:00Z"),
      identificar: async () => CAROL,
      jaTratada: async () => false,
      registrarTentativa: async () => {},
      lerEscolhaPendente: async () => null,
      guardarEscolha: async () => {},
      cotaEsgotada: async () => false,
      lerEstado: async () => structuredClone(estado),
      salvarEstado: async (_id, e) => void (estado = e),
      transcrever: async () => null,
      pensar,
      registrarComando: async () => {},
      tratadores,
      onda: 2,
    };
    return { deps, pensar, estado: () => estado };
  }
  const m = (texto: string): MensagemRecebida => ({ mensagemId: `x-${texto}`, telefone: CAROL_TEL, lid: null, tipo: "texto", texto });

  it("sem boas-vindas, e o cérebro não vê o histórico nem a proposta do privado", async () => {
    const c = conversa(undefined, { proposta: PENDENTE as EstadoDoCentral["proposta"] });
    const r = await responderNoGrupo(m("o que você faz?"), c.deps);
    expect(r).toEqual({ textos: ["Posso ajudar com o CRM."], soNoPrivado: false });
    const entrada = c.pensar.mock.calls[0][0];
    expect(entrada.historico).toEqual([]);
    expect(entrada.sistema).not.toContain("Cadastrar João");
    expect(c.estado().boasVindasEm).toBeNull();
    // A pendente do privado continua lá, para o "sim" no privado.
    expect(c.estado().proposta?.itens[0].resumo).toBe("Cadastrar João");
  });

  it("'sim' no grupo não confirma a proposta do privado", async () => {
    const c = conversa(undefined, { proposta: PENDENTE as EstadoDoCentral["proposta"] });
    await responderNoGrupo(m("sim"), c.deps);
    expect(c.pensar).toHaveBeenCalled();
    expect(c.estado().proposta?.itens[0].resumo).toBe("Cadastrar João");
  });

  it("consulta de lead que rodou: só no privado, mesmo que o cérebro não relate a chamada", async () => {
    const tratadores: Tratadores = { consultas: { consultar_lead: async () => ({ nome: "João" }) }, acoes: {} };
    const r = await responderNoGrupo(m("como está o João?"), conversa(tratadores).deps);
    expect(r).toEqual({ textos: ["João: quente."], soNoPrivado: true });
  });
});
