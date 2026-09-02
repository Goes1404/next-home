import { describe, expect, it } from "vitest";
import {
  HORAS_PARA_AVISAR,
  MAXIMO_NA_LISTA,
  assuntoDoAviso,
  corpoDoAviso,
  medirEspera,
  tempoDeEspera,
} from "./quemEstaEsperando";

const AGORA = new Date("2026-09-02T18:00:00Z");
const hAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();

function pessoa(nome: string, horas: number) {
  return { nome, esperandoDesde: hAtras(horas), conversaId: `c-${nome}` };
}

describe("medirEspera", () => {
  it("ignora quem está esperando menos que o limiar", () => {
    // Abaixo de 4h não é atraso, é o intervalo normal de uma conversa. Sem
    // este corte o aviso chegaria todo dia e deixaria de ser lido.
    const r = medirEspera([pessoa("Ana", 1), pessoa("Beto", HORAS_PARA_AVISAR)], AGORA);
    expect(r.map((p) => p.nome)).toEqual(["Beto"]);
  });

  it("ordena do que espera há mais tempo para o que espera há menos", () => {
    const r = medirEspera([pessoa("Ana", 5), pessoa("Beto", 50), pessoa("Cida", 12)], AGORA);
    expect(r.map((p) => p.nome)).toEqual(["Beto", "Cida", "Ana"]);
  });

  it("devolve vazio quando ninguém passou do limiar — e é isso que cala o e-mail", () => {
    expect(medirEspera([pessoa("Ana", 1)], AGORA)).toEqual([]);
  });
});

describe("tempoDeEspera", () => {
  it("fala em horas até um dia e em dias depois", () => {
    expect(tempoDeEspera(1)).toBe("há 1 hora");
    expect(tempoDeEspera(6)).toBe("há 6 horas");
    expect(tempoDeEspera(23)).toBe("há 23 horas");
    expect(tempoDeEspera(24)).toBe("há 1 dia");
    expect(tempoDeEspera(50)).toBe("há 2 dias");
  });
});

describe("assuntoDoAviso", () => {
  it("com uma pessoa, o assunto é o nome dela", () => {
    expect(assuntoDoAviso(medirEspera([pessoa("Priscila", 50)], AGORA))).toBe(
      "Priscila espera resposta há 2 dias",
    );
  });

  it("com várias, é a contagem mais o PIOR caso — nunca 'resumo diário'", () => {
    // Assunto genérico é o que faz o e-mail não ser aberto, e e-mail não
    // aberto é igual a e-mail que não existe.
    const esperas = medirEspera([pessoa("Ana", 5), pessoa("Beto", 50)], AGORA);
    expect(assuntoDoAviso(esperas)).toBe("2 pessoas esperando — a mais antiga há 2 dias");
  });
});

describe("corpoDoAviso", () => {
  const url = "https://exemplo.test";

  it("lista todo mundo até o teto e resume o resto", () => {
    const muitas = Array.from({ length: MAXIMO_NA_LISTA + 3 }, (_, i) => pessoa(`P${i}`, 10 + i));
    const { texto, html } = corpoDoAviso({ esperas: medirEspera(muitas, AGORA), urlPainel: url });
    expect(texto).toContain("e mais 3 pessoas");
    expect(html).toContain("e mais 3 pessoas");
    // E o link do painel tem de estar montado de verdade: a primeira versão
    // deste teste passava o nome errado da prop com um `as never` por cima, e
    // passava — com a URL saindo como "undefined/corretor".
    expect(texto).toContain(`${url}/corretor`);
    expect(texto).not.toContain("undefined");
  });

  it("cada nome leva direto para a conversa daquela pessoa", () => {
    const { html } = corpoDoAviso({ esperas: medirEspera([pessoa("Ana", 9)], AGORA), urlPainel: url });
    expect(html).toContain(`${url}/corretor/conversas?c=c-Ana`);
  });

  it("escapa o nome, que vem do WhatsApp do cliente", () => {
    const bravo = { nome: "<script>x</script>", esperandoDesde: hAtras(9), conversaId: "c1" };
    const { html } = corpoDoAviso({ esperas: medirEspera([bravo], AGORA), urlPainel: url });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
