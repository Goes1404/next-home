import { describe, expect, it } from "vitest";
import { escolherExemplos, pontuarRelevancia, termosDoAssunto, type ConversaCandidata } from "./recuperacao";
import type { Empreendimento } from "@/lib/types";

const HOJE = new Date(2026, 7, 22, 12, 0);
const ontem = new Date(HOJE.getTime() - 86_400_000).toISOString();

function conversa(p: Partial<ConversaCandidata> & { conversaId: string }): ConversaCandidata {
  return {
    leadEtapa: "novo",
    texto: "",
    falasDoCliente: 3,
    atualizadaEm: ontem,
    ...p,
  };
}

const catalogo = [
  { nome: "Vitra Alphaville", bairro: "Dezoito do Forte" },
  { nome: "Viva Vila do Conde", bairro: "Parque Viana" },
] as Empreendimento[];

describe("Descobrir o assunto da conversa de agora", () => {
  it("pega o imóvel citado pelo cliente", () => {
    const termos = termosDoAssunto({ mensagemAtual: "queria saber do Vitra Alphaville", catalogo });
    expect(termos).toContain("vitra alphaville");
  });

  it("pega também pelo histórico, não só pela última mensagem", () => {
    const termos = termosDoAssunto({
      mensagemAtual: "e o preço?",
      historico: [{ texto: "me fala do Viva Vila do Conde" }],
      catalogo,
    });
    expect(termos).toContain("viva vila do conde");
  });

  it("conversa genérica não inventa assunto", () => {
    expect(termosDoAssunto({ mensagemAtual: "oi, tudo bem?", catalogo })).toEqual([]);
  });
});

describe("Relevância vence recência", () => {
  it("conversa sobre o MESMO imóvel ganha de uma recente sobre outro", () => {
    // O defeito do critério antigo: recuperar por data trazia a conversa
    // que estava por perto, não a que ajuda.
    const mesmoAssunto = conversa({
      conversaId: "a",
      texto: "cliente perguntou do vitra alphaville e agendou",
      atualizadaEm: new Date(HOJE.getTime() - 20 * 86_400_000).toISOString(),
    });
    const recenteOutroAssunto = conversa({
      conversaId: "b",
      texto: "falamos do viva vila do conde em osasco",
      atualizadaEm: HOJE.toISOString(),
    });

    const termos = ["vitra alphaville"];
    expect(pontuarRelevancia(mesmoAssunto, termos, HOJE)).toBeGreaterThan(
      pontuarRelevancia(recenteOutroAssunto, termos, HOJE),
    );
  });

  it("conversão continua pesando muito, mas não é mais filtro", () => {
    // Antes, lead que não converteu era invisível — e com 30 leads novos em
    // "novo", isso deixava o aprendizado sem corpus nenhum.
    const naoConvertida = conversa({ conversaId: "a", leadEtapa: "novo", falasDoCliente: 5 });
    expect(pontuarRelevancia(naoConvertida, [], HOJE)).toBeGreaterThan(0);

    const convertida = conversa({ conversaId: "b", leadEtapa: "fechado", falasDoCliente: 5 });
    expect(pontuarRelevancia(convertida, [], HOJE)).toBeGreaterThan(
      pontuarRelevancia(naoConvertida, [], HOJE),
    );
  });

  it("monólogo do bot pontua menos que troca de verdade", () => {
    const monologo = conversa({ conversaId: "a", falasDoCliente: 1 });
    const troca = conversa({ conversaId: "b", falasDoCliente: 6 });
    expect(pontuarRelevancia(troca, [], HOJE)).toBeGreaterThan(pontuarRelevancia(monologo, [], HOJE));
  });
});

describe("Escolha final dos exemplos", () => {
  it("descarta conversa sem troca — não ensina condução nenhuma", () => {
    const escolhidos = escolherExemplos(
      [conversa({ conversaId: "so-uma-fala", falasDoCliente: 1 }), conversa({ conversaId: "boa" })],
      [],
      3,
      HOJE,
    );
    expect(escolhidos.map((c) => c.conversaId)).toEqual(["boa"]);
  });

  it("respeita o limite pedido", () => {
    const muitas = Array.from({ length: 10 }, (_, i) => conversa({ conversaId: `c${i}` }));
    expect(escolherExemplos(muitas, [], 3, HOJE)).toHaveLength(3);
  });
});
