import { describe, expect, it } from "vitest";
import { situacaoDaCota } from "@/lib/planos/cotaDaIa";
import type { SituacaoDaCobranca } from "@/lib/planos/cobranca";
import { saudeDoGrupo, type SinaisDeSaude } from "./saudeDoGrupo";

const EM_DIA: SituacaoDaCobranca = {
  estado: "em_dia",
  competenciaEmAberto: null,
  vencimento: null,
  diasDeAtraso: 0,
  suspendeEm: null,
  proximoVencimento: "2026-11-10",
  fimDoTeste: null,
  diasDeTesteRestantes: 0,
  testeTerminouSemPagamento: false,
  emAberto: [],
};

function sinais(sobre: Partial<SinaisDeSaude> = {}): SinaisDeSaude {
  return {
    situacao: "ativo",
    corretoresAtivos: 3,
    whatsappsConectados: 3,
    whatsappsCadastrados: 3,
    tentativasNas24h: 10,
    respondidasNas24h: 10,
    errosDeEnvioNas24h: 0,
    fallbacksNas24h: 0,
    cota: situacaoDaCota({ respostas: 100, teto: 1000 }),
    cobranca: EM_DIA,
    custo: { alerta: false, percentual: 10 },
    ...sobre,
  };
}

describe("saúde do grupo", () => {
  it("tudo em ordem: verde, sem motivo", () => {
    expect(saudeDoGrupo(sinais())).toEqual({ nivel: "verde", motivos: [] });
  });

  it("WhatsApp desconectado: amarelo com a contagem", () => {
    const r = saudeDoGrupo(sinais({ whatsappsConectados: 2 }));
    expect(r.nivel).toBe("amarelo");
    expect(r.motivos[0].texto).toBe("2 de 3 WhatsApps conectados");
  });

  it("nenhum WhatsApp conectado diz isso, e sem cadastro também avisa", () => {
    expect(saudeDoGrupo(sinais({ whatsappsConectados: 0 })).motivos[0].texto).toBe("Nenhum dos 3 WhatsApps está conectado");
    expect(saudeDoGrupo(sinais({ whatsappsConectados: 0, whatsappsCadastrados: 0 })).motivos[0].texto).toBe(
      "Nenhum WhatsApp cadastrado",
    );
  });

  it("grupo sem corretor e sem número não acende WhatsApp", () => {
    expect(saudeDoGrupo(sinais({ corretoresAtivos: 0, whatsappsConectados: 0, whatsappsCadastrados: 0 })).nivel).toBe("verde");
  });

  it("clientes escrevendo e a IA calada há 24h: vermelho", () => {
    const r = saudeDoGrupo(sinais({ tentativasNas24h: 4, respondidasNas24h: 0 }));
    expect(r.nivel).toBe("vermelho");
  });

  it("sem cliente escrevendo, a IA calada é normal", () => {
    expect(saudeDoGrupo(sinais({ tentativasNas24h: 0, respondidasNas24h: 0 })).nivel).toBe("verde");
  });

  it("erro de envio: amarelo", () => {
    const r = saudeDoGrupo(sinais({ errosDeEnvioNas24h: 2 }));
    expect(r).toMatchObject({ nivel: "amarelo", motivos: [{ texto: "2 erros de envio nas últimas 24h" }] });
  });

  it("fallback só acende com volume e fração", () => {
    expect(saudeDoGrupo(sinais({ fallbacksNas24h: 2, tentativasNas24h: 5 })).nivel).toBe("verde");
    expect(saudeDoGrupo(sinais({ fallbacksNas24h: 3, tentativasNas24h: 100 })).nivel).toBe("verde");
    expect(saudeDoGrupo(sinais({ fallbacksNas24h: 3, tentativasNas24h: 10 })).nivel).toBe("amarelo");
  });

  it("cota: 80% amarelo, esgotada vermelho, sem teto verde", () => {
    expect(saudeDoGrupo(sinais({ cota: situacaoDaCota({ respostas: 800, teto: 1000 }) })).nivel).toBe("amarelo");
    expect(saudeDoGrupo(sinais({ cota: situacaoDaCota({ respostas: 1000, teto: 1000 }) })).nivel).toBe("vermelho");
    expect(saudeDoGrupo(sinais({ cota: situacaoDaCota({ respostas: 99999, teto: null }) })).nivel).toBe("verde");
  });

  it("cobrança: vencida amarelo, suspensa vermelho", () => {
    const pendente = { ...EM_DIA, estado: "pendente" as const, diasDeAtraso: 3 };
    const r = saudeDoGrupo(sinais({ cobranca: pendente }));
    expect(r).toMatchObject({ nivel: "amarelo", motivos: [{ texto: "Mensalidade vencida há 3 dias" }] });
    expect(saudeDoGrupo(sinais({ cobranca: { ...pendente, estado: "suspenso" } })).nivel).toBe("vermelho");
  });

  it("custo da IA acima de 30% da mensalidade: amarelo", () => {
    const r = saudeDoGrupo(sinais({ custo: { alerta: true, percentual: 42.4 } }));
    expect(r).toMatchObject({ nivel: "amarelo", motivos: [{ texto: "IA custa 42% da mensalidade" }] });
  });

  it("vermelho vence amarelo e os motivos saem do mais grave ao menos grave", () => {
    const r = saudeDoGrupo(
      sinais({ whatsappsConectados: 1, cota: situacaoDaCota({ respostas: 1000, teto: 1000 }) }),
    );
    expect(r.nivel).toBe("vermelho");
    expect(r.motivos.map((m) => m.nivel)).toEqual(["vermelho", "amarelo"]);
  });

  it("grupo encerrado não é monitorado", () => {
    expect(saudeDoGrupo(sinais({ situacao: "encerrado", whatsappsConectados: 0 })).nivel).toBe("verde");
  });
});
