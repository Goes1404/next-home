import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { canalPor, type ChaveCanal, type Copy } from "@/lib/imagens/marketing";
import { expressaoDeCamera } from "./gramatica";
import { duracaoTotal, type Plano } from "./roteiro";

const executar = promisify(execFile);

/**
 * O motor de render: planos + copy → um mp4 pronto para publicar.
 *
 * ## Onde isto roda — e onde NÃO roda
 *
 * Não roda na Vercel. Medido em 03/09/2026: um vídeo de 17 s levou **86,9 s**
 * em 4 CPUs, contra o teto de 60 s por função do plano Hobby. Este módulo
 * existe para ser chamado por um worker (GitHub Actions ou contêiner), nunca
 * por uma rota. A rota enfileira; o worker chama isto.
 *
 * ## Por que FFmpeg por `execFile` e não uma biblioteca
 *
 * `fluent-ffmpeg` é um construtor de linha de comando com uma dependência a
 * mais e uma camada onde o erro fica pior. O que importa aqui é o filtro, e o
 * filtro é a string. Passando os argumentos como array, `execFile` também não
 * abre shell — nada do que vem do catálogo vira comando.
 *
 * ## As armadilhas que já custaram tempo
 *
 * - `scale=1080:1920:force_original_aspect_ratio=increase` no fundo. Escalar
 *   pela largura estoura o crop: as fotos do catálogo são ~1000x512 e não
 *   cobrem 1920 de altura.
 * - Upscale grande ANTES do `zoompan`. Ele trabalha em pixel inteiro e treme
 *   sem isso.
 * - Texto quebrado por LARGURA, não por caractere. Um apoio de 62 caracteres a
 *   34px ocupa ~1160px numa caixa de 936 e vaza pela direita — o mesmo defeito
 *   que já mordeu a arte estática.
 */

/** Espelha os tokens da marca em `globals.css`. Duas paletas divergiriam. */
const COR = {
  fundo: "#040b0a",
  titulo: "#f6faf9",
  corpo: "#dbe6e3",
  acento: "#2fd6a4",
  sobreAcento: "#04201a",
} as const;

const MARGEM = 64;
const FPS = 30;
const TRANSICAO = 0.7;
/** A faixa de foto nítida. O resto do quadro leva uma cópia borrada dela. */
const FAIXA = { altura: 760, topo: 420 };

/** A do runtime, a mesma escolha do carrossel. Fonte própria exigiria fontconfig. */
const FONTE_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

/**
 * Grade de cor: contraste, leve deslocamento de canal e nitidez. Sem ela a
 * foto parece foto; com ela parece material tratado.
 */
const GRADE =
  "eq=contrast=1.10:saturation=1.06:gamma=0.98," +
  "curves=r='0/0.02 0.5/0.5 1/0.98':b='0/0.04 0.5/0.5 1/0.96'," +
  "unsharp=5:5:0.40";

export type PedidoDeVideo = {
  planos: Plano[];
  copy: Copy;
  canal: ChaveCanal;
  /** Linha do rodapé: nome do corretor e o link de indicação. */
  rodape: string;
  /** PNG da marca. Sem ela, a marca sai em texto. */
  logo?: Buffer | null;
  /** Ressalva obrigatória, queimada no rodapé. */
  ressalva?: string;
};

export type ResultadoVideo =
  | { ok: true; bytes: Buffer; duracaoS: number; largura: number; altura: number; renderMs: number }
  | { ok: false; motivo: "sem_planos" | "sem_ffmpeg" | "falha_render"; detalhe?: string };

/** `&`, `<` e `>` quebram o SVG; `:`, `'` e `\` quebram o drawtext. */
function escaparTexto(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%");
}

/**
 * Quantos caracteres cabem numa linha desta largura e tamanho.
 *
 * 0,56em por caractere é a média medida da DejaVu em texto corrido. É a mesma
 * função de `compor.ts`, e existe pelo mesmo motivo: limite de caractere não é
 * limite de largura, e a diferença só aparece na imagem pronta.
 */
