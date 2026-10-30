import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso } from "@/lib/central/bancoFalso";

/**
 * A arte do Estúdio pedida pelo número central: a MESMA geração da rota
 * `/api/imagens/gerar`, sem a sessão. O que não pode regredir:
 * - limite do plano, teto diário e suspensão barram ANTES de qualquer IA;
 * - o consumo vai ao livro (`registrarConsumoDaIa`, pelo `gerarImagem` de
 *   verdade, com quem pediu pagando);
 * - o imóvel de outro grupo não é lido nem vira arte;
 * - a ressalva é carimbada antes do upload, e a arte entra na galeria com o
 *   imóvel (é a linha que conta no limite do mês).
 */

const G = "g1";
const PNG = Buffer.from("png-gerado");

const ordem: string[] = [];
const consumo = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const registrarImagem = vi.fn<(...a: unknown[]) => Promise<{ id: string }>>(async () => ({ id: "img-1" }));
let limiteOk = true;
let suspenso = false;
let usadasHoje = 0;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/planos/consumoDaIa", () => ({ registrarConsumoDaIa: (...a: unknown[]) => consumo(...a) }));
vi.mock("@/lib/planos/cobrancaDoGrupo", () => ({ grupoSuspenso: async () => suspenso }));
vi.mock("@/lib/planos/usoDaIa", () => ({
  conferirLimite: async () =>
    limiteOk ? { ok: true, situacao: {} } : { ok: false, erro: "Seu plano tem 30 artes por mês e elas acabaram. Voltam no dia 1º.", situacao: {} },
}));
vi.mock("@/lib/imagens/galeria", () => ({
  getTetoDeHoje: async () => ({ usadasHoje, teto: 20 }),
  registrarImagem: (...a: unknown[]) => (ordem.push("galeria"), registrarImagem(...a)),
}));
const entradasDoTradutor: { pedido: string; fatos: string[]; dominio?: string }[] = [];
/** O que o tradutor "reescreve"; nulo = o eco de sempre (pedido | fatos). */
let traducao: string | null = null;
vi.mock("@/lib/imagens/tradutor", () => ({
  traduzirPedido: async (e: { pedido: string; fatos: string[]; dominio?: string }) => (
    ordem.push("tradutor"), entradasDoTradutor.push(e), { prompt: traducao ?? `${e.pedido} | ${e.fatos.join("; ")}`, daIa: true }
  ),
}));
vi.mock("@/lib/imagens/carimbo", () => ({
  carimbarRessalva: async (bytes: Buffer, mime: string) => (ordem.push("carimbo"), { bytes: Buffer.concat([bytes, Buffer.from("+ressalva")]), mime, carimbada: true }),
}));
vi.mock("@/lib/imoveis/imagemDerivada", () => ({ medirImagem: async () => ({ largura: 1024, altura: 1024 }) }));

let banco: ReturnType<typeof bancoFalso>;
const uploads: { caminho: string; bytes: Buffer }[] = [];
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (t: string) => (banco.cliente as { from: (t: string) => unknown }).from(t),
    storage: {
      from: () => ({
        upload: async (caminho: string, bytes: Buffer) => (ordem.push("upload"), uploads.push({ caminho, bytes }), { error: null }),
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://cdn.exemplo/${caminho}` } }),
      }),
    },
  }),
}));

const { gerarArtePeloCentral, conferirArtePeloCentral } = await import("./artePeloCentral");

const linhaDoImovel = (id: string, grupo: string) => ({
  id,
  grupo_id: grupo,
  slug: `vitta-${id}`,
  nome: "Vitta Residencial",
  nomes_alternativos: [],
  status: "lancamento",
  cidade: "Barueri",
  bairro: "Alphaville",
  construtora: "Construtora X",
  midias: [],
  tipologias: [],
  lazer: [],
  unidades: [],
});

const pedido = { corretorId: "c1", grupoId: G, empreendimentoId: "e1", formato: "quadrado" as const, texto: "Post do Vitta para redes sociais" };

