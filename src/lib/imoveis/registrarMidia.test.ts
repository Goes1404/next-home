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

    expect(caminhos[0]).toBe(caminhos[1]);
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