export function cabem(tamanho: number, largura: number): number {
  return Math.max(8, Math.floor(largura / (tamanho * 0.56)));
}

/** Quebra em até `maxLinhas`, truncando a última com reticências. */
export function quebrar(texto: string, porLinha: number, maxLinhas = 2): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (tentativa.length <= porLinha) atual = tentativa;
    else {
      if (atual) linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length <= maxLinhas) return linhas;
  const resto = linhas.slice(maxLinhas - 1).join(" ");
  return [...linhas.slice(0, maxLinhas - 1), `${resto.slice(0, porLinha - 1).trimEnd()}…`];
}

async function temFfmpeg(): Promise<boolean> {
  try {
    await executar("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** Um plano: fundo borrado + faixa nítida com movimento de câmera. */
function filtroDoPlano(plano: Plano, quadros: number): string {
  const cam = expressaoDeCamera(plano.movimento, quadros);
  return [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,`,
    `gblur=sigma=38,eq=brightness=-0.26:saturation=0.78,setsar=1[bg];`,
    `[0:v]scale=-1:3200:flags=lanczos,crop='min(iw,3200*1080/${FAIXA.altura})':3200,`,
    `zoompan=z='${cam.z}':x='${cam.x}':y='${cam.y}':d=${quadros}:s=1080x${FAIXA.altura}:fps=${FPS},`,
    `${GRADE},setsar=1[fg];`,
    `[bg][fg]overlay=(W-w)/2:${FAIXA.topo}:shortest=1,format=yuv420p[v]`,
  ].join("");
}

/**
 * A camada de texto.
 *
 * ## `y` é o TOPO do texto, não a linha de base
 *
 * Custou uma renderização descobrir. No `drawtext` do FFmpeg, `y` é a borda
 * superior da caixa — calcular como se fosse baseline empilha tudo para baixo
 * e o bloco sai espremido, com o título encostando no apoio. Aqui o layout é
 * montado de cima para baixo, com altura de linha explícita.
 *
 * ## O bloco é posicionado pela BASE
 *
 * Mede-se a altura total primeiro e coloca-se o bloco de modo a terminar
 * acima da zona morta do canal. É isso que garante que a copy fique visível
 * seja qual for o número de linhas do título — no story, a caixa de resposta
 * cobre os 340 px de baixo.
 */
function montarBloco(params: {
  copy: Copy;
  rodape: string;
  ressalva: string;
  legendas: Array<{ texto: string; de: number; ate: number }>;
  alturaArte: number;
  zonaMortaBase: number;
  temLogo: boolean;
  temLegenda: boolean;
}): { filtro: string; topo: number } {
  const { copy, rodape, ressalva, legendas, alturaArte, zonaMortaBase, temLogo, temLegenda } = params;
  const largo = 1080 - 2 * MARGEM;

  const tTitulo = copy.titulo.length > 22 ? 62 : 70;
  const [tApoio, tLegenda, tRodape, tRessalva] = [38, 30, 26, 22];
  const linhaTitulo = Math.round(tTitulo * 1.18);
  const linhaApoio = Math.round(tApoio * 1.35);
  const alturaCta = 62;

  const linhasTitulo = quebrar(copy.titulo, cabem(tTitulo, largo));
  const linhasApoio = copy.apoio ? quebrar(copy.apoio, cabem(tApoio, largo)) : [];

  // Espaços entre grupos. Generosos de propósito: bloco apertado é o que faz
  // a peça parecer amadora, e sobra altura no quadro.
  const GAP = { aposTitulo: 18, aposApoio: 14, aposLegenda: 22, aposCta: 26, aposRodape: 10 };

  const alturaBloco =
    linhasTitulo.length * linhaTitulo +
    GAP.aposTitulo +
    linhasApoio.length * linhaApoio +
    (linhasApoio.length ? GAP.aposApoio : 0) +
    (temLegenda ? Math.round(tLegenda * 1.3) + GAP.aposLegenda : 0) +
    alturaCta +
    GAP.aposCta +
    Math.round(tRodape * 1.3) +
    GAP.aposRodape +
    Math.round(tRessalva * 1.3);

  const topo = alturaArte - zonaMortaBase - MARGEM - alturaBloco;

  const escrever = (fonte: string, texto: string, tam: number, cor: string, y: number, enable?: string) =>
    `drawtext=fontfile=${fonte}:text='${escaparTexto(texto)}':fontsize=${tam}:fontcolor=${cor}:x=${MARGEM}:y=${Math.round(y)}` +
    (enable ? `:enable='${enable}'` : "");

  const partes: string[] = [];
  let y = topo;

  for (const linha of linhasTitulo) {
    partes.push(escrever(FONTE_BOLD, linha, tTitulo, COR.titulo, y));
    y += linhaTitulo;
  }
  y += GAP.aposTitulo;

  for (const linha of linhasApoio) {
    partes.push(escrever(FONTE, linha, tApoio, COR.corpo, y));
    y += linhaApoio;
  }
  if (linhasApoio.length) y += GAP.aposApoio;

  if (temLegenda) {
    for (const l of legendas) {
      if (l.texto) {
        partes.push(escrever(FONTE, l.texto, tLegenda, `${COR.corpo}@0.9`, y, `between(t,${l.de},${l.ate})`));
      }
    }
    y += Math.round(tLegenda * 1.3) + GAP.aposLegenda;
  }

  const largoCta = Math.min(largo, Math.round(copy.cta.length * 30 * 0.62 + 60));
  partes.push(
    `drawbox=x=${MARGEM}:y=${Math.round(y)}:w=${largoCta}:h=${alturaCta}:color=${COR.acento}@1:t=fill`,
    `drawtext=fontfile=${FONTE_BOLD}:text='${escaparTexto(copy.cta)}':fontsize=30:fontcolor=${COR.sobreAcento}:` +
      `x=${MARGEM}+(${largoCta}-tw)/2:y=${Math.round(y)}+(${alturaCta}-th)/2`,
  );
  y += alturaCta + GAP.aposCta;

  partes.push(escrever(FONTE, rodape, tRodape, `${COR.corpo}@0.9`, y));
  y += Math.round(tRodape * 1.3) + GAP.aposRodape;
  partes.push(escrever(FONTE, ressalva, tRessalva, `${COR.corpo}@0.65`, y));

  if (!temLogo) {
    partes.push(escrever(FONTE_BOLD, "NEXT HOME", 26, COR.acento, MARGEM + 40));
  }
  return { filtro: partes.join(","), topo };
}

export async function renderizarVideo(pedido: PedidoDeVideo): Promise<ResultadoVideo> {
  const inicio = Date.now();
  if (pedido.planos.length === 0) return { ok: false, motivo: "sem_planos" };
  if (!(await temFfmpeg())) {
    return {
      ok: false,
      motivo: "sem_ffmpeg",
      detalhe: "ffmpeg não está no PATH. Este módulo roda no worker de render, não na Vercel.",
    };
  }

  const canal = canalPor(pedido.canal);
  const pasta = await mkdtemp(join(tmpdir(), "video-"));
  try {
    // 1. Cada plano vira um mp4. São independentes: paralelizáveis quando o
    //    host tiver núcleos — 74,9 s dos 86,9 s medidos estão aqui.
    const clipes: string[] = [];
    for (const [i, plano] of pedido.planos.entries()) {
      const quadros = Math.round(plano.duracao * FPS);
      const foto = join(pasta, `p${i}.jpg`);
      const clipe = join(pasta, `c${i}.mp4`);
      const resposta = await fetch(plano.foto.url);
      if (!resposta.ok) {
        return { ok: false, motivo: "falha_render", detalhe: `foto ${i}: HTTP ${resposta.status}` };
      }
      await writeFile(foto, Buffer.from(await resposta.arrayBuffer()));
      await executar("ffmpeg", [
        "-y", "-loglevel", "error", "-loop", "1", "-i", foto,
        "-filter_complex", filtroDoPlano(plano, quadros),
        "-map", "[v]", "-t", String(plano.duracao), "-r", String(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", clipe,
      ]);
      clipes.push(clipe);
    }

    // 2. O bloco de texto decide onde o véu começa — 110 px acima do topo do
    //    texto, para o degradê já estar escuro quando a primeira linha entra.
    //    Véu de altura fixa deixava o título sobre a foto clara.
    const legendasDoPlano = pedido.planos.map((p, i) => {
      const de = pedido.planos.slice(0, i).reduce((s, x) => s + x.duracao - TRANSICAO, 0);
      return {
        texto: p.legenda,
        de: Number(Math.max(0, de + 0.3).toFixed(2)),
        ate: Number((de + p.duracao - 0.4).toFixed(2)),
      };
    });
    const bloco = montarBloco({
      copy: pedido.copy,
      rodape: pedido.rodape,
      ressalva: pedido.ressalva ?? "Imagem meramente ilustrativa",
      legendas: legendasDoPlano,
      alturaArte: canal.arte.altura,
      zonaMortaBase: canal.zonaMorta.base,
      temLogo: Boolean(pedido.logo),
      temLegenda: pedido.planos.some((p) => p.legenda),
    });
    const topoVeu = Math.max(0, bloco.topo - 110);
    const alturaVeu = canal.arte.altura - topoVeu;

    const veu = join(pasta, "veu.png");
    await executar("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", `color=c=black:s=1080x${alturaVeu},format=rgba`,
      "-vf", "geq=r=0:g=0:b=0:a='255*pow(Y/H,1.4)'", "-frames:v", "1", veu,
    ]);

    let logo: string | null = null;
    if (pedido.logo) {
      logo = join(pasta, "logo.png");
      await writeFile(logo, pedido.logo);
    }

    // 3. Costura com crossfade. O offset de cada transição desconta as
    //    anteriores, senão os planos se empilham no começo.
    const entradas: string[] = [];
    for (const c of clipes) entradas.push("-i", c);
    entradas.push("-i", veu);
    if (logo) entradas.push("-i", logo);
    const iVeu = clipes.length;
    const iLogo = logo ? clipes.length + 1 : -1;

    const cadeia: string[] = [];
    let atual = "[0]";
    let offset = 0;
    for (let i = 1; i < clipes.length; i++) {
      offset += pedido.planos[i - 1].duracao - TRANSICAO;
      const saida = i === clipes.length - 1 ? "[xf]" : `[x${i}]`;
      cadeia.push(`${atual}[${i}]xfade=transition=fade:duration=${TRANSICAO}:offset=${offset.toFixed(2)}${saida}`);
      atual = saida;
    }
    if (clipes.length === 1) cadeia.push(`[0]null[xf]`);

    cadeia.push(`[${iVeu}]format=rgba[veu]`);
    cadeia.push(`[xf][veu]overlay=0:${topoVeu}[comveu]`);
    if (iLogo >= 0) {
      cadeia.push(`[${iLogo}]scale=250:-1[lg]`);
      cadeia.push(`[comveu][lg]overlay=${MARGEM}:${canal.zonaMorta.topo + MARGEM}[base]`);
    } else {
      cadeia.push(`[comveu]null[base]`);
    }
    cadeia.push(
      `[base]scale=${canal.arte.largura}:${canal.arte.altura}:force_original_aspect_ratio=increase,` +
        `crop=${canal.arte.largura}:${canal.arte.altura},` +
        bloco.filtro +
        `,format=yuv420p[v]`,
    );

    const saida = join(pasta, "final.mp4");
    await executar(
      "ffmpeg",
      ["-y", "-loglevel", "error", ...entradas, "-filter_complex", cadeia.join(";"),
       "-map", "[v]", "-r", String(FPS), "-an",
       "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-movflags", "+faststart", saida],
      { maxBuffer: 32 * 1024 * 1024 },
    );

    return {
      ok: true,
      bytes: await readFile(saida),
      duracaoS: duracaoTotal(pedido.planos, TRANSICAO),
      largura: canal.arte.largura,
      altura: canal.arte.altura,
      renderMs: Date.now() - inicio,
    };
  } catch (e) {
    return { ok: false, motivo: "falha_render", detalhe: e instanceof Error ? e.message.slice(0, 400) : String(e) };
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}
