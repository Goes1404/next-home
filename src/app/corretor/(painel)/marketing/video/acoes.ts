"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { linkDeIndicacao } from "@/lib/social/linkDeIndicacao";
import {
  canalPor,
  montarBriefing,
  problemasDaCopy,
  type ChaveCanal,
  type ChaveObjetivo,
  type Copy,
} from "@/lib/imagens/marketing";
import { enfileirarVideo, getMeusVideos, getSaldo } from "@/lib/video/fila";
import { acionarRender } from "@/lib/video/acionarRender";
import { duracaoTotal, montarRoteiro } from "@/lib/video/roteiro";
import { regraDoTipo, type TipoDePlano } from "@/lib/video/gramatica";
import { classificarFotos } from "@/lib/video/classificarFotos";
import { STATUS_LABEL, type Midia, type StatusObra } from "@/lib/types";
import type { VideoJob } from "@/lib/video/videoTipos";

/**
 * As ações da tela de vídeo.
 *
 * ## Ver o roteiro NÃO custa nada
 *
 * `verRoteiro` é separada de `criarVideo` de propósito: o corretor precisa ver
 * quais planos vão entrar, em que ordem e com que movimento ANTES de gastar
 * um crédito. É a mesma razão pela qual "melhorar a descrição" ficou fora do
 * teto diário da arte — o passo que evita o desperdício não pode custar.
 */


/**
 * De onde vêm as fotos.
 *
 * O catálogo continua sendo o caminho rico — ele traz `alt` descrito por visão
 * e a ficha inteira. As fotos do corretor são o caminho que funciona para
 * imóvel que não está cadastrado aqui, e é o que o produto precisa para
 * atender imobiliária de fora.
 */
export type FotoEnviada = { url: string };

export type PedidoDeVideo =
  | { fonte: "catalogo"; slug: string; objetivo: ChaveObjetivo; canal: ChaveCanal }
  | {
      fonte: "minhas";
      fotos: FotoEnviada[];
      nome: string;
      lugar: string;
      estagio: StatusObra;
      objetivo: ChaveObjetivo;
      canal: ChaveCanal;
    };

/**
 * Fotos enviadas viram `Midia` com `alt` SINTÉTICO, montado da classificação
 * por visão. É esse `alt` que a gramática lê para escolher o movimento — sem
 * ele todo plano viraria PUSH e a variedade morreria justo no caminho novo.
 */
function comoMidias(fotos: FotoEnviada[], tipos: TipoDePlano[]): Midia[] {
  const ALT_POR_TIPO: Record<TipoDePlano, string> = {
    fachada: "Fachada do empreendimento",
    interior: "Living integrado do apartamento",
    lazer: "Piscina e área de lazer do condomínio",
    implantacao: "Vista aérea da implantação do condomínio",
  };
  return fotos.map((f, i) => ({
    tipo: "foto" as const,
    url: f.url,
    alt: ALT_POR_TIPO[tipos[i] ?? "interior"],
    largura: 0,
    altura: 0,
    blurDataUrl: null,
  }));
}

export type PlanoNaTela = {
  url: string;
  tipo: string;
  rotuloTipo: string;
  movimento: string;
  ajuda: string;
  duracao: number;
  legenda: string;
};

export type Roteiro = {
  planos: PlanoNaTela[];
  duracaoS: number;
  copy: Copy;
  canalRotulo: string;
  largura: number;
  altura: number;
  /** Vazio quando a copy passa. Cheio, a criação é recusada com o motivo. */
  problemas: string[];
};

async function preparar(pedido: PedidoDeVideo) {
  if (pedido.fonte === "catalogo") {
    const imovel = await getEmpreendimentoDoPainel(pedido.slug);
    if (!imovel) return { erro: "Imóvel não encontrado." as const };
    const briefing = montarBriefing({
      imovel,
      objetivo: pedido.objetivo,
      canal: pedido.canal,
      publico: "familia",
    });
    return {
      fotos: imovel.galeria,
      copy: {
        titulo: imovel.nome,
        apoio: `${imovel.bairro}, ${imovel.cidade}`,
        cta: briefing.objetivo.ctas[0],
      } satisfies Copy,
      imovelId: imovel.id ?? null,
      imovelNome: imovel.nome,
      imovelSlug: imovel.slug,
    };
  }

  const nome = pedido.nome.trim();
  if (!nome) return { erro: "Dê um nome ao imóvel." as const };
  if (pedido.fotos.length < 3) {
    // Menos de três planos não é vídeo, é slideshow curto — e ainda gastaria
    // um crédito. Barrar aqui é mais honesto que entregar algo pobre.
    return { erro: "Envie pelo menos 3 fotos." as const };
  }

  const tipos = await classificarFotos(pedido.fotos.map((f) => f.url));
  const briefing = montarBriefing({
    imovel: null,
    objetivo: pedido.objetivo,
    canal: pedido.canal,
    publico: "familia",
  });
  const lugar = pedido.lugar.trim();
  return {
    fotos: comoMidias(pedido.fotos, tipos),
    copy: {
      titulo: nome,
      // Sem lugar, o apoio vira o estágio da obra: linha vazia num vídeo é
      // buraco, e o estágio é o fato que sempre existe.
      apoio: lugar ? `${lugar} · ${STATUS_LABEL[pedido.estagio]}` : STATUS_LABEL[pedido.estagio],
      cta: briefing.objetivo.ctas[0],
    } satisfies Copy,
    imovelId: null as string | null,
    imovelNome: nome,
    imovelSlug: null as string | null,
  };
}

