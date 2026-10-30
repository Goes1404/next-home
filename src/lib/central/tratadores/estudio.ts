import "server-only";

import { conferirArtePeloCentral, gerarArtePeloCentral, type ConferenciaDaArte, type ResultadoDaArte } from "@/lib/estudio/artePeloCentral";
import type { ChaveTamanho } from "@/lib/imagens/imagensTipos";
import type { ChaveCanal, ChaveObjetivo } from "@/lib/imagens/marketing";
import { createServiceClient } from "@/lib/supabase/service";
import { conferirVideoPeloCentral, criarVideoPeloCentral, type ConferenciaDoVideo, type ResultadoDoVideo } from "@/lib/video/videoPeloCentral";
import type { Acao, Consulta, ContextoDoCentral, EntregaDepois, Preparo, ResultadoDaAcao } from "../executar";
import { acharImovel, lerCatalogoDoGrupo, respostaDeImovelIncerto, type ImovelDoCatalogo } from "./imoveis";

/**
 * Frente M — arte e vídeo da onda 3: gerar_arte (16), criar_video (32).
 *
 * Contrato em `../executar.ts`. As duas GASTAM (a arte chama o gerador de
 * imagem; o vídeo usa um crédito e o render), então as duas são AÇÃO: o
 * `preparar` acha o imóvel e confere cota e limite sem gastar nada, e a
 * proposta diz que consome cota e que não tem volta (arte gerada e vídeo
 * na fila não "desgeram"; não há `desfazer`).
 *
 * Nada de motor novo: a arte é a geração do Estúdio
 * (`@/lib/estudio/artePeloCentral`, as travas e o livro do consumo da rota
 * `/api/imagens/gerar`) e o vídeo é o criador da plataforma
 * (`@/lib/video/videoPeloCentral`, a fila `video_jobs` da 0092). O imóvel
 * pelo texto é o da Frente F (`acharImovel`, sobre `imoveisCitados`), no
 * catálogo do grupo de quem pede: ambíguo vira pergunta.
 *
 * O que volta (4.5): a arte volta como ARQUIVO (`arquivos`), para o corretor
 * encaminhar. Se a geração passa de ~25 s, o webhook não fica esperando: a
 * resposta é "estou gerando, te mando em instantes" e a mesma geração, já
 * em andamento, é entregue depois (`depois`, que o webhook espera com
 * `after`). O vídeo é sempre assíncrono (minutos, fora da Vercel): a
 * proposta confirmada só põe na fila, e o vídeo volta pelo central quando o
 * worker conclui (`@/lib/video/entregaPeloCentral`, no tique).
 *
 * A frase e o pedido livre (conversa da Bruna, 30/10/2026): "cria uma arte
 * do Dom Parque com a frase: Visite e ganhe um champanhe…" perdia a frase
 * (a ferramenta só tinha imóvel e formato), e "uma imagem futurística de um
 * prédio flutuante" sem imóvel não tinha caminho. Agora `texto_na_arte` vai
 * ao gerador como texto DITADO, intacto (ver `artePeloCentral.ts`), e
 * `pedido` entra no pedido do tradutor, como o que se digita na tela. Sem
 * imóvel, a arte é livre, como o Estúdio permite; imóvel citado e ambíguo
 * continua pergunta.
 *
 * Contexto (corretor, grupo) só pela identificação, nunca pelos argumentos.
 */

/** Até quanto o "sim" espera a arte antes de responder "te mando em instantes". */
export const ESPERA_DA_ARTE_MS = 25_000;

// ── As peças trocáveis (o teste passa as dele) ───────────────────────────

export type DependenciasDoEstudio = {
  /** O catálogo do grupo de quem pede (Frente F). */
  catalogo: (grupoId: string) => Promise<ImovelDoCatalogo[]>;
  conferirArte: (quem: { corretorId: string; grupoId: string }) => Promise<ConferenciaDaArte>;
  gerarArte: (pedido: Parameters<typeof gerarArtePeloCentral>[0]) => Promise<ResultadoDaArte>;
  conferirVideo: (quem: { corretorId: string; grupoId: string }) => Promise<ConferenciaDoVideo>;
  criarVideo: (pedido: Parameters<typeof criarVideoPeloCentral>[0]) => Promise<ResultadoDoVideo>;
  esperaDaArteMs: number;
};

const PADRAO: DependenciasDoEstudio = {
  catalogo: (grupoId) => lerCatalogoDoGrupo(createServiceClient(), grupoId),
  conferirArte: conferirArtePeloCentral,
  gerarArte: gerarArtePeloCentral,
  conferirVideo: conferirVideoPeloCentral,
  criarVideo: criarVideoPeloCentral,
  esperaDaArteMs: ESPERA_DA_ARTE_MS,
};

