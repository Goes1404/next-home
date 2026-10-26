import { describe, expect, it } from "vitest";
import type { DossieClienteIA } from "@/lib/whatsapp/types";
import { dossieComORelato, textoDoDossie } from "./dossie";
import type { LeituraDoRetorno } from "./leituraDoRetorno";

function leitura(fatos: LeituraDoRetorno["fatos"], extra: Partial<LeituraDoRetorno> = {}): LeituraDoRetorno {
  return { resultado: "atendeu", etapa: null, visitaEm: null, motivoPerda: null, resumo: null, proximoPasso: null, fatos, visitaRecusada: false, perdaSemMotivo: false, ...extra };
}

const atual = {
  leadId: "l",
  orcamentoMin: null,
  orcamentoMax: 500000,
  rendaMensal: null,
  regiaoInteresse: "Centro",
  dormitoriosMin: null,
  formaPagamento: null,
  perfilFamiliar: null,
  urgenciaMudanca: null,
  exigenciasEspecificas: ["pet_friendly", "varanda"],
  objecoesIdentificadas: ["preco"],
  temperaturaLabel: "morno",
  temperaturaScore: 55,
  resumoExecutivo: "Procura 2 quartos.",
  proximoPassoSugerido: null,
} as unknown as DossieClienteIA;

describe("dossieComORelato", () => {
  it("listas somam com as que já existiam, sem repetir", () => {
    const d = dossieComORelato("l", atual, leitura({ exigenciasEspecificas: ["usa_fgts", "varanda"] }))!;
    expect(d.exigenciasEspecificas).toEqual(["pet_friendly", "varanda", "usa_fgts"]);
    expect(d.objecoesIdentificadas).toEqual(["preco"]);
  });

  it("chave ausente não apaga, presente substitui", () => {
    const d = dossieComORelato("l", atual, leitura({ orcamentoMax: 600000 }))!;
    expect(d).toMatchObject({ orcamentoMax: 600000, regiaoInteresse: "Centro", resumoExecutivo: "Procura 2 quartos." });
  });

  it("relato sem nada para o dossiê não grava", () => {
    expect(dossieComORelato("l", atual, leitura({}))).toBeNull();
  });
});

describe("textoDoDossie", () => {
  it("a IA vê resumo, números e listas", () => {
    const t = textoDoDossie(atual)!;
    expect(t).toContain("Resumo: Procura 2 quartos.");
    expect(t).toContain("Exigências: pet_friendly, varanda");
    expect(t).toContain("Objeções: preco");
    expect(t).toContain("Região: Centro");
  });
});
