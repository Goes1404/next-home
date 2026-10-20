import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * As páginas por token (espelho do parceiro, contador) usam a marca do grupo
 * DONO do token, não a do endereço em que o link foi aberto (revisão da
 * fase 3). Antes, o contador da Imobiliária B lia "Contabilidade da Next
 * Home" em cima dos meses de B, porque o painel monta o link no endereço da
 * Next Home.
 */

vi.mock("server-only", () => ({}));

const { marcaDoGrupoDoLink, enderecoCertoDoLink } = await import("./marcaDoLink");
const { marcaDoGrupo } = await import("./marca");
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");

const B = "22222222-2222-2222-2222-222222222222";

const siteDaCasa = {
  grupoId: GRUPO_NEXT_HOME_ID,
  host: "www.nexthomeimoveis.com",
  marca: marcaDoGrupo({ grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: "https://www.nexthomeimoveis.com" }),
};
const siteDeB = {
  grupoId: B,
  host: "imobiliariab.com.br",
  marca: marcaDoGrupo({ grupoId: B, nome: "Imobiliária B", url: "https://imobiliariab.com.br" }),
};

/** Cliente falso: responde às duas leituras pelo grupo pedido. */
function clienteFalso(nome: string, host: string | null) {
  const lidos: { tabela: string; filtros: [string, unknown][] }[] = [];
  return {
    lidos,
    cliente: {
      from(tabela: string) {
        const filtros: [string, unknown][] = [];
        lidos.push({ tabela, filtros });
        const q = {
          select: () => q,
          eq: (c: string, v: unknown) => {
            filtros.push([c, v]);
            return q;
          },
          maybeSingle: async () => ({
            data: tabela === "grupos" ? { nome } : host ? { host } : null,
            error: null,
          }),
        };
        return q;
      },
    },
  };
}

describe("marcaDoGrupoDoLink", () => {
  it("link do grupo B aberto no endereço da Next Home: a marca é a de B, lida pelo grupo do token", async () => {
    const { cliente, lidos } = clienteFalso("Imobiliária B", "imobiliariab.com.br");
    const marca = await marcaDoGrupoDoLink(cliente as never, B, siteDaCasa);
    expect(marca).toMatchObject({ grupoId: B, ehNextHome: false, nome: "Imobiliária B", url: "https://imobiliariab.com.br" });
    for (const l of lidos) expect(l.filtros.some(([, v]) => v === B), l.tabela).toBe(true);
    // E o visitante é levado ao site de B, para o cabeçalho também ser dele.
    expect(enderecoCertoDoLink(marca, siteDaCasa, "/contador/abc")).toBe("https://imobiliariab.com.br/contador/abc");
  });

  it("link da Next Home aberto no site de B: a marca é a da Next Home", async () => {
    const { cliente, lidos } = clienteFalso("ignorado", null);
    const marca = await marcaDoGrupoDoLink(cliente as never, GRUPO_NEXT_HOME_ID, siteDeB);
    expect(marca.ehNextHome).toBe(true);
    expect(lidos).toEqual([]);
    expect(enderecoCertoDoLink(marca, siteDeB, "/parceiro/x")).toMatch(/^https:\/\/.+\/parceiro\/x$/);
  });

  it("mesmo grupo: a marca do endereço, sem consulta nem redirecionamento", async () => {
    const { cliente, lidos } = clienteFalso("x", null);
    const marca = await marcaDoGrupoDoLink(cliente as never, B, siteDeB);
    expect(marca).toBe(siteDeB.marca);
    expect(lidos).toEqual([]);
    expect(enderecoCertoDoLink(marca, siteDeB, "/parceiro/x")).toBeNull();
  });

  it("grupo sem endereço próprio: a página abre onde está, com a marca dele", async () => {
    const { cliente } = clienteFalso("Corretor C", null);
    const marca = await marcaDoGrupoDoLink(cliente as never, B, siteDaCasa);
    expect(marca.nome).toBe("Corretor C");
    expect(enderecoCertoDoLink(marca, siteDaCasa, "/contador/abc")).toBeNull();
  });
});

describe("as páginas por token usam a marca do grupo do token", () => {
  for (const pagina of ["parceiro/[token]/page.tsx", "contador/[token]/page.tsx"]) {
    it(pagina, () => {
      const fonte = readFileSync(join(process.cwd(), "src", "app", "s", "[site]", "(institucional)", ...pagina.split("/")), "utf8");
      expect(fonte).toContain("marcaDoGrupoDoLink(");
      expect(fonte).toContain("enderecoCertoDoLink(");
      // A marca do endereço não pode mais ser a da página.
      expect(fonte).not.toMatch(/const \{ marca \} = await siteDaPagina/);
    });
  }
});