// ── O que a pessoa pediu ─────────────────────────────────────────────────

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * O formato da arte pelo que a pessoa disse, com a régua do Estúdio
 * (`tamanhoDoTexto` do turno): story/reels → retrato; capa/banner →
 * paisagem; o resto (post, feed, Instagram) → quadrado.
 */
export function formatoDaArte(pedido: string): { tamanho: ChaveTamanho; nome: string } {
  const t = normalizar(pedido);
  if (/\b(story|stories|storie|reels?|status|vertical|retrato)\b/.test(t)) return { tamanho: "retrato", nome: "story" };
  if (/\b(capa|banner|paisagem|horizontal|site)\b/.test(t)) return { tamanho: "paisagem", nome: "capa" };
  return { tamanho: "quadrado", nome: "post" };
}

/** O canal do vídeo: Reels/Story (vertical) é o padrão, que é o que se pede. */
export function canalDoVideo(pedido: string): { canal: ChaveCanal; nome: string } {
  const t = normalizar(pedido);
  if (/\bfeed\b/.test(t)) return { canal: "feed", nome: "para o feed" };
  if (/\b(anuncio|anuncios|quadrado)\b/.test(t)) return { canal: "anuncio", nome: "quadrado, para anúncio" };
  return { canal: "story", nome: "vertical (Reels/Story)" };
}

/** O objetivo do vídeo pela fase do imóvel: é o que a tela sugere primeiro. */
export function objetivoDoVideo(status: string): ChaveObjetivo {
  if (status === "ultimas_unidades") return "ultimas_unidades";
  if (status === "pronto_para_morar") return "pronto_para_morar";
  return "lancamento";
}

async function imovelDoPedido(
  deps: DependenciasDoEstudio,
  ctx: ContextoDoCentral,
  argumentos: Record<string, unknown>,
): Promise<{ tipo: "um"; imovel: ImovelDoCatalogo } | { tipo: "resposta"; resultado: unknown }> {
  const pedido = texto(argumentos.imovel);
  if (!pedido) return { tipo: "resposta", resultado: { pergunta: "De qual imóvel? Pergunte o nome como está no cadastro." } };
  return acharDoTexto(deps, ctx, pedido);
}

async function acharDoTexto(
  deps: DependenciasDoEstudio,
  ctx: ContextoDoCentral,
  pedido: string,
): Promise<{ tipo: "um"; imovel: ImovelDoCatalogo } | { tipo: "resposta"; resultado: unknown }> {
  const achado = acharImovel(pedido, await deps.catalogo(ctx.grupoId), ctx.imobiliaria);
  return achado.tipo === "um" ? achado : { tipo: "resposta", resultado: respostaDeImovelIncerto(achado, pedido) };
}

// ── gerar_arte ───────────────────────────────────────────────────────────

/**
 * Teto da frase na arte. Não se corta (a frase sai como foi pedida ou não
 * sai): acima disto é parágrafo, e parágrafo numa imagem gerada sai
 * amontoado e com letra trocada — a mesma régua do `TETO_DE_TEXTOS`.
 */
export const TETO_DA_FRASE = 160;

/** Teto do pedido livre: é descrição, então pode ser aparado sem trair ninguém. */
const TETO_DO_PEDIDO = 400;

/**
 * A frase como a pessoa pediu. Só sai o que não é dela: espaço nas pontas e
 * as aspas que o cérebro às vezes põe em volta ("…" ou “…”). Dentro, nada
 * muda — nem maiúscula, nem pontuação, nem acento.
 */
export function fraseDaArte(v: unknown): string {
  const t = texto(v);
  const semAspas = /^["“”']([\s\S]*)["“”']$/.exec(t);
  return (semAspas ? semAspas[1] : t).trim();
}

/** O assunto curto no resumo: o pedido livre cabe numa linha de WhatsApp. */
function assuntoCurto(pedido: string): string {
  return pedido.length > 120 ? `${pedido.slice(0, 119).trimEnd()}…` : pedido;
}

/** "o post", "a capa"; "um story", "uma capa". */
const comArtigo = (peca: string, artigo: "o" | "um") =>
  peca === "capa" ? `${artigo === "o" ? "a" : "uma"} capa` : `${artigo} ${peca}`;

const quem = (ctx: ContextoDoCentral) => ({ corretorId: ctx.corretorId, grupoId: ctx.grupoId });

/** Espera a promessa até `ms`; passou disso, devolve "ainda não" (ela segue rodando). */
async function noTempo<T>(p: Promise<T>, ms: number): Promise<{ pronto: true; valor: T } | { pronto: false }> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const espera = new Promise<{ pronto: false }>((resolver) => {
    relogio = setTimeout(() => resolver({ pronto: false }), ms);
  });
  try {
    return await Promise.race([p.then((valor) => ({ pronto: true as const, valor })), espera]);
  } finally {
    clearTimeout(relogio);
  }
}

