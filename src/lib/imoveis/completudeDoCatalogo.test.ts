import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  avaliarCompletude,
  completudePorCategoria,
  imoveisPorCompletude,
  type ImovelAvaliavel,
} from "./completudeDoCatalogo";

const completo: ImovelAvaliavel = {
  nome: "Residencial Aurora",
  descricao: "Apartamentos de 2 e 3 dormitorios.",
  endereco: "Rua das Palmeiras, 100",
  construtora: "P4 Engenharia",
  precoAPartir: 460000,
  nomesAlternativos: ["Aurora"],
  galeria: [{}],
  plantas: [{}],
  tipologias: [{}],
  lazer: ["Piscina"],
};

describe("completude de um imóvel", () => {
  it("imóvel recém-criado não tem nenhum essencial completo", () => {
    const r = avaliarCompletude({ nome: "Residencial Aurora" });

    expect(r.essencialCompletos).toBe(0);
    expect(r.essencialTotal).toBeGreaterThan(0);
  });

  it("conta cada essencial que o imóvel de fato tem", () => {
    const r = avaliarCompletude(completo);

    expect(r.essencialCompletos).toBe(r.essencialTotal);
  });

  it("a faixa complementar não entra na conta do essencial", () => {
    const r = avaliarCompletude(completo);
    const complementares = r.itens.filter((x) => x.categoria.faixa === "complementar");

    expect(complementares.length).toBeGreaterThan(0);
    expect(complementares.every((x) => !x.presente)).toBe(true);
    expect(r.essencialTotal).toBeLessThan(r.itens.length);
  });

  it("texto em branco não conta como preenchido", () => {
    const r = avaliarCompletude({ ...completo, construtora: "   " });
    const construtora = r.itens.find((x) => x.categoria.chave === "construtora");

    expect(construtora?.presente).toBe(false);
  });

  it("vídeo OU tour resolve a mesma categoria", () => {
    const soTour = avaliarCompletude({ ...completo, tours360: [{}] });
    const soVideo = avaliarCompletude({ ...completo, videos: [{}] });
    const presenca = (r: ReturnType<typeof avaliarCompletude>) =>
      r.itens.find((x) => x.categoria.chave === "video_ou_tour")?.presente;

    expect(presenca(soTour)).toBe(true);
    expect(presenca(soVideo)).toBe(true);
  });
});

describe("o catálogo inteiro, por categoria", () => {
  it("diz quantos imóveis têm cada categoria", () => {
    const semFoto: ImovelAvaliavel = { ...completo, nome: "Sem Foto", galeria: [] };

    const porCategoria = completudePorCategoria([completo, semFoto]);
    const foto = porCategoria.find((x) => x.categoria.chave === "foto");

    expect(foto?.completos).toBe(1);
    expect(foto?.total).toBe(2);
  });
});

describe("a lista por imóvel", () => {
  const vazio: ImovelAvaliavel = { nome: "Zebra Vazia" };
  const semFoto: ImovelAvaliavel = { ...completo, nome: "Sem Foto", galeria: [] };

  it("põe na frente quem tem menos essencial preenchido", () => {
    const lista = imoveisPorCompletude([completo, semFoto, vazio]);

    expect(lista.map((x) => x.imovel.nome)).toEqual([
      "Zebra Vazia",
      "Sem Foto",
      "Residencial Aurora",
    ]);
  });

  it("entrega o que falta em cada um, sem o que já está lá", () => {
    const lista = imoveisPorCompletude([semFoto]);
    const chaves = lista[0].faltando.map((c) => c.chave);

    expect(chaves).toContain("foto");
    expect(chaves).not.toContain("descricao");
  });
});

/**
 * Guarda de código-fonte: uma conta só.
 *
 * `pendenciasDoCatalogo` respondia "tem planta?" por conta própria. Com este
 * módulo ao lado, duas implementações da mesma pergunta divergem no primeiro
 * ajuste, e a tela de pendências passaria a discordar do checklist sem que
 * nada ficasse vermelho. É o defeito que esta base registra desde
 * `montarResumo`.
 */
describe("uma conta só para 'o que este imóvel tem'", () => {
  const fonte = readFileSync("src/lib/imoveis/pendenciasDoCatalogo.ts", "utf8");

  // Comentário que CITA o módulo não prova derivação, e guarda desta base já
  // acusou arquivo errado por ler comentário como se fosse código.
  const semComentarios = fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");

  it("pendenciasDoCatalogo deriva do módulo de completude", () => {
    expect(semComentarios).toContain('from "./completudeDoCatalogo"');
  });

  it("e não reimplementa a presença por conta própria", () => {
    expect(semComentarios).not.toMatch(/plantas\?\.length/);
    expect(semComentarios).not.toMatch(/tipologias\?\.length/);
  });
});
