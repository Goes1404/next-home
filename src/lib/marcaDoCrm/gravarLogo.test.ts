import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const subidas: { caminho: string; tipo: string | undefined }[] = [];
const removidos: string[][] = [];
const atualizacoes: { logo_url: string | null; id: string }[] = [];
let erroNoEnvio: { message: string } | null = null;
let linhasAtualizadas = 1;
let existentes: string[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: async (caminho: string, _b: unknown, o: { contentType?: string }) => {
          subidas.push({ caminho, tipo: o.contentType });
          return { error: erroNoEnvio };
        },
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/empreendimentos/${caminho}` } }),
        list: async () => ({ data: existentes.map((name) => ({ name })) }),
        remove: async (caminhos: string[]) => {
          removidos.push(caminhos);
          return { error: null };
        },
      }),
    },
    from: () => ({
      update: (dados: { logo_url: string | null }) => ({
        eq: (_c: string, id: string) => ({
          select: async () => {
            atualizacoes.push({ ...dados, id });
            return { data: Array.from({ length: linhasAtualizadas }, () => ({ id })), error: null };
          },
        }),
      }),
    }),
  }),
}));

const { gravarLogoDoGrupo, tirarLogoDoGrupo, AVISO_LOGO_DA_NEXT_HOME } = await import("./gravarLogo");
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");

const OUTRO = "22222222-2222-2222-2222-222222222222";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function arquivo(bytes: Uint8Array, nome = "logo.png", tipo = "image/png"): File {
  return new File([bytes as BlobPart], nome, { type: tipo });
}

beforeEach(() => {
  subidas.length = 0;
  removidos.length = 0;
  atualizacoes.length = 0;
  erroNoEnvio = null;
  linhasAtualizadas = 1;
  existentes = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("gravarLogoDoGrupo", () => {
  it("sobe para grupos/<grupo>/logo-<hash>.png no bucket público e grava a URL", async () => {
    const r = await gravarLogoDoGrupo(OUTRO, arquivo(PNG));
    expect(r.ok).toBe(true);
    expect(subidas).toHaveLength(1);
    expect(subidas[0].caminho).toMatch(new RegExp(`^grupos/${OUTRO}/logo-[0-9a-f]{16}\\.png$`));
    expect(subidas[0].tipo).toBe("image/png");
    expect(atualizacoes).toEqual([{ logo_url: expect.stringContaining(subidas[0].caminho), id: OUTRO }]);
  });

  it("o tipo vem dos bytes: SVG com nome .png e tipo image/png é recusado, sem subir nada", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    const r = await gravarLogoDoGrupo(OUTRO, arquivo(svg, "logo.png", "image/png"));
    expect(r).toMatchObject({ ok: false });
    expect(subidas).toHaveLength(0);
    expect(atualizacoes).toHaveLength(0);
  });

  it("recusa mais de 1 MB", async () => {
    const grande = new Uint8Array(1024 * 1024 + 1);
    grande.set(PNG);
    const r = await gravarLogoDoGrupo(OUTRO, arquivo(grande));
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("1 MB") });
    expect(subidas).toHaveLength(0);
  });

  it("a Next Home não troca logo por imagem", async () => {
    expect(await gravarLogoDoGrupo(GRUPO_NEXT_HOME_ID, arquivo(PNG))).toEqual({ ok: false, erro: AVISO_LOGO_DA_NEXT_HOME });
    expect(await tirarLogoDoGrupo(GRUPO_NEXT_HOME_ID)).toEqual({ ok: false, erro: AVISO_LOGO_DA_NEXT_HOME });
    expect(subidas).toHaveLength(0);
    expect(atualizacoes).toHaveLength(0);
  });

  it("sem arquivo, pede o arquivo", async () => {
    expect(await gravarLogoDoGrupo(OUTRO, null)).toMatchObject({ ok: false });
  });

  it("falha no envio: não grava a URL", async () => {
    erroNoEnvio = { message: "storage caiu" };
    expect(await gravarLogoDoGrupo(OUTRO, arquivo(PNG))).toMatchObject({ ok: false });
    expect(atualizacoes).toHaveLength(0);
  });

  it("grupo que não existe: erro, sem sucesso falso", async () => {
    linhasAtualizadas = 0;
    expect(await gravarLogoDoGrupo(OUTRO, arquivo(PNG))).toMatchObject({ ok: false });
  });

  it("apaga as logos antigas do grupo (só as dele), menos a nova", async () => {
    existentes = ["logo-aaaaaaaaaaaaaaaa.png", "capa.png", "logo-bbbbbbbbbbbbbbbb.webp"];
    await gravarLogoDoGrupo(OUTRO, arquivo(PNG));
    expect(removidos.flat().sort()).toEqual([`grupos/${OUTRO}/logo-aaaaaaaaaaaaaaaa.png`, `grupos/${OUTRO}/logo-bbbbbbbbbbbbbbbb.webp`]);
  });
});

describe("tirarLogoDoGrupo", () => {
  it("limpa logo_url e apaga os arquivos do grupo", async () => {
    existentes = ["logo-aaaaaaaaaaaaaaaa.png"];
    const r = await tirarLogoDoGrupo(OUTRO);
    expect(r).toEqual({ ok: true, url: null });
    expect(atualizacoes).toEqual([{ logo_url: null, id: OUTRO }]);
    expect(removidos.flat()).toEqual([`grupos/${OUTRO}/logo-aaaaaaaaaaaaaaaa.png`]);
  });
});
