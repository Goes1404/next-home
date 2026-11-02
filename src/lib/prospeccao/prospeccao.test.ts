import { describe, expect, it } from "vitest";
import { linkDaAmostra, linkDoWhatsapp, mensagemPadrao, normalizarWhatsapp, slugDaLoja } from "./abordagem";
import { ordenarParaOFunil, proximaAcao, temperatura } from "./funil";
import { lerPedidoDeVisita } from "./visita";

describe("abordagem", () => {
  it("monta o slug sem acento", () => {
    expect(slugDaLoja("Perfumaria Carícia — Fazendinha")).toBe("perfumaria-caricia-fazendinha");
    expect(slugDaLoja("***")).toBe("loja");
  });

  it("normaliza o WhatsApp com DDI", () => {
    expect(normalizarWhatsapp("(11) 94554-4766")).toBe("5511945544766");
    expect(normalizarWhatsapp("+55 11 94554-4766")).toBe("5511945544766");
    expect(normalizarWhatsapp("123")).toBeNull();
  });

  it("põe o gancho no meio da mensagem, sem ponto duplo", () => {
    const m = mensagemPadrao({ nome: "Royal", gancho: "a loja não aparece no Google.", link: "https://x/astro/amostra/royal", vendedor: "Eduardo" });
    expect(m).toContain("Aqui é o Eduardo, da Astro Soluções");
    expect(m).toContain("A loja não aparece no Google. Por isso montamos");
    expect(m).toContain("https://x/astro/amostra/royal");
  });

  it("monta os links", () => {
    expect(linkDaAmostra("royal", "https://astroimob.vercel.app/")).toBe("https://astroimob.vercel.app/astro/amostra/royal");
    expect(linkDoWhatsapp("+55 11 9", "oi tudo")).toBe("https://wa.me/55119?text=oi%20tudo");
  });
});

describe("funil", () => {
  const agora = new Date("2026-11-05T12:00:00Z");
  const base = { etapa: "enviado", nao_contatar: false, enviado_em: "2026-11-02T22:00:00Z", ultima_visita_em: null, visitas: 0, updated_at: "2026-11-02T22:00:00Z" };

  it("quem abriu há pouco é quente", () => {
    expect(temperatura({ ...base, ultima_visita_em: "2026-11-04T10:00:00Z", visitas: 1 }, agora)).toBe("quente");
    expect(temperatura({ ...base, ultima_visita_em: "2026-10-30T10:00:00Z", visitas: 1 }, agora)).toBe("morna");
    expect(temperatura(base, agora)).toBe("fria");
    expect(temperatura({ ...base, etapa: "respondeu" }, agora)).toBe("parada");
    expect(temperatura({ ...base, nao_contatar: true }, agora)).toBe("parada");
  });

  it("pede o follow-up depois de 3 dias sem abrir", () => {
    expect(proximaAcao(base, new Date("2026-11-06T12:00:00Z"))).toBe("Não abriu: mandar o follow-up");
    expect(proximaAcao(base, new Date("2026-11-03T12:00:00Z"))).toBe("Aguardando abrir a amostra");
  });

  it("ordena os quentes primeiro", () => {
    const fria = { ...base, nome: "fria", updated_at: "2026-11-05T00:00:00Z" };
    const quente = { ...base, nome: "quente", ultima_visita_em: "2026-11-04T10:00:00Z", visitas: 2 };
    expect(ordenarParaOFunil([fria, quente], agora).map((l) => l.nome)).toEqual(["quente", "fria"]);
  });
});

describe("pedido de visita", () => {
  it("aceita abertura e tempo, recusa o resto", () => {
    expect(lerPedidoDeVisita('{"slug":"royal-barueri","dispositivo":"celular"}')).toEqual({ tipo: "abertura", slug: "royal-barueri", dispositivo: "celular" });
    expect(lerPedidoDeVisita('{"id":"7b743a2b-abb1-4c2d-9f3e-0123456789ab","segundos":42.7}')).toEqual({ tipo: "tempo", id: "7b743a2b-abb1-4c2d-9f3e-0123456789ab", segundos: 42 });
    expect(lerPedidoDeVisita('{"slug":"../x"}')).toBeNull();
    expect(lerPedidoDeVisita('{"id":"nao-e-uuid","segundos":1}')).toBeNull();
    expect(lerPedidoDeVisita("lixo")).toBeNull();
  });
});
