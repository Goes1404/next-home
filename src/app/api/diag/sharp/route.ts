import { readdir } from "node:fs/promises";
import { NextResponse } from "next/server";

/**
 * TEMPORÁRIO — diagnóstico do `sharp` no runtime da Vercel.
 *
 * Existe porque o erro só aparece DENTRO da função: em produção,
 * `/corretor/imoveis/[slug]/importar` caía com
 * "Could not load the sharp module using the linux-x64 runtime /
 * ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3", e o build não acusava nada.
 * A tela do painel exige sessão de corretor, então não dá para exercitar o
 * caminho com um curl — daí uma rota pública que só reporta o estado do
 * módulo. Não devolve segredo nenhum.
 *
 * APAGAR assim que a causa estiver confirmada e corrigida.
 */
export const dynamic = "force-dynamic";

async function pastaImg(): Promise<string[] | string> {
  for (const caminho of ["node_modules/@img", "/var/task/node_modules/@img"]) {
    try {
      return await readdir(caminho);
    } catch {
      /* tenta o próximo */
    }
  }
  return "não encontrei a pasta @img";
}

export async function GET() {
  const relatorio: Record<string, unknown> = {
    plataforma: `${process.platform}-${process.arch}`,
    cwd: process.cwd(),
    pacotesImg: await pastaImg(),
  };

  try {
    const sharp = (await import("sharp")).default;
    relatorio.versao = sharp.versions;
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    relatorio.resultado = `ok, gerou ${png.length} bytes`;
  } catch (erro) {
    relatorio.resultado = "FALHOU";
    relatorio.erro = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
  }

  return NextResponse.json(relatorio);
}
