import { describe, expect, it } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import {
  enderecoDoCliente,
  enderecoDoPainel,
  hostDoEndereco,
  linkDoPainel,
  marcaDoCrm,
  MARCA_NEXT_HOME,
  NOME_SEM_LEITURA,
  PAINEL_URL_PADRAO,
} from "./marca";

const OUTRO = "22222222-2222-2222-2222-222222222222";

describe("marca do grupo 1 (Next Home): nada muda", () => {
  it("as palavras e o logotipo de sempre, venha o que vier do banco", () => {
    expect(MARCA_NEXT_HOME.nome).toBe("Next Home");
    expect(MARCA_NEXT_HOME.nomeCompleto).toBe("Next Home Negócios Imobiliários");
    expect(MARCA_NEXT_HOME.wordmark).toEqual(["Next", "Home"]);
    expect(MARCA_NEXT_HOME.logoUrl).toBeNull();
    expect(marcaDoCrm(GRUPO_NEXT_HOME_ID, null)).toBe(MARCA_NEXT_HOME);
    // Nem o nome da casa da IA nem uma logo gravada trocam a marca da Next Home.
    expect(
      marcaDoCrm(GRUPO_NEXT_HOME_ID, { nome: "Outro Nome", ia_nome_da_casa: "Outra Casa", logo_url: "https://x.com/l.png" }),
    ).toBe(MARCA_NEXT_HOME);
  });

  it("os links são os de sempre: site.url, nunca PAINEL_URL nem o site cadastrado", () => {
    const base = site.url.replace(/\/+$/, "");
    expect(enderecoDoPainel(GRUPO_NEXT_HOME_ID, "https://outro.exemplo.com")).toBe(base);
    expect(enderecoDoPainel(GRUPO_NEXT_HOME_ID)).toBe(base);
    expect(linkDoPainel(GRUPO_NEXT_HOME_ID, "/corretor/leads/1", "https://outro.exemplo.com")).toBe(
      `${site.url}/corretor/leads/1`,
    );
    expect(enderecoDoCliente(GRUPO_NEXT_HOME_ID, "www.nexthomeimoveis.com")).toBe(base);
    expect(enderecoDoCliente(GRUPO_NEXT_HOME_ID, null, "https://outro.exemplo.com")).toBe(base);
  });

  it("o domínio da Next Home continua sendo o do link", () => {
    // O link que o WhatsApp e o painel já mandaram aponta para site.url: o
    // teste falha se alguém trocar a regra do grupo 1 sem querer.
    expect(enderecoDoPainel(GRUPO_NEXT_HOME_ID)).toBe(process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://next-home-drab.vercel.app");
  });
});

describe("marca de outro grupo", () => {
  it("o nome da casa da IA vence o nome do grupo; sem ele vale o nome do grupo", () => {
    expect(marcaDoCrm(OUTRO, { nome: "Imobiliária Sol", ia_nome_da_casa: "Sol Imóveis", logo_url: null }).nome).toBe("Sol Imóveis");
    expect(marcaDoCrm(OUTRO, { nome: "Imobiliária Sol", ia_nome_da_casa: null, logo_url: null }).nome).toBe("Imobiliária Sol");
    expect(marcaDoCrm(OUTRO, { nome: "Imobiliária Sol", ia_nome_da_casa: "  ", logo_url: null }).nome).toBe("Imobiliária Sol");
  });

  it("sem leitura, o nome genérico (nunca o da Next Home)", () => {
    const m = marcaDoCrm(OUTRO, null);
    expect(m.nome).toBe(NOME_SEM_LEITURA);
    expect(m.ehNextHome).toBe(false);
    expect([m.nome, m.nomeCompleto, ...m.wordmark].join(" ")).not.toMatch(/Next ?Home/);
  });

  it("a logo é a do grupo se houver; só https vale", () => {
    expect(marcaDoCrm(OUTRO, { nome: "Sol", ia_nome_da_casa: null, logo_url: "https://x.supabase.co/a.png" }).logoUrl).toBe(
      "https://x.supabase.co/a.png",
    );
    for (const ruim of [null, "", "http://x.com/a.png", "javascript:alert(1)", "data:image/png;base64,AA"]) {
      expect(marcaDoCrm(OUTRO, { nome: "Sol", ia_nome_da_casa: null, logo_url: ruim }).logoUrl, String(ruim)).toBeNull();
    }
  });

  it("o nome escrito parte o nome em [nome, ''] (sem destaque inventado)", () => {
    expect(marcaDoCrm(OUTRO, { nome: "Sol", ia_nome_da_casa: null, logo_url: null }).wordmark).toEqual(["Sol", ""]);
  });
});

describe("endereço do painel", () => {
  it("outro grupo: PAINEL_URL, ou o endereço só do CRM por padrão", () => {
    expect(enderecoDoPainel(OUTRO, undefined)).toBe(PAINEL_URL_PADRAO);
    expect(PAINEL_URL_PADRAO).toBe("https://astroimob.vercel.app");
    expect(enderecoDoPainel(OUTRO, "https://crm.exemplo.com/")).toBe("https://crm.exemplo.com");
    expect(enderecoDoPainel(OUTRO, "lixo")).toBe(PAINEL_URL_PADRAO);
    expect(enderecoDoPainel(OUTRO, "")).toBe(PAINEL_URL_PADRAO);
    expect(linkDoPainel(OUTRO, "/corretor/leads/9", undefined)).toBe("https://astroimob.vercel.app/corretor/leads/9");
  });

  it("nunca leva o corretor de outro grupo ao endereço da Next Home", () => {
    expect(enderecoDoPainel(OUTRO)).not.toContain(hostDoEndereco(site.url));
  });
});

describe("endereço dos links do cliente", () => {
  it("outro grupo: o site principal dele; sem site, o painel", () => {
    expect(enderecoDoCliente(OUTRO, "imobsol.com.br")).toBe("https://imobsol.com.br");
    expect(enderecoDoCliente(OUTRO, "WWW.ImobSol.com.br")).toBe("https://www.imobsol.com.br");
    expect(enderecoDoCliente(OUTRO, null, undefined)).toBe(PAINEL_URL_PADRAO);
    expect(enderecoDoCliente(OUTRO, "", "https://crm.exemplo.com")).toBe("https://crm.exemplo.com");
  });

  it("host torto não vira link", () => {
    expect(enderecoDoCliente(OUTRO, "x.com/../evil", undefined)).toBe(PAINEL_URL_PADRAO);
    expect(enderecoDoCliente(OUTRO, "x.com@evil.com", undefined)).toBe(PAINEL_URL_PADRAO);
  });
});

describe("hostDoEndereco", () => {
  it("lê o host de um endereço", () => {
    expect(hostDoEndereco("https://astroimob.vercel.app/x")).toBe("astroimob.vercel.app");
    expect(hostDoEndereco("semurl")).toBe("semurl");
  });
});
