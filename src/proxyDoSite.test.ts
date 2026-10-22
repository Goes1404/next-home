import { describe, expect, it, vi } from "vitest";

/**
 * O proxy leva cada página pública para o segmento do site (`/s/<host>/…`)
 * sem consultar o banco: o host vira parte do caminho, e o layout do segmento
 * decide de que grupo ele é. Painel, plataforma, login e o porteiro do
 * WhatsApp ficam onde estão.
 */

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "u" } } }) } }),
}));

const { proxy } = await import("@/proxy");
const { NextRequest } = await import("next/server");

async function reescrita(caminho: string, host = "www.nexthomeimoveis.com"): Promise<string | null> {
  const req = new NextRequest(new URL(caminho, `https://${host}`), { headers: { host } });
  const r = await proxy(req);
  const destino = r.headers.get("x-middleware-rewrite");
  if (!destino) return null;
  const url = new URL(destino);
  return url.pathname + url.search;
}

describe("proxy e o site de cada endereço", () => {
  it("leva a página pública para o segmento do host, com a query", async () => {
    expect(await reescrita("/")).toBe("/s/www.nexthomeimoveis.com");
    expect(await reescrita("/portfolio")).toBe("/s/www.nexthomeimoveis.com/portfolio");
    expect(await reescrita("/empreendimentos")).toBe("/s/www.nexthomeimoveis.com/empreendimentos");
    expect(await reescrita("/sobre")).toBe("/s/www.nexthomeimoveis.com/sobre");
    expect(await reescrita("/empreendimentos?bairro=Alphaville")).toBe(
      "/s/www.nexthomeimoveis.com/empreendimentos?bairro=Alphaville",
    );
    expect(await reescrita("/regioes/alphaville", "imobsol.com.br")).toBe("/s/imobsol.com.br/regioes/alphaville");
  });

  it("normaliza o host: minúsculas e sem porta", async () => {
    expect(await reescrita("/", "LOCALHOST:3000")).toBe("/s/localhost");
  });

  it("host que não é nome de host vai para o segmento neutro", async () => {
    expect(await reescrita("/sobre", "exemplo.com/../x")).toBe("/s/desconhecido/sobre");
  });

  it("um /s/... vindo de fora não atravessa para o site de outro endereço", async () => {
    expect(await reescrita("/s/imobsol.com.br/sobre")).toBe("/s/www.nexthomeimoveis.com/s/imobsol.com.br/sobre");
  });

  it("painel, plataforma, login e porteiro do WhatsApp não são reescritos", async () => {
    expect(await reescrita("/corretor/leads")).toBeNull();
    expect(await reescrita("/corretor")).toBeNull();
    expect(await reescrita("/plataforma")).toBeNull();
    expect(await reescrita("/auth/confirmar")).toBeNull();
    expect(await reescrita("/wa")).toBeNull();
    expect(await reescrita("/wa/eternity-alphaville")).toBeNull();
  });

  it("/corretores e /waxxx são páginas públicas (fronteira de segmento)", async () => {
    expect(await reescrita("/corretores")).toBe("/s/www.nexthomeimoveis.com/corretores");
    expect(await reescrita("/corretores/bruna")).toBe("/s/www.nexthomeimoveis.com/corretores/bruna");
  });

  it("o link pessoal na raiz continua indo para o portfólio com o cookie", async () => {
    const req = new NextRequest(new URL("/?corretor=bruna", "https://www.nexthomeimoveis.com"), {
      headers: { host: "www.nexthomeimoveis.com" },
    });
    const r = await proxy(req);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/portfolio");
    expect(r.cookies.get("corretor_ativo")?.value).toBe("bruna");
  });

  it("link pessoal em página profunda grava o cookie E reescreve", async () => {
    const req = new NextRequest(new URL("/empreendimentos/x?corretor=bruna", "https://www.nexthomeimoveis.com"), {
      headers: { host: "www.nexthomeimoveis.com" },
    });
    const r = await proxy(req);
    expect(new URL(r.headers.get("x-middleware-rewrite")!).pathname).toBe("/s/www.nexthomeimoveis.com/empreendimentos/x");
    expect(r.cookies.get("corretor_ativo")?.value).toBe("bruna");
  });
});

describe("o matcher do proxy", async () => {
  const { config } = await import("@/proxy");
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
  const passa = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it("um /s/<host com ponto>/... vindo de fora passa pelo proxy (e é reescrito)", () => {
    // A regra geral exclui caminho com ponto; sem a entrada própria de `/s/`,
    // `/s/imobsol.com.br/sobre` chegaria direto ao site de outro grupo
    // debaixo de qualquer domínio — foi o que a medição local mostrou.
    expect(passa("/s/imobsol.com.br/sobre")).toBe(true);
    expect(passa("/s/www.nexthomeimoveis.com")).toBe(true);
  });

  it("páginas passam; arquivos e api não", () => {
    expect(passa("/sobre")).toBe(true);
    expect(passa("/")).toBe(true);
    expect(passa("/sitemap.xml")).toBe(false);
    expect(passa("/api/leads")).toBe(false);
    expect(passa("/_next/static/x.js")).toBe(false);
  });
});

describe("proxy e o endereço só do CRM (astroimob.vercel.app)", () => {
  const CRM = "astroimob.vercel.app";

  async function localizacao(caminho: string): Promise<string | null> {
    const req = new NextRequest(new URL(caminho, `https://${CRM}`), { headers: { host: CRM } });
    const r = await proxy(req);
    const alvo = r.headers.get("location");
    return alvo ? new URL(alvo).pathname : null;
  }

  it("página do site vai para o painel", async () => {
    expect(await localizacao("/")).toBe("/corretor");
    expect(await localizacao("/sobre")).toBe("/corretor");
    expect(await localizacao("/empreendimentos/dom-barueri")).toBe("/corretor");
  });

  it("as páginas de token que o cliente recebe abrem ali mesmo", async () => {
    for (const caminho of [
      "/selecao/abc",
      "/selecao/abc/ir/dom-barueri",
      "/documentos/abc",
      "/proposta/abc",
      "/portal/abc",
      "/contador/abc",
      "/parceiro/abc",
    ]) {
      expect(await localizacao(caminho), caminho).toBeNull();
      expect(await reescrita(caminho, CRM), caminho).toBe(`/s/${CRM}${caminho}`);
    }
  });

  it("a ficha pública do imóvel (/imovel/<grupo>/<slug>) abre no endereço do painel, sem reescrita", async () => {
    expect(await localizacao("/imovel/imobsol/vitra")).toBeNull();
    expect(await reescrita("/imovel/imobsol/vitra?c=ana", CRM)).toBeNull();
    // Em qualquer endereço ela também não é página do site.
    expect(await reescrita("/imovel/imobsol/vitra", "www.nexthomeimoveis.com")).toBeNull();
    // A fronteira é de segmento: /imoveis continua sendo do site.
    expect(await localizacao("/imoveis")).toBe("/corretor");
  });

  it("a raiz de uma rota de token, sem token, continua indo para o painel", async () => {
    expect(await localizacao("/selecao")).toBe("/corretor");
    expect(await localizacao("/selecao/")).toBe("/corretor");
    expect(await localizacao("/documentosx/abc")).toBe("/corretor");
  });
});
