import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { registrarMidia, type DepsMidia, type LinhaMidiaNova } from "./registrarMidia";

async function fotoDeTeste(largura = 1600, altura = 900) {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: { r: 20, g: 100, b: 160 } } })
    .jpeg()
    .toBuffer();
}

function depsFalsas() {
  const inseridas: LinhaMidiaNova[] = [];
  const caminhos: string[] = [];

  const deps: DepsMidia = {
    subir: vi.fn(async (caminho: string) => {
      caminhos.push(caminho);
      return { erro: null };
    }),
    urlPublica: (caminho) => `https://storage.exemplo/${caminho}`,
    inserir: vi.fn(async (linha: LinhaMidiaNova) => {
      const jaTem = inseridas.some(
        (l) => l.hash_conteudo === linha.hash_conteudo && l.empreendimento_id === linha.empreendimento_id,
      );
      if (jaTem) return { id: null, duplicada: true, erro: null };
      inseridas.push(linha);
      return { id: `id-${inseridas.length}`, duplicada: false, erro: null };
    }),
  };

  return { deps, inseridas, caminhos };
}

describe("registrarMidia", () => {
  it("sobe as variantes WebP menores que o original e lista só as que subiram (0177)", async () => {
    const { deps, inseridas, caminhos } = depsFalsas();

    await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: await fotoDeTeste(1600, 900),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada",
    });

    // 1600 de largura: 480, 960 e 1440 cabem; nada é ampliado.
    expect(inseridas[0].variantes).toEqual([480, 960, 1440]);
    const variantes = caminhos.filter((c) => /\.w\d+\.webp$/.test(c));
    expect(variantes).toEqual([
      "emp-1/foto-" + inseridas[0].hash_conteudo.slice(0, 16) + ".w480.webp",
      "emp-1/foto-" + inseridas[0].hash_conteudo.slice(0, 16) + ".w960.webp",
      "emp-1/foto-" + inseridas[0].hash_conteudo.slice(0, 16) + ".w1440.webp",
    ]);
    // O original continua sendo o primeiro upload — a variante é adição, não troca.
    expect(caminhos[0]).toMatch(/^emp-1\/foto-[0-9a-f]{16}\.jpg$/);
  });

  it("foto pequena não ganha variante nenhuma — e a linha diz isso com [] (conferida), não null", async () => {
    const { deps, inseridas, caminhos } = depsFalsas();

    await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: await fotoDeTeste(400, 300),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Miniatura",
    });

    expect(inseridas[0].variantes).toEqual([]);
    expect(caminhos).toHaveLength(1);
  });

  it("variante que não sobe fica FORA da lista: candidato 404 no srcset seria foto quebrada", async () => {
    const { deps, inseridas } = depsFalsas();
    const subirOriginal = deps.subir;
    deps.subir = vi.fn(async (caminho: string, bytes: Buffer, contentType: string) => {
      if (caminho.endsWith(".w960.webp")) return { erro: "storage indisponível" };
      return subirOriginal(caminho, bytes, contentType);
    });

    await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: await fotoDeTeste(1600, 900),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada",
    });

    expect(inseridas[0].variantes).toEqual([480, 1440]);
  });

  it("grava a medida REAL do arquivo, não 1920x1080", async () => {
    const { deps, inseridas } = depsFalsas();

    await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: await fotoDeTeste(1200, 1200),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada",
    });

    expect(inseridas[0].largura).toBe(1200);
    expect(inseridas[0].altura).toBe(1200);
  });

  it("grava o blur, que o caminho antigo nunca preenchia", async () => {
    const { deps, inseridas } = depsFalsas();

    await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: await fotoDeTeste(),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada",
    });

    expect(inseridas[0].blur_data_url).toMatch(/^data:image\/webp;base64,/);
  });

  it("a mesma foto vinda duas vezes grava uma linha só", async () => {
    const { deps, inseridas } = depsFalsas();
    const bytes = await fotoDeTeste();

    const primeira = await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes,
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada",
    });
    const segunda = await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes,
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada de novo",
    });

    expect(primeira).toMatchObject({ ok: true, duplicada: false });
    expect(segunda).toMatchObject({ ok: true, duplicada: true });
    expect(inseridas).toHaveLength(1);
  });

  it("o mesmo conteúdo escreve no mesmo caminho, em vez de encher o bucket", async () => {
    const { deps, caminhos } = depsFalsas();
    const bytes = await fotoDeTeste();

    await registrarMidia(deps, { empreendimentoId: "emp-1", bytes, mime: "image/jpeg", tipo: "foto", alt: "A" });
    await registrarMidia(deps, { empreendimentoId: "emp-1", bytes, mime: "image/jpeg", tipo: "foto", alt: "B" });

    // Só os ORIGINAIS: entre um e outro sobem as variantes WebP (0177).
    const originais = caminhos.filter((c) => !/\.w\d+\.webp$/.test(c));
    expect(originais).toHaveLength(2);
    expect(originais[0]).toBe(originais[1]);
  });

  it("aceita arquivo que o sharp não lê, com medida nula em vez de recusar", async () => {
    const { deps, inseridas } = depsFalsas();

    const resultado = await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: Buffer.from("isto não é uma imagem"),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Sei lá",
    });

    expect(resultado.ok).toBe(true);
    expect(inseridas[0].largura).toBeNull();
    expect(inseridas[0].blur_data_url).toBeNull();
  });

  it("devolve erro em português quando o upload falha, sem inserir linha", async () => {
    const { deps, inseridas } = depsFalsas();
    deps.subir = vi.fn(async () => ({ erro: "storage fora do ar" }));

    const resultado = await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: await fotoDeTeste(),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada",
    });

    expect(resultado).toMatchObject({ ok: false });
    expect(inseridas).toHaveLength(0);
  });
});

describe("caminho no Storage", () => {
  it("começa pelo id do empreendimento, que é o que a policy de storage confere", async () => {
    const { deps, caminhos } = depsFalsas();

    await registrarMidia(deps, {
      empreendimentoId: "11111111-2222-3333-4444-555555555555",
      bytes: await fotoDeTeste(),
      mime: "image/png",
      tipo: "planta",
      alt: "Planta",
    });

    expect(caminhos[0]).toMatch(/^11111111-2222-3333-4444-555555555555\/planta-[0-9a-f]{16}\.png$/);
  });
});
