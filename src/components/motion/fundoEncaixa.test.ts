import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O encaixe do vídeo de fundo contra a PROPORÇÃO REAL do arquivo.
 *
 * Em 06/09/2026 o fundo da home aparecia com duas faixas escuras nas
 * laterais em janela de desktop: a vinheta é 16:9 e a viewport de um
 * navegador maximizado em 1920x1080 fica em ~1920x910 (2,11), porque a barra
 * de endereço come altura. Com `object-contain` sobravam 143px vazios de
 * cada lado, preenchidos só pela camada desfocada a 60% — duas linhas retas
 * de luz no meio da imagem.
 *
 * A correção é uma consulta de proporção em `globals.css`
 * (`.fundo-encaixa-na-tela`), e ela só está certa enquanto o número da
 * consulta for o do ARQUIVO. Trocar a vinheta por uma de outra proporção sem
 * mexer no CSS traz a faixa de volta — e traz calada: build, tipos e testes
 * seguem verdes, e a tela continua "funcionando".
 *
 * Por isso este teste lê o MP4 de verdade em vez de confiar num número
 * escrito à mão.
 */

const RAIZ = process.cwd();

/**
 * Largura e altura declaradas na trilha de vídeo de um MP4.
 *
 * Lê a árvore de átomos até `stsd` e pega os dois `uint16` do início da
 * descrição de amostra (offset 24 do corpo, pela especificação do
 * `VisualSampleEntry`). Sem dependência: `ffprobe` não existe nesta máquina
 * nem na esteira, e um teste que depende de binário externo é um teste que
 * pula em silêncio.
 */
function dimensoesDoMp4(caminho: string): { largura: number; altura: number } {
  const bytes = readFileSync(caminho);
  const RECIPIENTES = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

  function percorrer(inicio: number, fim: number): { largura: number; altura: number } | null {
    let cursor = inicio;
    while (cursor + 8 <= fim) {
      let tamanho = bytes.readUInt32BE(cursor);
      const tipo = bytes.toString("latin1", cursor + 4, cursor + 8);
      let corpo = cursor + 8;
      if (tamanho === 1) {
        // Átomo de 64 bits: o tamanho real vem logo depois do cabeçalho.
        tamanho = Number(bytes.readBigUInt64BE(cursor + 8));
        corpo = cursor + 16;
      } else if (tamanho === 0) {
        tamanho = fim - cursor;
      }
      if (tamanho < 8) return null;

      if (RECIPIENTES.has(tipo)) {
        const achado = percorrer(corpo, cursor + tamanho);
        if (achado) return achado;
      } else if (tipo === "stsd") {
        // 4 de versão/flags + 4 de contagem, depois a primeira entrada
        // (4 de tamanho + 4 de formato) e 24 até chegar em largura/altura.
        const entrada = corpo + 8;
        const largura = bytes.readUInt16BE(entrada + 8 + 24);
        const altura = bytes.readUInt16BE(entrada + 8 + 26);
        if (largura > 0 && altura > 0) return { largura, altura };
      }
      cursor += tamanho;
    }
    return null;
  }

  const achado = percorrer(0, bytes.length);
  if (!achado) throw new Error(`Não deu para ler as dimensões de ${caminho}`);
  return achado;
}

function globalsCss(): string {
  return readFileSync(join(RAIZ, "src/app/globals.css"), "utf8");
}

function fundoVideoIntro(): string {
  return readFileSync(join(RAIZ, "src/components/motion/FundoVideoIntro.tsx"), "utf8");
}

describe("o fundo da home encaixa na tela", () => {
  const CLASSE = "fundo-encaixa-na-tela";

  it("a consulta de proporção usa a proporção REAL da vinheta", () => {
    const { largura, altura } = dimensoesDoMp4(join(RAIZ, "public/video/intro.mp4"));

    const regra = /@media\s*\(min-aspect-ratio:\s*(\d+)\s*\/\s*(\d+)\s*\)/.exec(globalsCss());
    expect(regra, "a regra de min-aspect-ratio sumiu do globals.css").not.toBeNull();

    const [, a, b] = regra!;
    expect(
      Number(a) / Number(b),
      `a consulta está em ${a}/${b} e o arquivo é ${largura}x${altura}`,
    ).toBeCloseTo(largura / altura, 3);
  });

  it("a classe existe no CSS e é aplicada no componente", () => {
    /*
     * Seletor com FRONTEIRA, não `toContain`. `.fundo-encaixa-na-telaXX`
     * contém `.fundo-encaixa-na-tela` como pedaço, então a versão ingênua
     * aprovava um CSS em que a classe tinha sido renomeada — a mesma
     * armadilha de substring que já deixou passar uma mordida da guarda do
     * vídeo (MEMORIA, 03/09). Aqui a régua é: existe uma REGRA com este
     * seletor.
     */
    expect(globalsCss(), "o seletor sumiu ou foi renomeado no globals.css").toMatch(
      /\.fundo-encaixa-na-tela\s*\{/,
    );
    expect(fundoVideoIntro()).toContain(CLASSE);
  });

  it("a classe vale só para o vídeo 16:9, nunca para o vertical", () => {
    /*
     * O vídeo vertical do celular já tem a proporção da tela e usa `cover`
     * por conta própria. Se a classe escapasse para ele, uma tela mais larga
     * que 16:9 (celular deitado) forçaria `cover` onde a peça já cobre — sem
     * efeito hoje, e uma armadilha na primeira vez que alguém mudar o
     * `object-fit` do ramo vertical.
     */
    const fonte = fundoVideoIntro();
    const trecho = /vertical\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/.exec(fonte);
    expect(trecho, "o ternário de object-fit da camada da marca mudou de forma").not.toBeNull();

    const [, seVertical, seDeitado] = trecho!;
    expect(seVertical, "o ramo vertical não pode levar a classe").not.toContain(CLASSE);
    expect(seDeitado, "o ramo 16:9 precisa da classe").toContain(CLASSE);
  });
});
