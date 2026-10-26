import { describe, expect, it } from "vitest";
import { aplicadoGuardado, planejarEfeitos, type Aplicado } from "./efeitos";
import type { LeituraDoRetorno } from "./leituraDoRetorno";

const AGORA = new Date("2026-10-26T15:00:00.000Z");

function leitura(parcial: Partial<LeituraDoRetorno>): LeituraDoRetorno {
  return { resultado: "atendeu", etapa: null, visitaEm: null, motivoPerda: null, resumo: null, proximoPasso: null, fatos: {}, ...parcial };
}

const nada: Aplicado = {
  etapaDe: null,
  etapaPara: null,
  visitaAntes: null,
  visitaDepois: null,
  tentativaContada: false,
  retornoMarcado: false,
};

describe("planejarEfeitos", () => {
  it("o relato não leva o lead para trás no funil", () => {
    const e = planejarEfeitos({
      leitura: leitura({ etapa: "em_conversa" }),
      lead: { etapa: "proposta", visitaAgendadaEm: null },
      envio: null,
      corrigido: null,
      agora: AGORA,
    });
    expect(e.etapa).toBeNull();
  });

  it("fechado não sai de fechado, nem para perdido", () => {
    const e = planejarEfeitos({
      leitura: leitura({ etapa: "perdido", motivoPerda: "desistiu" }),
      lead: { etapa: "fechado", visitaAgendadaEm: null },
      envio: null,
      corrigido: null,
      agora: AGORA,
    });
    expect(e.etapa).toBeNull();
  });

  it("perdido vale de qualquer etapa antes de fechado", () => {
    const e = planejarEfeitos({
      leitura: leitura({ etapa: "perdido", motivoPerda: "desistiu" }),
      lead: { etapa: "proposta", visitaAgendadaEm: null },
      envio: null,
      corrigido: null,
      agora: AGORA,
    });
    expect(e.etapa).toEqual({ de: "proposta", para: "perdido" });
  });

  it("atendeu num aviso já respondido: não remarca o retorno", () => {
    const e = planejarEfeitos({
      leitura: leitura({}),
      lead: { etapa: "em_conversa", visitaAgendadaEm: null },
      envio: { tentativas: 0, retornoEm: "2026-10-25T10:00:00.000Z" },
      corrigido: null,
      agora: AGORA,
    });
    expect(e.retornoEm).toBeUndefined();
    expect(e.aplicado.retornoMarcado).toBe(false);
  });

  it("correção de 'não atendeu' para 'atendeu': desconta a tentativa e marca o retorno", () => {
    const e = planejarEfeitos({
      leitura: leitura({}),
      lead: { etapa: "novo", visitaAgendadaEm: null },
      envio: { tentativas: 2, retornoEm: null },
      corrigido: { ...nada, tentativaContada: true },
      agora: AGORA,
    });
    expect(e.tentativas).toBe(1);
    expect(e.retornoEm).toBe(AGORA.toISOString());
  });

  it("correção de 'atendeu' para 'não atendeu': tira o retorno que o anterior marcou e conta a tentativa", () => {
    const e = planejarEfeitos({
      leitura: leitura({ resultado: "nao_atendeu" }),
      lead: { etapa: "novo", visitaAgendadaEm: null },
      envio: { tentativas: 0, retornoEm: "2026-10-26T14:00:00.000Z" },
      corrigido: { ...nada, retornoMarcado: true },
      agora: AGORA,
    });
    expect(e.retornoEm).toBeNull();
    expect(e.tentativas).toBe(1);
    expect(e.tentativa).toBe(1);
  });

  it("correção que repete a visita e a etapa: nada muda, e a origem do retorno anterior é preservada", () => {
    const e = planejarEfeitos({
      leitura: leitura({ etapa: "visita_agendada", visitaEm: "2026-10-31T13:00:00.000Z" }),
      lead: { etapa: "visita_agendada", visitaAgendadaEm: "2026-10-31T13:00:00+00:00" },
      envio: null,
      corrigido: {
        ...nada,
        etapaDe: "novo",
        etapaPara: "visita_agendada",
        visitaAntes: null,
        visitaDepois: "2026-10-31T13:00:00.000Z",
      },
      agora: AGORA,
    });
    expect(e.etapa).toBeNull();
    expect(e.visita).toBeNull();
    expect(e.aplicado).toMatchObject({ etapaDe: "novo", etapaPara: "visita_agendada", visitaAntes: null });
  });

  it("aplicadoGuardado lê o jsonb com defesa", () => {
    expect(aplicadoGuardado(null)).toBeNull();
    expect(aplicadoGuardado({ escolha: 1 })).toBeNull();
    expect(aplicadoGuardado({ aplicado: { etapaDe: "inventada", tentativaContada: true } })).toEqual({
      ...nada,
      tentativaContada: true,
    });
  });
});
