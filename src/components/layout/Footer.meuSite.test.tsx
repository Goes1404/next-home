import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { marcaDoGrupo } from "@/lib/sites/marca";
import { SITE_EM_BRANCO } from "@/lib/sites/siteEditavel";

/**
 * O rodapé com o "Meu site" (0209): o grupo 1 sai IGUAL com e sem campos
 * editados (o site da Next Home não lê os campos novos), e os outros grupos
 * mostram os contatos que editaram.
 */

vi.mock("@/components/motion/FundoEmCamadas", () => ({ FundoEmCamadas: () => null }));
vi.mock("@/components/tema/SeletorTema", () => ({ SeletorTema: () => null }));

const { Footer } = await import("./Footer");

const EDITADO = {
  ...SITE_EM_BRANCO,
  logoUrl: "https://x.supabase.co/logo.png",
  whatsapp: "5511999998888",
  email: "contato@sol.com.br",
  instagram: "https://www.instagram.com/sol/",
  endereco: { logradouro: "Av. Sol, 1", bairro: "Centro", cidade: "Barueri", uf: "SP", cep: "06404-326" },
  creci: "12345",
  creciTipo: "J" as const,
};

describe("Footer", () => {
  it("grupo 1: o HTML é byte a byte o mesmo, com ou sem campos de Meu site", () => {
    const entrada = { grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: "https://x.com.br" };
    const sem = renderToStaticMarkup(<Footer marca={marcaDoGrupo(entrada)} />);
    const com = renderToStaticMarkup(<Footer marca={marcaDoGrupo({ ...entrada, personalizacao: EDITADO })} />);
    expect(com).toBe(sem);
    expect(sem).not.toContain("mailto:");
    expect(sem).not.toContain("tel:");
    expect(sem).not.toContain("<img");
  });

  it("outro grupo: logo, WhatsApp da casa, e-mail, endereço e CRECI editados", () => {
    const html = renderToStaticMarkup(
      <Footer marca={marcaDoGrupo({ grupoId: "11111111-1111-1111-1111-111111111111", nome: "Imob Sol", url: "https://imobsol.com.br", personalizacao: EDITADO })} />,
    );
    expect(html).toContain('src="https://x.supabase.co/logo.png"');
    expect(html).toContain('href="tel:+5511999998888"');
    expect(html).toContain("(11) 99999-8888");
    expect(html).toContain('href="mailto:contato@sol.com.br"');
    expect(html).toContain("Av. Sol, 1");
    expect(html).toContain("CRECI 12345-J");
    expect(html).toContain("instagram.com/sol");
  });

  it("outro grupo sem nada preenchido: sem contato nenhum, como antes", () => {
    const html = renderToStaticMarkup(
      <Footer marca={marcaDoGrupo({ grupoId: "11111111-1111-1111-1111-111111111111", nome: "Imob Sol", url: "https://imobsol.com.br" })} />,
    );
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("<img");
  });
});
