import { describe, expect, it } from "vitest";
import { ARTIGOS_DE_AJUDA, artigoPorSlug } from "./artigos";
import { buscarArtigos, normalizarParaBusca } from "./busca";

/**
 * A central de ajuda (29/10/2026): os artigos pedidos existem, são neutros
 * de ramo quando não avisam o contrário, e a busca acha o que a pessoa
 * digita do jeito que digita (sem acento, palavra solta, sinônimo comum).
 */

const slugs = (consulta: string) => buscarArtigos(ARTIGOS_DE_AJUDA, consulta).map((a) => a.slug);

describe("os artigos", () => {
  it("são os doze pedidos, com endereço único", () => {
    expect(ARTIGOS_DE_AJUDA.map((a) => a.slug)).toEqual([
      "conectar-o-whatsapp",
      "avisos-no-celular",
      "importar-leads",
      "funil",
      "agenda",
      "roleta-de-leads",
      "convidar-a-equipe",
      "ia-de-atendimento",
      "listas-de-transmissao",
      "cobranca-e-pagamento",
      "trocar-a-senha",
      "suporte",
    ]);
    expect(new Set(ARTIGOS_DE_AJUDA.map((a) => a.slug)).size).toBe(ARTIGOS_DE_AJUDA.length);
    for (const a of ARTIGOS_DE_AJUDA) expect(a.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("cada um tem resumo curto e conteúdo", () => {
    for (const a of ARTIGOS_DE_AJUDA) {
      expect(a.resumo.length, a.slug).toBeLessThanOrEqual(120);
      expect(a.secoes.some((s) => (s.paragrafos?.length ?? 0) + (s.passos?.length ?? 0) > 0), a.slug).toBe(true);
    }
  });

  it("imóvel só aparece onde o texto avisa que é de imobiliária", () => {
    for (const a of ARTIGOS_DE_AJUDA) {
      for (const s of a.secoes) {
        for (const p of [...(s.paragrafos ?? []), ...(s.passos ?? [])]) {
          if (/imóve/i.test(p)) expect(p, a.slug).toMatch(/imobiliárias/i);
        }
      }
    }
  });

  it("artigoPorSlug acha e recusa", () => {
    expect(artigoPorSlug("funil")?.titulo).toBe("Usar o funil de vendas");
    expect(artigoPorSlug("nao-existe")).toBeNull();
  });
});

describe("a busca", () => {
  it("ignora acento e maiúscula", () => {
    expect(normalizarParaBusca("Notificação NO Celular!")).toBe("notificacao no celular");
    expect(slugs("notificacao")[0]).toBe("avisos-no-celular");
    expect(slugs("NOTIFICAÇÃO")[0]).toBe("avisos-no-celular");
  });

  it("acha pelas palavras de quem não sabe o nome do recurso", () => {
    expect(slugs("qr code")[0]).toBe("conectar-o-whatsapp");
    expect(slugs("boleto")[0]).toBe("cobranca-e-pagamento");
    expect(slugs("esqueci a senha")[0]).toBe("trocar-a-senha");
    expect(slugs("planilha excel")[0]).toBe("importar-leads");
    expect(slugs("robô")[0]).toBe("ia-de-atendimento");
    expect(slugs("disparo")[0]).toBe("listas-de-transmissao");
  });

  it("título pesa mais que o texto", () => {
    // "whatsapp" aparece em vários artigos; o que tem no título vem primeiro.
    expect(slugs("whatsapp")[0]).toBe("conectar-o-whatsapp");
  });

  it("todas as palavras precisam aparecer", () => {
    expect(slugs("boleto qr code")).toEqual([]);
    expect(slugs("palavrainexistente")).toEqual([]);
  });

  it("consulta vazia ou só de palavras vazias devolve todos, na ordem", () => {
    expect(slugs("")).toEqual(ARTIGOS_DE_AJUDA.map((a) => a.slug));
    expect(slugs("  como o de  ")).toEqual(ARTIGOS_DE_AJUDA.map((a) => a.slug));
  });
});
