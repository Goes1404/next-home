import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Os links de convite e de recuperação apontam para o NOSSO domínio, com o
 * `token_hash` na query. O `action_link` do Supabase leva o token no
 * fragmento `#` (o servidor não lê) e depende do verificador PKCE gravado no
 * navegador que pediu — quem abre o e-mail no celular não tem esse
 * verificador.
 */

type Resposta = { data: unknown; error: unknown };
let resposta: Resposta;
const chamadas: unknown[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        generateLink: async (params: unknown) => {
          chamadas.push(params);
          return resposta;
        },
      },
    },
  }),
}));

const enviados: { para: string; assunto: string; html: string; texto: string }[] = [];
let desfechoDoEnvio: unknown = { enviado: true, id: "e1" };
vi.mock("@/lib/email", () => ({
  enviarEmail: async (e: { para: string; assunto: string; html: string; texto: string }) => {
    enviados.push(e);
    return desfechoDoEnvio;
  },
}));

const { gerarLinkDeAcesso } = await import("./links");
const { enviarLinkDeAcesso } = await import("./emailsDeAcesso");
const { site } = await import("@/lib/site");
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");

const linkDoSupabase = "https://projeto.supabase.co/auth/v1/verify?token=abc&type=invite&redirect_to=x";

beforeEach(() => {
  // As falhas esperadas logam; o log é conferido onde importa (sem o e-mail).
  vi.spyOn(console, "error").mockImplementation(() => {});
  chamadas.length = 0;
  enviados.length = 0;
  desfechoDoEnvio = { enviado: true, id: "e1" };
  resposta = {
    data: { user: { id: "usuario-1" }, properties: { hashed_token: "hash-123", action_link: linkDoSupabase } },
    error: null,
  };
});

describe("gerarLinkDeAcesso", () => {
  it("gerarLinkDeAcesso monta a URL do nosso domínio com token_hash", async () => {
    const r = await gerarLinkDeAcesso("invite", "ana@exemplo.com.br", "/corretor/definir-senha", GRUPO_NEXT_HOME_ID);

    expect(r).toEqual({
      ok: true,
      userId: "usuario-1",
      url: `${site.url}/auth/confirmar?token_hash=hash-123&type=invite&next=%2Fcorretor%2Fdefinir-senha&email=ana%40exemplo.com.br`,
    });
    if (!r.ok) throw new Error("deveria ter gerado");
    expect(r.url).not.toContain("supabase.co");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ type: "invite", email: "ana@exemplo.com.br" });
  });

  it("o grupo de fora da Next Home recebe o link do painel do CRM, nunca o da Next Home", async () => {
    const r = await gerarLinkDeAcesso("invite", "ana@exemplo.com.br", "/corretor/definir-senha", "00000000-0000-0000-0000-0000000000b2");
    if (!r.ok) throw new Error("deveria ter gerado");
    expect(r.url.startsWith("https://astroimob.vercel.app/auth/confirmar?")).toBe(true);
    expect(r.url).not.toContain(new URL(site.url).host);
  });

  it("recuperação usa o mesmo formato, com type=recovery", async () => {
    const r = await gerarLinkDeAcesso("recovery", "ana@exemplo.com.br", "/corretor/definir-senha", GRUPO_NEXT_HOME_ID);
    expect(r.ok && new URL(r.url).searchParams.get("type")).toBe("recovery");
    expect(chamadas[0]).toMatchObject({ type: "recovery" });
  });

  it("recusa endereço de acesso @nexthome.com", async () => {
    const r = await gerarLinkDeAcesso("recovery", "Fulano@NextHome.com", "/corretor/definir-senha", GRUPO_NEXT_HOME_ID);
    expect(r).toEqual({ ok: false, motivo: "email_de_acesso" });
    expect(chamadas).toHaveLength(0);
  });

  it("e-mail que já tem conta no convite vira email_em_uso", async () => {
    resposta = { data: { user: null, properties: null }, error: { code: "email_exists", message: "already registered" } };
    expect(await gerarLinkDeAcesso("invite", "ana@exemplo.com.br", "/corretor/definir-senha", GRUPO_NEXT_HOME_ID)).toEqual({
      ok: false,
      motivo: "email_em_uso",
    });
  });

  it("qualquer outra falha vira falha, sem lançar", async () => {
    resposta = { data: { user: null, properties: null }, error: { code: "user_not_found", message: "User not found" } };
    expect(await gerarLinkDeAcesso("recovery", "ninguem@exemplo.com.br", "/corretor/definir-senha", GRUPO_NEXT_HOME_ID)).toEqual({
      ok: false,
      motivo: "falha",
    });
    // O log ajuda o diagnóstico sem gravar o e-mail de quem pediu.
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("ninguem@");

    resposta = { data: { user: { id: "u" }, properties: { hashed_token: "" } }, error: null };
    expect(await gerarLinkDeAcesso("recovery", "ana@exemplo.com.br", "/corretor/definir-senha", GRUPO_NEXT_HOME_ID)).toEqual({
      ok: false,
      motivo: "falha",
    });
  });
});

