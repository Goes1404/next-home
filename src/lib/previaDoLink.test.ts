import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHAMADA_PADRAO,
  LIMITE_CHAMADA_DO_LINK,
  descricaoDaPrevia,
  metadataDoPortfolio,
  tituloDaPrevia,
  validarChamadaDoLink,
} from "./previaDoLink";
import { proxy } from "@/proxy";
import { site } from "./site";

/** Junta tudo o que a prévia mostra, para procurar texto proibido. */
function textosDaPrevia(m: ReturnType<typeof metadataDoPortfolio>): string {
  return JSON.stringify([m.title, m.description, m.openGraph, m.twitter]);
}

describe("prévia do link do portfólio (0188)", () => {
  it("sem texto próprio: título com o nome do corretor e 'Portfólio de produtos'", () => {
    const m = metadataDoPortfolio({ nome: "Bruna Souza", chamadaDoLink: null });
    expect(m.title).toEqual({ absolute: "Portfólio de Bruna Souza" });
    expect(m.description).toBe("Portfólio de produtos");
    expect(m.openGraph?.title).toBe("Portfólio de Bruna Souza");
    expect(m.openGraph?.description).toBe("Portfólio de produtos");
    expect(m.twitter?.description).toBe("Portfólio de produtos");
  });

  it("sem corretor: portfólio da imobiliária", () => {
    const m = metadataDoPortfolio(null);
    expect(m.openGraph?.title).toBe(`Portfólio da ${site.nome}`);
    expect(m.openGraph?.description).toBe(CHAMADA_PADRAO);
  });

  it("com texto próprio: ele vai na descrição, no OG e no Twitter", () => {
    const m = metadataDoPortfolio({ nome: "Bruna", chamadaDoLink: "Lançamentos em Barueri a partir de 2 dorms" });
    expect(m.description).toBe("Lançamentos em Barueri a partir de 2 dorms");
    expect(m.openGraph?.description).toBe("Lançamentos em Barueri a partir de 2 dorms");
    expect(m.twitter?.description).toBe("Lançamentos em Barueri a partir de 2 dorms");
  });

  it("texto vazio ou só espaço não aparece: vale o padrão", () => {
    expect(descricaoDaPrevia({ nome: "Bruna", chamadaDoLink: "" })).toBe(CHAMADA_PADRAO);
    expect(descricaoDaPrevia({ nome: "Bruna", chamadaDoLink: "   \n  " })).toBe(CHAMADA_PADRAO);
    expect(descricaoDaPrevia({ nome: "Bruna" })).toBe(CHAMADA_PADRAO);
  });

  it("nome vazio não vira 'Portfólio de '", () => {
    expect(tituloDaPrevia({ nome: "  " })).toBe(`Portfólio da ${site.nome}`);
  });

  it("nenhuma prévia padrão fala em alto padrão", () => {
    for (const c of [null, { nome: "Bruna" }]) {
      expect(textosDaPrevia(metadataDoPortfolio(c)).toLowerCase()).not.toContain("alto padr");
    }
  });

  it("continua noindex", () => {
    expect(metadataDoPortfolio(null).robots).toEqual({ index: false, follow: true });
  });
});

describe("validação do texto da prévia", () => {
  it("aceita até o limite, com espaços normalizados", () => {
    const r = validarChamadaDoLink(`  ${"a".repeat(LIMITE_CHAMADA_DO_LINK)}  `);
    expect(r).toEqual({ valor: "a".repeat(LIMITE_CHAMADA_DO_LINK) });
    expect(validarChamadaDoLink("Meus   imóveis\nem Barueri")).toEqual({ valor: "Meus imóveis em Barueri" });
  });

  it("recusa acima de 160 caracteres", () => {
    const r = validarChamadaDoLink("a".repeat(LIMITE_CHAMADA_DO_LINK + 1));
    expect("erro" in r).toBe(true);
  });

  it("vazio grava nulo (volta ao padrão)", () => {
    expect(validarChamadaDoLink("")).toEqual({ valor: null });
    expect(validarChamadaDoLink("   ")).toEqual({ valor: null });
  });

  it("o limite é o mesmo do CHECK da migration", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "0188_chamada_do_link_do_corretor.sql"),
      "utf8",
    );
    expect(sql).toContain(`between 1 and ${LIMITE_CHAMADA_DO_LINK}`);
    expect(sql).toMatch(/grant update \(chamada_do_link\) on public\.corretores to authenticated/);
    expect(sql).toMatch(/grant select \(chamada_do_link\) on public\.corretores to anon/);
  });
});

describe("o link do corretor leva o slug até /portfolio", () => {
  it("o redirect preserva ?corretor= (o robô do WhatsApp não guarda cookie)", async () => {
    const r = await proxy(new NextRequest("https://exemplo.test/?corretor=bruna&origem=ig"));
    const destino = new URL(r.headers.get("location")!);
    expect(destino.pathname).toBe("/portfolio");
    expect(destino.searchParams.get("corretor")).toBe("bruna");
    expect(destino.searchParams.get("origem")).toBe("ig");
    expect(r.cookies.get("corretor_ativo")?.value).toBe("bruna");
  });
});