type EntregaDaArte = EntregaDepois & { ok: boolean };

/** " do Vitta" com imóvel; nada na arte livre ("o post"). */
const doImovel = (nome: string | null) => (nome ? ` do ${nome}` : "");

/**
 * A arte pronta (ou a falha) no que a conversa manda: o texto e o arquivo.
 * `nome` nulo = arte livre. Com frase, pede para conferir: o gerador não
 * garante a grafia (ver `artePeloCentral.ts`).
 */
export function entregaDaArte(r: ResultadoDaArte, nome: string | null, peca: string, frase = false): EntregaDaArte {
  if (!r.ok) return { ok: false, texto: `Não consegui gerar a arte${doImovel(nome)}: ${r.erro}`, arquivos: [] };
  const aviso =
    r.ressalva === "falhou"
      ? ' Atenção: o aviso "imagem ilustrativa" não entrou nesta arte; não publique sem ele.'
      : "";
  const confira = frase ? " Confira a frase antes de publicar: o gerador de imagem às vezes troca uma letra." : "";
  return {
    ok: true,
    texto: `Pronto, ${comArtigo(peca, "o")}${doImovel(nome)}. É só encaminhar; também fica na galeria do Estúdio.${aviso}${confira}`,
    arquivos: [{ tipo: "imagem", url: r.url }],
  };
}

function criarGerarArte(deps: DependenciasDoEstudio): Acao {
  return {
    async preparar(ctx, argumentos): Promise<Preparo> {
      const pedidoLivre = texto(argumentos.pedido).replace(/\s+/g, " ").slice(0, TETO_DO_PEDIDO).trim();
      const frase = fraseDaArte(argumentos.texto_na_arte);
      const doTexto = texto(argumentos.imovel);
      // Sem imóvel, sem pedido e sem frase não há arte: a pergunta de sempre.
      // Sem imóvel mas com o que desenhar, é arte livre (o Estúdio permite).
      if (!doTexto && !pedidoLivre && !frase) {
        return { tipo: "resposta", resultado: { pergunta: "De qual imóvel? Ou o que a pessoa quer ver na imagem?" } };
      }
      if (frase.length > TETO_DA_FRASE) {
        return {
          tipo: "resposta",
          resultado: { pergunta: `A frase tem ${frase.length} caracteres; numa arte, acima de ${TETO_DA_FRASE} ela sai amontoada. Pode encurtar?` },
        };
      }
      let imovel: ImovelDoCatalogo | null = null;
      if (doTexto) {
        const achado = await acharDoTexto(deps, ctx, doTexto);
        if (achado.tipo === "resposta") return achado;
        imovel = achado.imovel;
      }
      // A cota antes de propor: proposta que o "sim" recusaria é pergunta à toa.
      const conferida = await deps.conferirArte(quem(ctx));
      if (!conferida.ok) return { tipo: "resposta", resultado: { erro: conferida.erro } };
      const pedidoDoFormato = texto(argumentos.formato).slice(0, 120);
      const { tamanho, nome: peca } = formatoDaArte(pedidoDoFormato);
      const nome = imovel?.nome ?? null;

      // O que vai ao tradutor do Estúdio: o mesmo pedido em texto da tela, com
      // o que a pessoa quer ver nas palavras dela e a frase entre aspas (é a
      // convenção do ditado; o tradutor decide posição e letra). A frase
      // exata segue à parte, em `textoNaArte`, e é ela que vale no gerador.
      const pecaMaiuscula = `${peca[0].toUpperCase()}${peca.slice(1)}`;
      const partes = [`${pecaMaiuscula}${doImovel(nome)} para redes sociais${pedidoDoFormato ? ` (${pedidoDoFormato})` : ""}`];
      if (pedidoLivre) partes.push(`O que mostrar: ${pedidoLivre}`);
      if (frase) partes.push(`Com o texto "${frase}" escrito na arte, exatamente assim`);
      const comAssunto = pedidoLivre ? ` (${assuntoCurto(pedidoLivre)})` : "";
      const comFrase = frase ? ` com a frase "${frase}"` : "";
      return {
        tipo: "proposta",
        resumo: `Gerar com IA ${comArtigo(peca, "um")}${doImovel(nome)}${comAssunto}${comFrase} e te mandar a imagem para encaminhar (consome cota de IA da imobiliária; arte gerada não tem como desfazer).`,
        dados: {
          imovelId: imovel?.id ?? null,
          imovelNome: nome,
          formato: tamanho,
          peca,
          pedido: `${partes.join(". ")}.`,
          textoNaArte: frase || null,
        },
      };
    },
    async executar(ctx, dados): Promise<ResultadoDaAcao> {
      // Proposta de antes desta mudança (vale 1 h) não tem `textoNaArte`; arte
      // livre tem imóvel nulo. Os dois caminhos são o mesmo `gerarArte`.
      const nome = typeof dados.imovelNome === "string" && dados.imovelNome ? dados.imovelNome : null;
      const imovelId = typeof dados.imovelId === "string" && dados.imovelId ? dados.imovelId : null;
      const frase = typeof dados.textoNaArte === "string" && dados.textoNaArte ? dados.textoNaArte : undefined;
      const peca = String(dados.peca ?? "post");
      // A geração começa agora e nunca rejeita: a falha vira texto. Se passar
      // da espera, é ELA (já paga ou em curso) que segue para o `depois`.
      const geracao: Promise<EntregaDaArte> = deps
        .gerarArte({
          ...quem(ctx),
          empreendimentoId: imovelId,
          formato: (dados.formato as ChaveTamanho) ?? "quadrado",
          texto: String(dados.pedido),
          ...(frase ? { textoNaArte: frase } : {}),
        })
        .then((r) => entregaDaArte(r, nome, peca, Boolean(frase)))
        .catch((erro) => {
          console.error("[central] arte falhou:", erro);
          return { ok: false, texto: `Não consegui gerar a arte${doImovel(nome)} agora. Pode pedir de novo?`, arquivos: [] };
        });
      const r = await noTempo(geracao, deps.esperaDaArteMs);
      if (r.pronto) return { ok: r.valor.ok, texto: r.valor.texto, arquivos: r.valor.arquivos };
      return {
        ok: true,
        texto: `Estou gerando ${comArtigo(peca, "o")}${doImovel(nome)}; te mando aqui em instantes.`,
        depois: geracao.then(({ texto: t, arquivos }) => ({ texto: t, arquivos })),
      };
    },
  };
}

