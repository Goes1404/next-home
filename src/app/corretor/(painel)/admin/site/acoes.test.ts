import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../../test/bancoFalso";

/**
 * "Meu site" pelo gestor (0209): só gestor grava, o grupo é o da SESSÃO, a
 * Next Home não edita, o que é inválido não chega ao banco e o evento não
 * carrega o texto digitado.
 */

const GRUPO_DO_GESTOR = "00000000-0000-4000-8000-0000000000aa";
const OUTRO_GRUPO = "00000000-0000-4000-8000-0000000000bb";
const NEXT_HOME = "00000000-0000-0000-0000-000000000001";

let banco: BancoFalso;
let guarda: { corretor: { id: string; grupoId: string } } | { erro: string };
const tags: string[] = [];

vi.mock("@/lib/guardas", () => ({ exigirGestorNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: (t: string) => tags.push(t) }));

const { salvarMeuSite, trocarCapaDoSite, tirarCapaDoSite } = await import("./acoes");

const DIGITADO = {
  cor: "#1F6F5C",
  titulo: "Seu endereço",
  frase: "",
  sobre: "Texto sobre",
  whatsapp: "(11) 99999-8888",
  email: "contato@sol.com.br",
  logradouro: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
  instagram: "@sol",
  facebook: "",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  guarda = { corretor: { id: "gestor-1", grupoId: GRUPO_DO_GESTOR } };
  tags.length = 0;
  banco = bancoFalso({ grupos: [{ id: GRUPO_DO_GESTOR }, { id: OUTRO_GRUPO, site_titulo: "Do outro" }], admin_eventos: [] });
});

describe("salvarMeuSite", () => {
  it("grava só no grupo da sessão, normalizado, e deixa o evento sem o texto digitado", async () => {
    expect(await salvarMeuSite(DIGITADO)).toEqual({ ok: true });
    const meu = banco.tabelas.grupos.find((g) => g.id === GRUPO_DO_GESTOR);
    expect(meu).toMatchObject({
      site_cor: "#1f6f5c",
      site_titulo: "Seu endereço",
      site_frase: null,
      site_whatsapp: "5511999998888",
      site_instagram: "https://www.instagram.com/sol/",
      site_endereco: null,
    });
    // O outro grupo nem foi tocado.
    expect(banco.tabelas.grupos.find((g) => g.id === OUTRO_GRUPO)).toEqual({ id: OUTRO_GRUPO, site_titulo: "Do outro" });
    const evento = banco.tabelas.admin_eventos[0];
    expect(evento).toMatchObject({ grupo_id: GRUPO_DO_GESTOR, acao: "site_do_grupo_alterado", ator_id: "gestor-1" });
    expect(JSON.stringify(evento)).not.toContain("Texto sobre");
    expect(JSON.stringify(evento)).not.toContain("contato@sol.com.br");
    expect(tags).toContain("site-do-grupo");
  });

  it("corretor que não é gestor é recusado antes de gravar", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a imobiliária." };
    expect(await salvarMeuSite(DIGITADO)).toEqual({ ok: false, erro: guarda.erro });
    expect(banco.consultas).toHaveLength(0);
  });

  it("gestor não edita outro grupo: o id do navegador não existe na action", async () => {
    // A assinatura só recebe os campos de texto; mesmo um campo extra é ignorado.
    await salvarMeuSite({ ...DIGITADO, grupoId: OUTRO_GRUPO } as never);
    expect(banco.tabelas.grupos.find((g) => g.id === OUTRO_GRUPO)).toEqual({ id: OUTRO_GRUPO, site_titulo: "Do outro" });
    expect(banco.tabelas.grupos.find((g) => g.id === GRUPO_DO_GESTOR)).toMatchObject({ site_titulo: "Seu endereço" });
  });

  it("a Next Home não edita (o site dela vem da instalação)", async () => {
    guarda = { corretor: { id: "gestor-nh", grupoId: NEXT_HOME } };
    const r = await salvarMeuSite(DIGITADO);
    expect(r.ok).toBe(false);
    expect(banco.consultas).toHaveLength(0);
  });

  it("valor inválido volta com os campos e não grava nada", async () => {
    const r = await salvarMeuSite({ ...DIGITADO, cor: "verde", email: "x", facebook: "javascript:alert(1)" });
    expect(r).toMatchObject({ ok: false, erros: { cor: expect.any(String), email: expect.any(String), facebook: expect.any(String) } });
    expect(banco.consultas).toHaveLength(0);
  });
});

describe("capa", () => {
  it("só gestor troca ou tira a capa", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a imobiliária." };
    const f = new FormData();
    f.set("capa", new File([new Uint8Array([1])], "c.jpg"));
    expect(await trocarCapaDoSite(f)).toEqual({ ok: false, erro: guarda.erro });
    expect(await tirarCapaDoSite()).toEqual({ ok: false, erro: guarda.erro });
    expect(banco.consultas).toHaveLength(0);
  });

  it("arquivo que não é imagem de verdade (SVG, script, vazio) é recusado antes do Storage", async () => {
    for (const conteudo of ["<svg onload=alert(1)></svg>", "GIF89a", ""]) {
      const f = new FormData();
      f.set("capa", new File([conteudo], "capa.jpg", { type: "image/jpeg" }));
      const r = await trocarCapaDoSite(f);
      expect(r.ok, conteudo).toBe(false);
    }
    expect(banco.consultas).toHaveLength(0);
  });

  it("sem arquivo, pede o arquivo", async () => {
    expect(await trocarCapaDoSite(new FormData())).toEqual({ ok: false, erro: "Escolha a foto de capa." });
  });

  it("a Next Home não troca a capa", async () => {
    guarda = { corretor: { id: "gestor-nh", grupoId: NEXT_HOME } };
    expect((await trocarCapaDoSite(new FormData())).ok).toBe(false);
    expect((await tirarCapaDoSite()).ok).toBe(false);
    expect(banco.consultas).toHaveLength(0);
  });
});
