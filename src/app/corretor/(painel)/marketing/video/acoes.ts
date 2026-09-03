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
import { duracaoTotal, montarRoteiro } from "@/lib/video/roteiro";
import { regraDoTipo } from "@/lib/video/gramatica";
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

function montar(params: {
  imovel: NonNullable<Awaited<ReturnType<typeof getEmpreendimentoDoPainel>>>;
  objetivo: ChaveObjetivo;
  canal: ChaveCanal;
}) {
  const briefing = montarBriefing({
    imovel: params.imovel,
    objetivo: params.objetivo,
    canal: params.canal,
    publico: "familia",
  });
  const copy: Copy = {
    titulo: params.imovel.nome,
    apoio: `${params.imovel.bairro}, ${params.imovel.cidade}`,
    cta: briefing.objetivo.ctas[0],
  };
  const planos = montarRoteiro({ fotos: params.imovel.galeria, objetivo: params.objetivo });
  return { briefing, copy, planos };
}

export async function verRoteiro(
  slug: string,
  objetivo: ChaveObjetivo,
  canal: ChaveCanal,
): Promise<{ roteiro?: Roteiro; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const imovel = await getEmpreendimentoDoPainel(slug);
  if (!imovel) return { erro: "Imóvel não encontrado." };

  const { copy, planos } = montar({ imovel, objetivo, canal });
  if (planos.length === 0) {
    return { erro: "Este imóvel ainda não tem foto — sem foto não há vídeo." };
  }

  const c = canalPor(canal);
  return {
    roteiro: {
      planos: planos.map((p) => {
        const regra = regraDoTipo(p.tipo);
        return {
          url: p.foto.url,
          tipo: p.tipo,
          rotuloTipo: regra.rotulo,
          movimento: p.movimento,
          ajuda: regra.ajuda,
          duracao: p.duracao,
          legenda: p.legenda,
        };
      }),
      duracaoS: duracaoTotal(planos),
      copy,
      canalRotulo: c.rotulo,
      largura: c.arte.largura,
      altura: c.arte.altura,
      problemas: problemasDaCopy(copy),
    },
  };
}

export async function criarVideo(
  slug: string,
  objetivo: ChaveObjetivo,
  canal: ChaveCanal,
): Promise<{ erro?: string; jobId?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const imovel = await getEmpreendimentoDoPainel(slug);
  if (!imovel) return { erro: "Imóvel não encontrado." };

  const { copy, planos } = montar({ imovel, objetivo, canal });
  if (planos.length === 0) return { erro: "Este imóvel ainda não tem foto." };

  // A régua de publicidade vale de novo aqui, e não só na montagem: entre ver
  // o roteiro e criar o vídeo o cadastro pode ter mudado. É o serviço, não
  // formalidade.
  const problemas = problemasDaCopy(copy);
  if (problemas.length > 0) {
    return { erro: `A copy não pode ir assim: ${problemas.join("; ")}.` };
  }

  const r = await enfileirarVideo({
    corretorId: corretor.id,
    empreendimentoId: imovel.id ?? null,
    briefing: {
      objetivo,
      canal,
      publico: "familia",
      imovelSlug: imovel.slug,
      imovelNome: imovel.nome,
      corretorId: corretor.id,
      rodape: `${corretor.nome} · ${linkDeIndicacao(corretor.slug)}`,
      ...copy,
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