// ── criar_video ──────────────────────────────────────────────────────────

function criarCriarVideo(deps: DependenciasDoEstudio): Acao {
  return {
    async preparar(ctx, argumentos): Promise<Preparo> {
      const achado = await imovelDoPedido(deps, ctx, argumentos);
      if (achado.tipo === "resposta") return achado;
      const { imovel } = achado;
      const conferida = await deps.conferirVideo(quem(ctx));
      if (!conferida.ok) return { tipo: "resposta", resultado: { erro: conferida.erro } };
      // A ferramenta só declara o imóvel; se o cérebro mandar o formato, vale.
      const { canal, nome } = canalDoVideo(`${texto(argumentos.formato)} ${texto(argumentos.canal)}`);
      const restam = conferida.disponiveis === 1 ? "o último vídeo do seu mês" : `1 dos seus ${conferida.disponiveis} vídeos do mês`;
      return {
        tipo: "proposta",
        resumo: `Criar um vídeo ${nome} do ${imovel.nome} com as fotos do cadastro. Fica pronto em alguns minutos e eu te mando aqui. Usa ${restam} e não tem como desfazer.`,
        dados: { imovelId: imovel.id, imovelNome: imovel.nome, canal, objetivo: objetivoDoVideo(imovel.status) },
      };
    },
    async executar(ctx, dados): Promise<ResultadoDaAcao> {
      const nome = String(dados.imovelNome);
      const r = await deps.criarVideo({
        ...quem(ctx),
        empreendimentoId: String(dados.imovelId),
        canal: dados.canal as ChaveCanal,
        objetivo: dados.objetivo as ChaveObjetivo,
      });
      if (!r.ok) return { ok: false, texto: `Não consegui pedir o vídeo do ${nome}: ${r.erro}` };
      return { ok: true, texto: `Pedi o vídeo do ${nome}. Costuma levar alguns minutos; te mando aqui quando ficar pronto.` };
    },
  };
}

export function criarTratadoresDoEstudio(parciais: Partial<DependenciasDoEstudio> = {}): {
  consultas: Record<string, Consulta>;
  acoes: Record<string, Acao>;
} {
  const deps = { ...PADRAO, ...parciais };
  return { consultas: {}, acoes: { gerar_arte: criarGerarArte(deps), criar_video: criarCriarVideo(deps) } };
}

const PRONTOS = criarTratadoresDoEstudio();
export const CONSULTAS_ESTUDIO: Record<string, Consulta> = PRONTOS.consultas;
export const ACOES_ESTUDIO: Record<string, Acao> = PRONTOS.acoes;
