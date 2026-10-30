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
  const achado = acharImovel(pedido, await deps.catalogo(ctx.grupoId), ctx.imobiliaria);
  return achado.tipo === "um" ? achado : { tipo: "resposta", resultado: respostaDeImovelIncerto(achado, pedido) };
}

// ── gerar_arte ───────────────────────────────────────────────────────────

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

/** A arte pronta (ou a falha) no que a conversa manda: o texto e o arquivo. */
export function entregaDaArte(r: ResultadoDaArte, nome: string, peca: string): EntregaDaArte {
  if (!r.ok) return { ok: false, texto: `Não consegui gerar a arte do ${nome}: ${r.erro}`, arquivos: [] };
  const aviso =
    r.ressalva === "falhou"
      ? ' Atenção: o aviso "imagem ilustrativa" não entrou nesta arte; não publique sem ele.'
      : "";
  return {
    ok: true,
    texto: `Pronto, ${comArtigo(peca, "o")} do ${nome}. É só encaminhar; também fica na galeria do Estúdio.${aviso}`,
    arquivos: [{ tipo: "imagem", url: r.url }],
  };
}

function criarGerarArte(deps: DependenciasDoEstudio): Acao {
  return {
    async preparar(ctx, argumentos): Promise<Preparo> {
      const achado = await imovelDoPedido(deps, ctx, argumentos);
      if (achado.tipo === "resposta") return achado;
      const { imovel } = achado;
      // A cota antes de propor: proposta que o "sim" recusaria é pergunta à toa.
      const conferida = await deps.conferirArte(quem(ctx));
      if (!conferida.ok) return { tipo: "resposta", resultado: { erro: conferida.erro } };
      const pedidoDoFormato = texto(argumentos.formato).slice(0, 120);
      const { tamanho, nome: peca } = formatoDaArte(pedidoDoFormato);
      return {
        tipo: "proposta",
        resumo: `Gerar com IA ${comArtigo(peca, "um")} do ${imovel.nome} e te mandar a imagem para encaminhar (consome cota de IA da imobiliária; arte gerada não tem como desfazer).`,
        dados: {
          imovelId: imovel.id,
          imovelNome: imovel.nome,
          formato: tamanho,
          peca,
          // O que vai ao tradutor do Estúdio, o mesmo pedido em texto da tela.
          pedido: `${peca[0].toUpperCase()}${peca.slice(1)} do ${imovel.nome} para redes sociais${pedidoDoFormato ? ` (${pedidoDoFormato})` : ""}`,
        },
      };
    },
    async executar(ctx, dados): Promise<ResultadoDaAcao> {
      const nome = String(dados.imovelNome);
      const peca = String(dados.peca ?? "post");
      // A geração começa agora e nunca rejeita: a falha vira texto. Se passar
      // da espera, é ELA (já paga ou em curso) que segue para o `depois`.
      const geracao: Promise<EntregaDaArte> = deps
        .gerarArte({
          ...quem(ctx),
          empreendimentoId: String(dados.imovelId),
          formato: (dados.formato as ChaveTamanho) ?? "quadrado",
          texto: String(dados.pedido),
        })
        .then((r) => entregaDaArte(r, nome, peca))
        .catch((erro) => {
          console.error("[central] arte falhou:", erro);
          return { ok: false, texto: `Não consegui gerar a arte do ${nome} agora. Pode pedir de novo?`, arquivos: [] };
        });
      const r = await noTempo(geracao, deps.esperaDaArteMs);
      if (r.pronto) return { ok: r.valor.ok, texto: r.valor.texto, arquivos: r.valor.arquivos };
      return {
        ok: true,
        texto: `Estou gerando ${comArtigo(peca, "o")} do ${nome}; te mando aqui em instantes.`,
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