export async function verRoteiro(
  pedido: PedidoDeVideo,
): Promise<{ roteiro?: Roteiro; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const p = await preparar(pedido);
  if ("erro" in p) return { erro: p.erro };

  const planos = montarRoteiro({ fotos: p.fotos, objetivo: pedido.objetivo });
  if (planos.length === 0) return { erro: "Nenhuma foto utilizável — sem foto não há vídeo." };

  const c = canalPor(pedido.canal);
  return {
    roteiro: {
      planos: planos.map((plano) => {
        const regra = regraDoTipo(plano.tipo);
        return {
          url: plano.foto.url,
          tipo: plano.tipo,
          rotuloTipo: regra.rotulo,
          movimento: plano.movimento,
          ajuda: regra.ajuda,
          duracao: plano.duracao,
          legenda: plano.legenda,
        };
      }),
      duracaoS: duracaoTotal(planos),
      copy: p.copy,
      canalRotulo: c.rotulo,
      largura: c.arte.largura,
      altura: c.arte.altura,
      problemas: problemasDaCopy(p.copy),
    },
  };
}

export async function criarVideo(pedido: PedidoDeVideo): Promise<{ erro?: string; jobId?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const p = await preparar(pedido);
  if ("erro" in p) return { erro: p.erro };

  const planos = montarRoteiro({ fotos: p.fotos, objetivo: pedido.objetivo });
  if (planos.length === 0) return { erro: "Nenhuma foto utilizável." };

  // A régua de publicidade vale de novo aqui, e não só na montagem: entre ver
  // o roteiro e criar o vídeo o cadastro (ou o texto digitado) pode ter mudado.
  const problemas = problemasDaCopy(p.copy);
  if (problemas.length > 0) {
    return { erro: `A copy não pode ir assim: ${problemas.join("; ")}.` };
  }

  const r = await enfileirarVideo({
    corretorId: corretor.id,
    empreendimentoId: p.imovelId,
    briefing: {
      objetivo: pedido.objetivo,
      canal: pedido.canal,
      publico: "familia",
      fonte: pedido.fonte,
      imovelSlug: p.imovelSlug,
      imovelNome: p.imovelNome,
      corretorId: corretor.id,
      rodape: `${corretor.nome} · ${linkDeIndicacao(corretor.slug)}`,
      ...p.copy,
    },
    roteiro: planos,
  });

  if (!r.ok) {
    return {
      erro:
        r.motivo === "sem_saldo"
          ? "Seus vídeos do mês acabaram. O limite volta no dia 1º."
          : "Não deu para entrar na fila. Tente de novo em instantes.",
    };
  }

  /*
   * Acende o worker AGORA, sem `await`.
   *
   * Sem esta linha o job fica na fila até alguém acionar o GitHub Actions à
   * mão — foi exatamente o que aconteceu em 03/09/2026: vídeo pedido às
   * 14h15, `tentativas = 0`, e o workflow com zero execuções na vida.
   *
   * Sem `await` de propósito: quem clicou não pode esperar o GitHub
   * responder, e o acionamento é só um atalho — o `schedule` do workflow
   * varre a fila de hora em hora se isto falhar. Ver `acionarRender.ts`.
   */
  acionarRender();

  revalidatePath("/corretor/marketing/video");
  return { jobId: r.jobId };
}

/** O que a tela busca a cada tique enquanto houver vídeo em andamento. */
export async function statusDosVideos(): Promise<{
  videos: VideoJob[];
  saldo: { disponiveis: number; cotaMensal: number };
}> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { videos: [], saldo: { disponiveis: 0, cotaMensal: 0 } };
  const [videos, saldo] = await Promise.all([getMeusVideos(), getSaldo(corretor.id)]);
  return { videos, saldo: { disponiveis: saldo.disponiveis, cotaMensal: saldo.cotaMensal } };
}