describe("arte do Estúdio pelo central", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    ordem.length = 0;
    uploads.length = 0;
    entradasDoTradutor.length = 0;
    traducao = null;
    consumo.mockClear();
    registrarImagem.mockClear();
    limiteOk = true;
    suspenso = false;
    usadasHoje = 0;
    vi.stubEnv("OPENAI_API_KEY", "sk-teste");
    banco = bancoFalso({ empreendimentos: [linhaDoImovel("e1", G), linhaDoImovel("e9", "g2")] });
    globalThis.fetch = vi.fn(async () => {
      ordem.push("gerador");
      return new Response(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }], usage: { input_tokens: 50, output_tokens: 196 } }), {
        headers: { "content-type": "application/json" },
      });
    }) as never;
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
  });

  it("gera pela geração do Estúdio, grava o consumo de quem pediu e carimba antes do upload", async () => {
    const r = await gerarArtePeloCentral(pedido);
    expect(r).toMatchObject({ ok: true, imagemId: "img-1", ressalva: "aplicada" });
    expect(ordem).toEqual(["tradutor", "gerador", "carimbo", "upload", "galeria"]);
    expect(consumo).toHaveBeenCalledWith(
      { finalidade: "arte_imagem", quemPaga: { corretorId: "c1", grupoId: G } },
      expect.objectContaining({ tokensSaida: 196 }),
    );
    // Os fatos da ficha vão ao tradutor, e o pedido chega ao gerador.
    const corpo = JSON.parse(String((globalThis.fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body));
    expect(corpo.prompt).toContain("Post do Vitta");
    expect(corpo.prompt).toContain("Alphaville");
    expect(corpo.quality).toBe("low");
    // O arquivo guardado é o carimbado, na pasta do corretor.
    expect(uploads[0].caminho).toMatch(/^corretores\/c1\/criacoes\/[0-9a-f]{16}\.png$/);
    expect(uploads[0].bytes.toString()).toContain("+ressalva");
    expect(registrarImagem).toHaveBeenCalledWith(expect.objectContaining({ corretorId: "c1", empreendimentoId: "e1" }));
    expect(r.ok && r.url).toBe(`https://cdn.exemplo/${uploads[0].caminho}`);
  });

  it("com foto no catálogo, a primeira foto do imóvel vai como base (como o Estúdio); foto de outro grupo nunca", async () => {
    banco = bancoFalso({
      empreendimentos: [linhaDoImovel("e1", G)],
      midias: [
        { grupo_id: "g2", empreendimento_id: "e1", tipo: "foto", ordem: 0, url: "https://fotos/alheia.jpg" },
        { grupo_id: G, empreendimento_id: "e1", tipo: "foto", ordem: 2, url: "https://fotos/segunda.jpg" },
        { grupo_id: G, empreendimento_id: "e1", tipo: "foto", ordem: 1, url: "https://fotos/vitta.jpg" },
      ],
    });
    const chamadas: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      chamadas.push(String(url));
      if (String(url).startsWith("https://fotos/")) return new Response(PNG, { headers: { "content-type": "image/png" } });
      ordem.push("gerador");
      return new Response(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }], usage: { input_tokens: 50, output_tokens: 196 } }), {
        headers: { "content-type": "application/json" },
      });
    }) as never;
    expect(await gerarArtePeloCentral(pedido)).toMatchObject({ ok: true });
    expect(chamadas[0]).toBe("https://fotos/vitta.jpg");
    // Com referência, o gerador usa a edição (a foto vai junto), não a criação do zero.
    expect(chamadas.some((u) => /images\/edits/.test(u))).toBe(true);
    expect(registrarImagem).toHaveBeenCalledWith(expect.objectContaining({ referenciaUrl: "https://fotos/vitta.jpg" }));
  });

  it("foto do catálogo que não baixa: a arte sai como antes, sem base", async () => {
    banco = bancoFalso({
      empreendimentos: [linhaDoImovel("e1", G)],
      midias: [{ grupo_id: G, empreendimento_id: "e1", tipo: "foto", ordem: 0, url: "https://fotos/quebrada.jpg" }],
    });
    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url).startsWith("https://fotos/")) return new Response("", { status: 404 });
      ordem.push("gerador");
      return new Response(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }], usage: { input_tokens: 50, output_tokens: 196 } }), {
        headers: { "content-type": "application/json" },
      });
    }) as never;
    expect(await gerarArtePeloCentral(pedido)).toMatchObject({ ok: true });
    expect(registrarImagem).toHaveBeenCalledWith(expect.objectContaining({ referenciaUrl: null }));
  });

  it("cota de arte do plano esgotada: recusa sem chamar IA nenhuma", async () => {
    limiteOk = false;
    expect(await gerarArtePeloCentral(pedido)).toEqual({ ok: false, erro: "Seu plano tem 30 artes por mês e elas acabaram. Voltam no dia 1º." });
    expect(ordem).toEqual([]);
    expect(consumo).not.toHaveBeenCalled();
  });

  it("teto diário e grupo suspenso também barram antes", async () => {
    usadasHoje = 20;
    expect(await conferirArtePeloCentral({ corretorId: "c1", grupoId: G })).toMatchObject({ ok: false, erro: expect.stringContaining("20 imagens hoje") });
    usadasHoje = 0;
    suspenso = true;
    expect(await gerarArtePeloCentral(pedido)).toMatchObject({ ok: false, erro: expect.stringContaining("pausada") });
    expect(ordem).toEqual([]);
  });

  it("imóvel de outro grupo não é lido nem gera arte", async () => {
    expect(await gerarArtePeloCentral({ ...pedido, empreendimentoId: "e9" })).toEqual({ ok: false, erro: "Não achei esse imóvel no catálogo da imobiliária." });
    expect(ordem).toEqual([]);
  });

  it("a frase pedida chega ao gerador sem mudança, mesmo se o tradutor a reescrever", async () => {
    const frase = "Visite e ganhe um champanhe somente este final de semana";
    // O tradutor "melhora" a frase (caixa alta, palavra a menos): não pode valer.
    traducao = 'Post do Dom Parque, fachada ao entardecer, com o texto "VISITE E GANHE CHAMPANHE" no topo em letra branca.';
    const r = await gerarArtePeloCentral({ ...pedido, texto: `Post do Vitta para redes sociais. Com o texto "${frase}" escrito na arte, exatamente assim.`, textoNaArte: frase });
    expect(r).toMatchObject({ ok: true });
    // O tradutor também viu a frase, entre aspas, para decidir posição e letra.
    expect(entradasDoTradutor[0].pedido).toContain(`"${frase}"`);
    const corpo = JSON.parse(String((globalThis.fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body));
    // O ditado é a frase declarada, inteira, e só ela.
    expect(corpo.prompt).toContain(`Escreva na imagem exatamente este texto, com a grafia e os acentos idênticos: "${frase}".`);
    expect(corpo.prompt).not.toContain('idênticos: "VISITE');
  });

  it("arte livre (sem imóvel): sem ficha, ofício livre, sem ressalva, na galeria sem imóvel, consumo gravado", async () => {
    const r = await gerarArtePeloCentral({ ...pedido, empreendimentoId: null, texto: "Post para redes sociais. O que mostrar: prédio futurista flutuante." });
    expect(r).toMatchObject({ ok: true, ressalva: "nao_se_aplica" });
    expect(ordem).toEqual(["tradutor", "gerador", "upload", "galeria"]);
    expect(entradasDoTradutor[0]).toMatchObject({ fatos: [], dominio: "livre" });
    expect(uploads[0].bytes.toString()).not.toContain("+ressalva");
    expect(registrarImagem).toHaveBeenCalledWith(expect.objectContaining({ corretorId: "c1", empreendimentoId: null }));
    expect(consumo).toHaveBeenCalledWith({ finalidade: "arte_imagem", quemPaga: { corretorId: "c1", grupoId: G } }, expect.anything());
  });

  it("arte livre também passa pelo limite do plano antes de qualquer IA", async () => {
    limiteOk = false;
    expect(await gerarArtePeloCentral({ ...pedido, empreendimentoId: null })).toMatchObject({ ok: false });
    expect(ordem).toEqual([]);
  });

  it("falha do gerador vira frase, sem upload nem galeria", async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 })) as never;
    const r = await gerarArtePeloCentral(pedido);
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("sem crédito") });
    expect(uploads).toEqual([]);
    expect(registrarImagem).not.toHaveBeenCalled();
  });
});