describe("enviarLinkDeAcesso", () => {
  it("manda o link em texto e HTML, com o nome do grupo, e devolve o desfecho", async () => {
    const url = `${site.url}/auth/confirmar?token_hash=h&type=invite&next=%2Fcorretor%2Fdefinir-senha`;
    const r = await enviarLinkDeAcesso("invite", "ana@exemplo.com.br", "Imobiliária Sol", url);

    expect(r).toEqual({ enviado: true, id: "e1" });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe("ana@exemplo.com.br");
    expect(enviados[0].assunto).toContain("Imobiliária Sol");
    expect(enviados[0].texto).toContain(url);
    // No HTML o `&` da query vira `&amp;`, que é o que o navegador lê de volta.
    expect(enviados[0].html).toContain(url.replaceAll("&", "&amp;"));
  });

  it("sem chave do Resend, devolve o desfecho em vez de lançar", async () => {
    desfechoDoEnvio = { enviado: false, motivo: "sem_chave" };
    const r = await enviarLinkDeAcesso("recovery", "ana@exemplo.com.br", "Next Home", "https://x/auth/confirmar");
    expect(r).toEqual({ enviado: false, motivo: "sem_chave" });
    expect(enviados[0].assunto).not.toBe("");
  });

  it("texto neutro (qualquer ramo) e, no convite de conta em teste, até quando vai o teste", async () => {
    await enviarLinkDeAcesso("invite", "ana@exemplo.com.br", "Clínica Sol", "https://x/auth/confirmar", {
      testeAte: "2026-11-06T18:00:00Z",
      agora: new Date("2026-10-30T18:00:00Z"),
    });
    expect(enviados[0].texto).toContain("Você recebeu acesso ao painel da Clínica Sol.");
    expect(enviados[0].texto).not.toContain("corretores");
    expect(enviados[0].texto).toContain("teste grátis de 7 dias, até 06/11/2026");

    // Teste já acabado, ou link de recuperação: sem a frase.
    await enviarLinkDeAcesso("invite", "ana@exemplo.com.br", "Clínica Sol", "https://x/auth/confirmar", {
      testeAte: "2026-10-01T18:00:00Z",
      agora: new Date("2026-10-30T18:00:00Z"),
    });
    await enviarLinkDeAcesso("recovery", "ana@exemplo.com.br", "Clínica Sol", "https://x/auth/confirmar", {
      testeAte: "2026-11-06T18:00:00Z",
      agora: new Date("2026-10-30T18:00:00Z"),
    });
    expect(enviados[1].texto).not.toContain("teste grátis");
    expect(enviados[2].texto).not.toContain("teste grátis");
  });

  it("escapa o nome do grupo no HTML", async () => {
    await enviarLinkDeAcesso("invite", "ana@exemplo.com.br", "<b>Sol</b>", "https://x/auth/confirmar");
    expect(enviados[0].html).not.toContain("<b>Sol</b>");
    expect(enviados[0].html).toContain("&lt;b&gt;Sol&lt;/b&gt;");
  });
});
